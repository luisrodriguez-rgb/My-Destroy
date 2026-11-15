# My-Destroy — contexto persistente

## Estado Actual del Proyecto (Actualizado)

El proyecto cuenta con una aplicación completamente jugable, modular y testeada en la raíz del repositorio, construida con **React 19**, **TypeScript**, **Vite**, **Phaser 4.2.1** y **Rapier2D (WASM)**, conectada a **Web Audio API** nativa y a un scraper headless con **Playwright**.

### Hitos Implementados y Verificados

1. **Recuperación y Preservación de Identidad**:
   - 17 archivos originales recuperados, comprobados mediante SHA-256 y conservados intactos en `My-Destroy-recuperado/`.
   - Dirección artística fiel: base `#0B1018`, detalles ámbar `#FFB454` y cian `#79E3D8`, tipografía *Pixelify Sans* local.

2. **Destrucción Granular y Reconstrucción en CPU/WebGL (`RegionMask` & `DestructiblePage`)**:
   - Página dividida en regiones cuadradas de 128 px con celdas de 2 px y dithering retro Bayer 4x4.
   - Texturas WebGL dinámicas con transparencia real, ribete carbonizado, brasas incandescentes y refresco diferido por lotes (`flushDirtyRegions`).
   - Borrado rectangular directo `clearRect` sin bucles trigonométricos y reconstrucción estructural mediante `repair(x, y, radius)` que restaura píxeles originales y reactiva plataformas.
   - Atlas dinámico reutilizable (`debris-atlas` de $1024 \times 1024\text{ px}$ con 128 slots de $64 \times 128\text{ px}$) para escombros y glifos sin fugas de memoria WebGL.

3. **Física Rapier2D, Materiales de Pisos, Multicapa y Colapsos (`DebrisManager`, `PlatformController`, `tuning.ts`)**:
   - Cuerpos rígidos en WebAssembly (`@dimforge/rapier2d-compat`) con fractura Delaunay (`delaunator`) en triángulos, cuadriláteros y esquirlas que se apilan sobre plataformas destructibles.
   - Perfiles físicos por material (`PlatformMaterial`: `concrete`, `metal`, `wood`, `glass`, `elastic`, `paper`) parametrizados en `PLATFORM_MATERIALS` (tracción, multiplicador de salto, restitución, fricción, vano máximo y carga máxima de escombros).
   - Apoyo multicapa en cráteres (`sampleFootingStrata`): en losas gruesas ($\ge 10\text{ px}$), la destrucción de la costra superficial permite al personaje descender a estratos internos (`craterDepth`, `y = platform.y + depthOffset`) con inclinación dinámica (`surfaceSlope`), cayendo solo al perforar el espesor completo.
   - Dinámicas de superficie: deslizamiento por inercia en cristal por baja tracción (`vx > 0` residual tras soltar controles) y salto elástico potenciado (`jumpMultiplier = 1.32`, `lastBounceBoost = 1`).
   - Integridad estructural en Rapier2D: detección de sobrecarga de escombros (`checkDebrisOverload`) y colapso de islas aisladas en voladizo en materiales frágiles (`syncPlatforms`), invocando el callback `onPlatformSegmentCollapse` en `FirstScene` para perforar la textura, detonar impacto físico y reproducir crujido de rotura.
   - Desprendimiento tipográfico (`DOMTextManager`) con medición exacta (`measureText`), contador $O(1)$ de glifos desprendidos y colisión caja-círculo.
   - Controlador cinemático con salto, caída voluntaria (<kbd>S</kbd>), detección continua de soporte destructible y **Jetpack propulsor** al mantener <kbd>W</kbd>, <kbd>Espacio</kbd> o Flecha Arriba en el aire.

4. **Arsenal de 5 Armas + Rayo Reparador Nano-Cian (`weapons.ts`, `FirstScene.ts`)**:
   - **01 Pistola**: Semiautomática de precisión (radio de 13 px, cadencia de 180 ms).
   - **02 Escopeta**: Dispersión de 14° con 5 perdigones simultáneos (radio de 8 px por perdigón).
   - **03 Lanzagranadas**: Proyectil parabólico con rebote elástico, espoleta de 1.15 s y cráter de 38 px.
   - **04 Láser Térmico**: Haz continuo con interpolación lineal cada 5 px (cadencia de 35 ms, radio de 8 px).
   - **05 Vórtice**: Singularidad gravitatoria con atracción centrípeta/tangencial en radio de 220 px e implosión de 56 px.
   - **Rayo Reparador Nano-Cian**: Acción secundaria mediante Clic Derecho sostenido, tecla <kbd>E</kbd> o botón `REPARAR [E]` que reconstruye la página y sus colisionadores.

5. **Inyección de Páginas Web y Scraper Blindado (`src/server/scraper.ts`, `vite.config.ts`, `App.tsx`)**:
   - Captura páginas web reales mediante Playwright headless, convierte el árbol DOM en plataformas jugables y bloques desprendibles.
   - Enrutamiento y deep-linking: soporte de parámetro `?url=` para cargar escenarios compartidos, botón de copiado de link con confirmación visual (toast) y presets rápidos enriquecidos (`wikipedia`, `github`, `hackernews`, `mdn`, `demo`).
   - Endpoint HTTP unificado (`GET` y `POST /api/scrape`): soporta parámetro `forceRefresh`, maneja concurrencia con cola acotada y responde código HTTP 429 cuando la cola está saturada.
   - Clasificación inteligente de materiales (`classifyPlatformMaterial`): asigna materiales físicos (`elastic` para botones y controles, `glass` para imágenes/videos, `metal` para barras de navegación/código/tablas, `concrete` para titulares/cabeceras/pies, `wood` para citas/asides/artículos, `paper` para texto y contenedores).
   - División de contenedores altos (`expandTallContainers`): descompone cajas $\ge 60\text{ px}$ y $> 220\text{ px}$ en cornisas caminables de techo y base para evitar que sean descartadas en la poda de plataformas.
   - Poda respetuosa (`prunePlatforms`): preserva barras de navegación de ancho completo (hasta 1040 px) y asegura un espaciado vertical mínimo de 42 px.
   - Seguridad y resiliencia anti-SSRF: caché DNS (`assertPublicHostname`), bloqueo de rangos privados/locales/metadata IPv4 e IPv6, y fallback HTML seguro sin navegador (`fetchHtmlFallbackPage`) que extrae estructura, titulares y bloques ante timeouts o indisponibilidad de Chromium.

6. **Audio Procedural y Controles Táctiles Móviles (`ShotAudio.ts`, `App.tsx`)**:
   - Síntesis en tiempo real con Web Audio API para las 5 armas, el siseo del jetpack (`jetpackHiss`), el crujido de colapso de plataformas (`debrisCrack`) y el pulso armónico de reparación (`repairPulse`).
   - Cruceta táctil responsiva (`◀`, `▶`, `▲`, `▼`), barra de acciones móviles, selector de presets y botón de reparación para pantallas táctiles.

7. **Batería de Pruebas Automatizadas y Build Optimizado**:
   - **59 pruebas unitarias en Vitest** (máscaras, borrado directo, reparación, cinemática multicapa, deslizamiento en cristal, salto elástico, colapsos por sobrecarga e islas Rapier2D, glifos tipográficos, armas, clasificación de materiales DOM, expansión de contenedores y seguridad SSRF/caché/presets del scraper).
   - **4 suites E2E en Playwright** (`scene.spec.ts`, `scraper.spec.ts`, `capture.spec.ts`, `stress.spec.ts`).
   - Separación de chunks en Vite (`phaser`, `rapier`, `createGame`, `index`).

---

## Objetivo Global del Proyecto

Simulador interactivo de deconstrucción y reconstrucción web inspirado conceptualmente en *Destroy Any Website*: cargar una página web (demo o URL real), convertir su DOM y tipografía en un escenario físico 2D y demolerlo o reconstruirlo con armas balísticas, láseres, anomalías gravitatorias y rayos nano-reparadores.

Repositorio oficial: [luisrodriguez-rgb/My-Destroy](https://github.com/luisrodriguez-rgb/My-Destroy).
