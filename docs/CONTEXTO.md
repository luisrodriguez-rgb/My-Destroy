# My-Destroy — contexto persistente

## Estado Actual del Proyecto (Actualizado)

El proyecto cuenta con una aplicación completamente jugable, modular y testeada en la raíz del repositorio, construida con **React 19**, **TypeScript**, **Vite**, **Phaser 4.2.1** y **Rapier2D (WASM)**, conectada a **Web Audio API** nativa y a un scraper headless con **Playwright**.

### Hitos Implementados y Verificados

1. **Recuperación y Preservación de Identidad**:
   - 17 archivos originales recuperados, comprobados mediante SHA-256 y conservados intactos en `My-Destroy-recuperado/`.
   - Dirección artística fiel: base `#0B1018`, detalles ámbar `#FFB454` y cian `#79E3D8`, tipografía *Pixelify Sans* local.

2. **Destrucción Granular y Reconstrucción en CPU/WebGL (`RegionMask` & `DestructiblePage`)**:
   - Página dividida en regiones cuadradas de 128 px con celdas de 2 px y dithering retro Bayer 4x4.
   - **Bordes de cráter paramétricos (`ditherWidth`)**: el ancho de la corona de disolución Bayer se modula por arma (desde 2 px en el láser hasta 7 px en la singularidad), propagado desde `WeaponConfig` a través de `DestructiblePage.damage` a `RegionMask`.
   - Texturas WebGL dinámicas con transparencia real, ribete carbonizado, brasas incandescentes y refresco diferido por lotes (`flushDirtyRegions`).
   - Borrado rectangular directo `clearRect` sin bucles trigonométricos y reconstrucción estructural mediante `repair(x, y, radius)` que restaura píxeles originales y reactiva plataformas.
   - Atlas dinámico reutilizable (`debris-atlas` de $1024 \times 1024\text{ px}$ con 128 slots de $64 \times 128\text{ px}$) para escombros y glifos sin fugas de memoria WebGL.

3. **Física Rapier2D, Materiales de Pisos, Multicapa, Colapsos y Retroceso (`DebrisManager`, `PlatformController`, `tuning.ts`)**:
   - Cuerpos rígidos en WebAssembly (`@dimforge/rapier2d-compat`) con fractura Delaunay (`delaunator`) en triángulos, cuadriláteros y esquirlas que se apilan sobre plataformas destructibles.
   - Perfiles físicos por material (`PlatformMaterial`: `concrete`, `metal`, `wood`, `glass`, `elastic`, `paper`) parametrizados en `PLATFORM_MATERIALS` (tracción, multiplicador de salto, restitución, fricción, vano máximo y carga máxima de escombros).
   - Apoyo multicapa en cráteres (`sampleFootingStrata`): en losas gruesas ($\ge 10\text{ px}$), la destrucción de la costra superficial permite al personaje descender a estratos internos (`craterDepth`, `y = platform.y + depthOffset`) con inclinación dinámica (`surfaceSlope`), cayendo solo al perforar el espesor completo.
   - Dinámicas de superficie: deslizamiento por inercia en cristal por baja tracción (`vx > 0` residual tras soltar controles) y salto elástico potenciado (`jumpMultiplier = 1.32`, `lastBounceBoost = 1`).
   - **Retroceso físico del operador e impulso balístico (`PlatformController.applyRecoil`)**: el retroceso balístico acumulado en `recoilVx` desliza al personaje y decae según la tracción del suelo (disipación rápida en metal/concreto a 680 px/s², lenta en vidrio a 260 px/s² y suave en el aire a 220 px/s²). Los disparos hacia abajo con impulso vertical pesado (`impulseVy < -35`) elevan al personaje en un salto balístico reactivo (*rocket jump*), permitiendo ascender o amortiguar caídas.
   - Integridad estructural en Rapier2D: detección de sobrecarga de escombros (`checkDebrisOverload`) y colapso de islas aisladas en voladizo en materiales frágiles (`syncPlatforms`), invocando el callback `onPlatformSegmentCollapse` en `FirstScene` para perforar la textura, detonar impacto físico y reproducir crujido de rotura.
   - Desprendimiento tipográfico (`DOMTextManager`) con medición exacta (`measureText`), contador $O(1)$ de glifos desprendidos y colisión caja-círculo.
   - Controlador cinemático con salto, caída voluntaria (<kbd>S</kbd>), detección continua de soporte destructible y **Jetpack propulsor** al mantener <kbd>W</kbd>, <kbd>Espacio</kbd> o Flecha Arriba en el aire.

4. **Arsenal de 5 Armas con Balística de Materiales, Calor y Metralla (`weapons.ts`, `FirstScene.ts`)**:
   - **Balística diferenciada por material (`materialMultipliers` y `computeEffectiveDamageRadius`)**: el radio destructivo efectivo se modula en tiempo real según el material impactado (vidrio frágil sufre hasta 1.45× de radio ante escopeta/pistola; metal y concreto resisten al daño cinético convencional con 0.72×–0.85×; papel y madera sufren 1.35× y 1.25× ante el láser térmico).
   - **01 Pistola**: Semiautomática de precisión (radio base 13 px, cadencia 180 ms, PWR 32, dither 4 px, retroceso fino de 28 px/s).
   - **02 Escopeta**: Dispersión pesada de 14° con 5 perdigones simultáneos (radio base 8 px por perdigón, PWR 20×5, retroceso 155 px/s, dither 5 px). Modulación por distancia: mayor impacto a corta distancia ($\le 140\text{ px}$, hasta +22%) y decaimiento en trayectos largos ($> 180\text{ px}$).
   - **03 Lanzagranadas**: Proyectil parabólico con rebote elástico, mecha de 1.15 s y detonación principal de 38 px (PWR 145, dither 6 px). **Metralla táctica secundaria**: al detonar genera 5 submuniciones radiales deterministas (`generateClusterImpacts`), causando impactos secundarios de 15 px, fragmentación y sonido `clusterPop`.
   - **04 Láser Térmico**: Haz continuo a 35 ms con interpolación geométrica y **acumulación de calor (`laserHeat`)**: el uso prolongado acumula temperatura de 0 a 100%, incrementando el radio de daño hasta un +75% (`chargeFactor`), expandiendo y cambiando el retículo a magenta incandescente (`#ff2a85`) y modulando dinámicamente la síntesis acústica en tono y resonancia.
   - **05 Vórtice**: Singularidad gravitatoria viva con atracción en radio de 220 px e implosión de 56 px (PWR 230, retroceso 220 px/s, dither 7 px). **Erosión en vuelo**: durante su desplazamiento erosiona cráteres continuos cada 90 ms (`erodeTimer`, radio 10 px) antes de contraerse y liberar su supernova terminal.
   - **Rayo Reparador Nano-Cian**: Acción secundaria mediante Clic Derecho sostenido, tecla <kbd>E</kbd> o botón `REPARAR [E]` que reconstruye la página y sus colisionadores.

5. **Dinámica Arcade, Telemetría HUD y Efectos Visuales (`FirstScene.ts`, `App.tsx`, `bridge.ts`)**:
   - **Casquillos expulsados (`casings`)**: cada disparo mecánico expulsa un casquillo metálico (latón, cobre, cian cibernético) con velocidad física, rotación y rebote sobre plataformas antes de desvanecerse.
   - **Ondas de choque expansivas (`shockwaves`)**: anillos circulares translúcidos de atenuación rápida generados en disparos de escopeta, detonaciones de granada, colapso de plataformas y supernovas de vórtice.
   - **Sistema de combos y textos flotantes (`popups`)**: encadenamiento de impactos destructivos en ventana de 2.4 s con popups dinámicos (`COMBO xN`, `¡CRÍTICO!`, `¡COLAPSO!`, `¡SINGULARIDAD!`), chime procedural ascendente (`comboChime`) y badge en el HUD (`🔥 COMBO xN`).
   - **Telemetría viva en el HUD de React**:
     - Badge de material activo con profundidad de cráter (`🧱 METAL`, `cráter 8px`).
     - Badge de combo activo (`🔥 COMBO x3`).
     - Barra de calor del láser continuo con alerta visual al superar el 75% (`⚡ CALOR 85%`).
     - Micro-etiquetas de potencia y comportamiento balístico en los botones de selección del arsenal.
     - Cruceta táctil responsiva (`◀`, `▶`, `▲`, `▼`) y botón de reparación móvil para pantallas táctiles.

6. **Inyección de Páginas Web y Scraper Blindado (`src/server/scraper.ts`, `vite.config.ts`, `App.tsx`)**:
   - Captura páginas web reales mediante Playwright headless, convierte el árbol DOM en plataformas jugables y bloques desprendibles.
   - Enrutamiento y deep-linking: soporte de parámetro `?url=` para cargar escenarios compartidos, botón de copiado de link con confirmación visual (toast) y presets rápidos enriquecidos (`wikipedia`, `github`, `hackernews`, `mdn`, `demo`).
   - Endpoint HTTP unificado (`GET` y `POST /api/scrape`): soporta parámetro `forceRefresh`, maneja concurrencia con cola acotada y responde código HTTP 429 cuando la cola está saturada.
   - Clasificación inteligente de materiales (`classifyPlatformMaterial`): asigna materiales físicos (`elastic` para botones y controles, `glass` para imágenes/videos, `metal` para barras de navegación/código/tablas, `concrete` para titulares/cabeceras/pies, `wood` para citas/asides/artículos, `paper` para texto y contenedores).
   - División de contenedores altos (`expandTallContainers`): descompone cajas $\ge 60\text{ px}$ y $> 220\text{ px}$ en cornisas caminables de techo y base para evitar que sean descartadas en la poda de plataformas.
   - Poda respetuosa (`prunePlatforms`): preserva barras de navegación de ancho completo (hasta 1040 px) y asegura un espaciado vertical mínimo de 42 px.
   - Seguridad y resiliencia anti-SSRF: caché DNS (`assertPublicHostname`), bloqueo de rangos privados/locales/metadata IPv4 e IPv6, y fallback HTML seguro sin navegador (`fetchHtmlFallbackPage`) que extrae estructura, titulares y bloques ante timeouts o indisponibilidad de Chromium.

7. **Audio Procedural Sintetizado (`ShotAudio.ts`)**:
   - Síntesis en tiempo real con Web Audio API:
     - Disparos de percusión y retroceso balístico.
     - Haz de láser térmico con modulación de frecuencia y filtro pasobanda proporcional al nivel de calor (`laserPulse(hit, heatFactor)`).
     - Detonaciones secundarias y crujido de metralla (`clusterPop`).
     - Sonido armónico de combo con escalamiento de semitonos (`comboChime`).
     - Siseo del jetpack (`jetpackHiss`), crujido de colapso de plataformas (`debrisCrack`) y pulso armónico de reparación (`repairPulse`).
     - Anomalía de singularidad cósmica: silbido de lanzamiento (`vortexLaunch`), pulso grave gravitatorio (`vortexHum`) e implosión terminal de vacío (`vortexImplosion`).

8. **Batería de Pruebas Automatizadas y Build Optimizado**:
   - **81 pruebas unitarias en Vitest** (máscaras, borrado directo, dither paramétrico, reparación, cinemática multicapa, deslizamiento en cristal, impulso de retroceso y salto balístico, colapsos por sobrecarga e islas Rapier2D, glifos tipográficos, balística por material, dispersión de escopeta, metralla de granadas, clasificación DOM, expansión de contenedores y seguridad SSRF/caché).
   - **4 suites E2E en Playwright** (`scene.spec.ts`, `scraper.spec.ts`, `capture.spec.ts`, `stress.spec.ts`).
   - Separación de chunks en Vite (`phaser`, `rapier`, `createGame`, `index`).

---

## Objetivo Global del Proyecto

Simulador interactivo de deconstrucción y reconstrucción web inspirado conceptualmente en *Destroy Any Website*: cargar una página web (demo o URL real), convertir su DOM y tipografía en un escenario físico 2D y demolerlo o reconstruirlo con armas balísticas, láseres, anomalías gravitatorias y rayos nano-reparadores.

Repositorio oficial: [luisrodriguez-rgb/My-Destroy](https://github.com/luisrodriguez-rgb/My-Destroy).
