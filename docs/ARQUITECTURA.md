# Arquitectura Técnica de My-Destroy

Este documento describe la arquitectura modular implementada en el proyecto, detallando la interacción entre la interfaz de usuario en **React 19**, el motor de juego en **Phaser 4.2.1**, el subsistema de destrucción por regiones en CPU con bordes paramétricos, el controlador cinemático con retroceso físico y salto balístico, el motor de escombros rígidos en **Rapier2D (WASM)**, el arsenal con balística por material y la síntesis de audio procedural.

---

## 1. Diagrama de Alto Nivel

```
┌─────────────────────────────────────────────────────────────┐
│                    REACT 19 (App.tsx)                       │
│  - Shell de navegador ficticio   - Toolbar del arsenal      │
│  - Medidor de destrucción (%)    - Gestión de preferencias  │
│  - Telemetría HUD en vivo:                                  │
│    * Material y profundidad      * Multiplicador de combo   │
│    * Calor térmico del láser     * Etiquetas de potencia    │
└───────────────────────────┬─────────────────────────────────┘
                            │ bridge.ts (SceneControls / SceneStats)
┌───────────────────────────▼─────────────────────────────────┐
│                   PHASER 4 (createGame.ts)                  │
│                                                             │
│  FirstScene.ts                                              │
│  ├── PlatformController.ts ◄──► RegionMask (CPU Ocupación)  │
│  │   ├── Soporte multicapa en cráteres (sampleFootingStrata)│
│  │   ├── Deslizamiento por tracción según material          │
│  │   └── Retroceso físico e impulso balístico (applyRecoil) │
│  │                                                          │
│  ├── DebrisManager.ts (Rapier2D WASM + Delaunator)          │
│  │   ├── Fractura triangular, cuadriláteros y esquirlas     │
│  │   └── Colapso por sobrecarga de peso y voladizos         │
│  │                                                          │
│  ├── DestructiblePage.ts (Canvas Textures por regiones)     │
│  │   └── RegionMask.ts (Bayer 4×4 + ditherWidth paramétrico)│
│  │                                                          │
│  ├── Weapons System (weapons.ts / types.ts)                 │
│  │   ├── Balística por material (materialMultipliers)       │
│  │   ├── Radio efectivo dinámico (distancia / calor / mat)  │
│  │   ├── Cálculo de retroceso físico (computeKnockbackVector)│
│  │   ├── Pistola (Hitscan puntual de alta precisión)        │
│  │   ├── Escopeta (Cono de perdigones + dispersión radial)  │
│  │   ├── Granadas (Balística + metralla anular determinista)│
│  │   ├── Láser Térmico (Haz continuo + sobrecalentamiento)  │
│  │   └── Vórtice (Atracción gravitatoria + erosión en vuelo)│
│  │                                                          │
│  ├── Feedback Arcade y Efectos Visuales                     │
│  │   ├── Casquillos de munición con rebote (casings)        │
│  │   ├── Ondas expansivas translúcidas (shockwaves)         │
│  │   ├── Textos flotantes y contador de combo (popups)      │
│  │   └── Retículo dinámico expansivo reactivo al calor      │
│  │                                                          │
│  └── ShotAudio.ts (Web Audio API procedural sintetizado)     │
│      ├── Disparos mecánicos y explosiones de baja frecuencia │
│      ├── Láser modulado por calor (frecuencia + filtro Q)   │
│      ├── Detonación de metralla/submuniciones (clusterPop)   │
│      └── Chime armónico progresivo de combo (comboChime)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Responsabilidades por Módulo

### A. Capa de Aplicación e Interfaz (`src/app/`)
- **`App.tsx`**: Renderiza el marco de navegador simulado, la barra de URL interactiva, el porcentaje de destrucción global y la barra de selección de armas (`arsenal-slots`). Muestra telemetría arcade viva:
  - **Badge de material activo (`hud-material`)**: indica el sustrato bajo las botas del operario (`concreto`, `metal`, `madera`, `vidrio`, `elástico`, `papel`) y la cota de profundidad en cráteres (`cráter 8px`).
  - **Badge de racha/combo (`hud-combo`)**: destaca combos $\ge 2$ con animación ámbar brillante.
  - **Medidor térmico de láser (`hud-heat`)**: barra dinámica de calentamiento con advertencia cromática (`is-hot` a partir del 75%).
  - **Micro-etiquetas balísticas (`weapon-micro-tag`)**: indican potencia y rol táctico (`PWR 32 · PRECISIÓN`, `PWR 20×5 · CONO`, `PWR 145 · METRALLA`, `PWR 24/s · TÉRMICO`, `PWR 230 · ATRACCIÓN`).
- **`styles.css`**: Estilo industrial retro-futurista (`#0B1018`, ámbar `#FFB454`, cian `#79E3D8`), layout adaptativo móvil y controles táctiles integrados.

### B. Puente Tipado (`src/game/bridge.ts`)
- Desacopla React y Phaser con interfaces estrictas:
  - `SceneControls`: permite reiniciar (`reset`), pausar (`setPaused`), actualizar opciones (`setPreferences`), cambiar arma (`setWeapon`) y enfocar canvas (`focus`).
  - `SceneStats`: emite métricas en tiempo real (`shots`, `hits`, `percent`, `paused`, `ready`, `weapon`, `currentMaterial`, `craterDepth`, `combo`, `laserHeat`).
- `window.__MY_DESTROY__` expone controles y estadísticas para pruebas automatizadas E2E.

### C. Subsistema de Destrucción y Dithering (`src/game/destruction/`)
- **`RegionMask.ts`**:
  - Matriz en memoria de CPU de 1152 × 584 px con resolución de celda de 2 px particionada en bloques de 128 px.
  - Al recibir una detonación en $(X, Y)$ con radio $R$ y ancho de dithering `ditherWidth`:
    - Celdas con distancia euclidiana $r \le R$ se destruyen completamente.
    - Celdas en la corona exterior $R < r \le R + \text{ditherWidth}$ se evalúan contra la matriz Bayer 4×4 según un umbral de densidad lineal decreciente, produciendo un borde pixelado orgánico y retro.
- **`DestructiblePage.ts`**:
  - Renderiza texturas por lotes y aplica efectos de borde en la página: carbonización perimetral oscura (`#17110dee`), resplandor quemado (`#3c241566`) y partículas de brasa incandescente (`#ff6b00ee`).
  - Propaga `ditherWidth` desde la configuración del arma activa (`damage(x, y, radius, seed, deferRefresh, ditherWidth)`).
  - Admite reconstrucción selectiva mediante `repair(x, y, radius)`, restaurando píxeles del DOM original y reactivando la pisada en plataformas.

### D. Físicas Cinemáticas del Operador y Retroceso (`src/game/physics/PlatformController.ts`)
- **Control cinemático híbrido**:
  - Consulta soporte sobre la pasarela indestructible (`floorY = 530`) y los pisos destructibles.
  - **Muestreo estratificado en cráteres (`sampleFootingStrata`)**: en plataformas gruesas ($\ge 10\text{ px}$), el personaje desciende al lecho interior del cráter (`craterDepth`) e inclina su postura según el desnivel entre apoyos (`surfaceSlope`), cayendo solo al perforarse la base completa.
  - **Inercia por tracción**: en superficies resbaladizas (vidrio con `traction < 0.6`), conserva velocidad horizontal al soltar el control.
  - **Rebote elástico y propulsión jetpack**: multiplicador de salto de 1.32× en plataformas elásticas y ascenso libre mantenido con <kbd>W</kbd>/<kbd>Espacio</kbd>/Flecha Arriba (`jetpackThrust = 1720 px/s²`).
- **Retroceso balístico físico (`applyRecoil`)**:
  - `impulseVx`: se acumula en `recoilVx` (acotado a $\pm 420\text{ px/s}$) y se disipa progresivamente según la tracción de la superficie de apoyo (680 px/s² en concreto/metal, 260 px/s² en vidrio resbaladizo, 220 px/s² en caída libre).
  - `impulseVy`: ante disparos descendentes intensos (`impulseVy < -35`), despega al personaje del suelo en un **salto balístico reactivo** (*rocket jump*) con velocidad vertical inicial de hasta $-560\text{ px/s}$; en el aire, suaviza trayectorias descendentes permitiendo planear o amortiguar caídas.

### E. Físicas de Cuerpos Rígidos y Colapsos en Rapier2D (`src/game/physics/DebrisManager.ts`)
- Simulación física determinista WASM vía `@dimforge/rapier2d-compat`:
  - Descompone fragmentos destruidos en triángulos Delaunay, cuadriláteros y esquirlas alargadas que se apilan físicamente sobre el suelo y las cornisas.
  - Límite de capacidad dinámico (`maxDebris = 120`) con reciclaje continuo para preservar 60 FPS estables.
  - **Colapso estructural por sobrecarga (`checkDebrisOverload`)**: si la acumulación de escombros en un segmento excede su `maxLoad` de material, el colisionador colapsa y precipita los restos.
  - **Colapso de islas en voladizo (`syncPlatforms`)**: detecta cornisas frágiles sin apoyo lateral suficiente y las derriba de forma procedural.

### F. Arsenal de Armas y Balística por Material (`src/game/weapons/`)
- **`types.ts` y `weapons.ts`**:
  - Cada arma (`WeaponConfig`) define: `damagePower`, `knockback`, `blastForce`, `ditherWidth`, `shakeIntensity`, `shakeDuration`, multiplicadores por material (`materialMultipliers`) y submuniciones (`clusterCount`, `clusterRadius`).
  - **`computeEffectiveDamageRadius(weaponId, baseRadius, options)`**:
    - Ajusta el radio multiplicando por `materialMultipliers[material]` (e.g. vidrio sufre $1.35\times$ a $1.45\times$; metal reduce a $0.72\times$–$0.75\times$; papel y madera arden a $1.25\times$–$1.35\times$ con láser).
    - En escopeta: aplica curva de dispersión según distancia euclidiana ($\le 140\text{ px}$ mayor concentración de energía, $> 180\text{ px}$ atenuación).
    - En láser: escala el radio proporcionalmente al nivel de calentamiento continuo (`1 + chargeFactor * 0.75`).
  - **`computeKnockbackVector(aimAngle, weaponId, onGround, surfaceTraction)`**:
    - Calcula el vector de retroceso opuesto al ángulo de tiro ($-\cos\theta, -\sin\theta$), amplificando el deslizamiento en suelos resbaladizos ($1.35\times$) y el empuje vertical en el aire ($1.25\times$).
  - **`generateClusterImpacts(originX, originY, count, ringRadius, seed)`**:
    - Genera coordenadas para la dispersión de metralla en una corona perimetral determinista con ligera perturbación pseudoaleatoria basada en semilla.

### G. Dinámica de Escena, Efectos Arcade y Combos (`src/game/scenes/FirstScene.ts`)
- **Bucle de disparo y retroceso**:
  - Al disparar, transmite el vector de retroceso a `controller.applyRecoil` y activa el temblor de cámara (`cameras.main.shake`).
  - **Eyección de casquillos mecánicos (`ejectCasing`)**: genera casquillos con velocidad lateral, gravedad, rebote en pasarelas y giro balístico.
  - **Ondas expansivas circulares (`spawnShockwave`)**: expande anillos con atenuación alfa y grosor de línea dinámico tras impactos de escopeta, detonación de granada, colapsos y supernovas de vórtice.
  - **Gestión térmica del láser continuo (`laserHeat`)**: el haz continuo eleva el calor a razón de $0.68/\text{s}$ (enfriándose a $0.90/\text{s}$ al cesar), modificando el retículo a tonalidades magenta (`#ff2a85`) y agrandando el diámetro de corte.
  - **Erosión en tránsito del vórtice (`erodeTimer`)**: mientras viaja hacia su destino, la singularidad esculpe pequeños cráteres (10 px) cada 90 ms a lo largo de su trayectoria antes de colapsar en su implosión masiva (56 px).
  - **Sistema de combos y textos flotantes (`spawnPopup`)**: impactos consecutivos en ventana de 2.4 s acumulan multiplicador (`comboCount`), activan el chime musical y muestran indicadores emergentes (`COMBO xN`, `¡CRÍTICO!`, `¡COLAPSO!`, `¡SINGULARIDAD!`).

### H. Síntesis Sonora Procedural (`src/game/audio/ShotAudio.ts`)
- Generación de audio nativo mediante Web Audio API sin assets externos:
  - Disparo de pistola y descarga de escopeta con osciladores percusivos y filtros exponenciales.
  - Detonación explosiva con retumbe en paso-bajo.
  - **Láser térmico interactivo (`laserPulse(hit, heatFactor)`)**: modula la frecuencia inicial (subiendo de 680–880 Hz hasta 1120–1320 Hz con calor máximo) y eleva la frecuencia de corte del filtro pasobanda (de 1400 Hz a 3050 Hz) junto con una mayor resonancia $Q$.
  - **Estallido de metralla (`clusterPop`)**: ráfaga de ruido blanco pasobanda combinada con un chasquido triangular rápido para simular la fragmentación secundaria.
  - **Chime de combo (`comboChime(comboLevel)`)**: genera tonos senoidales armónicos modulados que ascienden en escala de semitonos ($480 \times 1.06^{\text{step}}$ Hz).
  - Siseo del jetpack (`jetpackHiss`), crujido de rotura de pisos (`debrisCrack`), y pulso melódico de reparación (`repairPulse`).
  - Ciclo cósmico de vórtice: silbido gravitatorio (`vortexLaunch`), pulso grave del disco de acreción (`vortexHum`) e implosión de supernova (`vortexImplosion`).

### I. Deconstrucción y Fractura de Texto DOM (`src/game/text/DOMTextManager.ts`)
- Mapea líneas tipográficas (`TextRunInput`) en cajas envolventes con anchos métricos proporcionales para cada glifo visible.
- **Desprendimiento físico por impacto (`splitOnImpact`)**: calcula la intersección entre el círculo de impacto y la caja delimitadora (*bounding box*) de cada glifo, asegurando que cualquier disparo que roce una letra (sin importar su tamaño o escala) la desprenda limpiamente.
- **Borrado de la superficie (`surface.clearArea`)**: elimina la silueta del carácter en la textura de papel para evitar glifos fantasma duplicados, descubriendo el sustrato digital interactivo.
- **Cuerpos rígidos dinámicos en Rapier2D (`spawnLetterDebris`)**: proyecta las letras con impulso radial, elevación y torque de rotación con colisionadores cuboid y detección continua de colisiones (CCD), posándose y rebotando sobre pasarelas y plataformas.
- **Interacción gravitacional**: las letras libres responden a `applyVortexPull()`, orbitando en espiral hacia el centro del vórtice antes de su desintegración.

### J. Inyección de Páginas y Scraper Blindado (`src/server/scraper.ts`, `vite.config.ts`, `App.tsx`)
- **Captura Dual (Playwright / Fallback HTML)**:
  - Captura páginas web en vivo mediante Chromium headless (`capturePagePng`, limpieza de popups/modales de consentimiento, renderizado a $1104 \times 488\text{ px}$ en viewport y hasta 4 pliegues).
  - Fallback HTML seguro (`fetchHtmlFallbackPage`): en caso de timeout, ausencia de Chromium o entornos sin soporte de renderizado, descarga el HTML público (siguiendo hasta 5 redirecciones públicas), extrae etiquetas (`extractHtmlItems`), sintetiza el layout (`layoutHtmlItems`) y genera plataformas y textos sin ejecutar scripts de terceros.
- **Clasificación y Adaptación de Geometría DOM**:
  - `classifyPlatformMaterial(cand)`: asocia elementos HTML a materiales físicos (`elastic` para botones y controles, `glass` para imágenes y videos, `metal` para barras de navegación, código y tablas, `concrete` para cabeceras y títulos principales, `wood` para bloques editoriales y citas, `paper` para texto plano).
  - `expandTallContainers(candidates)`: transforma contenedores altos ($> 220\text{ px}$) en cornisas caminables de techo y base para mantener transitable la página sin generar muros infranqueables.
  - `prunePlatforms(candidates)`: filtra solapamientos, impone un espaciado vertical mínimo de 42 px y preserva barras de navegación de ancho completo (hasta 1040 px).
- **Seguridad SSRF y Caché**:
  - `validateUrlTarget(url)`: rechaza esquemas no-HTTP, credenciales incrustadas y destinos localhost o de red interna.
  - `assertPublicHostname(host)`: valida los registros DNS contra rangos privados, CGNAT, link-local, multicast e IP de metadatos de nube, utilizando una caché de seguridad DNS (`dnsSafetyCache`) con TTL de 5 minutos.
- **Presets Editoriales y Deep-Linking**:
  - Presets preconfigurados y optimizados (`wikipedia`, `github`, `hackernews`, `mdn`, `demo`) con `renderMode: 'preset'` y desglose de materiales (`materialSummary`).
  - Deep-linking mediante parámetro de consulta `?url=`, actualización de historial con `replaceState` y botón para copiar enlace con confirmación visual.
  - Endpoint de servidor `/api/scrape` accesible vía `POST` y `GET` (con soporte para `forceRefresh`), cola de espera para scraping concurrente y código HTTP 429 ante sobrecarga.
