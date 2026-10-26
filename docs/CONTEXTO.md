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

3. **Física Rapier2D, Deconstrucción Tipográfica y Jetpack (`DebrisManager`, `DOMTextManager`, `PlatformController`)**:
   - Cuerpos rígidos en WebAssembly (`@dimforge/rapier2d-compat`) con fractura Delaunay (`delaunator`) en triángulos, cuadriláteros y esquirlas que se apilan sobre plataformas destructibles.
   - Desprendimiento tipográfico (`DOMTextManager`) con medición exacta (`measureText`), contador $O(1)$ de glifos desprendidos y colisión caja-círculo.
   - Controlador cinemático con salto, caída voluntaria (<kbd>S</kbd>), detección continua de soporte destructible y **Jetpack propulsor** al mantener <kbd>W</kbd>, <kbd>Espacio</kbd> o Flecha Arriba en el aire.

4. **Arsenal de 5 Armas + Rayo Reparador Nano-Cian (`weapons.ts`, `FirstScene.ts`)**:
   - **01 Pistola**: Semiautomática de precisión (radio de 13 px, cadencia de 180 ms).
   - **02 Escopeta**: Dispersión de 14° con 5 perdigones simultáneos (radio de 8 px por perdigón).
   - **03 Lanzagranadas**: Proyectil parabólico con rebote elástico, espoleta de 1.15 s y cráter de 38 px.
   - **04 Láser Térmico**: Haz continuo con interpolación lineal cada 5 px (cadencia de 35 ms, radio de 8 px).
   - **05 Vórtice**: Singularidad gravitatoria con atracción centrípeta/tangencial en radio de 220 px e implosión de 56 px.
   - **Rayo Reparador Nano-Cian**: Acción secundaria mediante Clic Derecho sostenido, tecla <kbd>E</kbd> o botón `REPARAR [E]` que reconstruye la página y sus colisionadores.

5. **Scraper Headless Blindado (`src/server/scraper.ts`, `vite.config.ts`)**:
   - Captura páginas web reales (Wikipedia, sitios editoriales) y convierte sus cajas DOM en plataformas y bloques desprendibles.
   - Protección anti-SSRF con resolución DNS previa contra DNS rebinding (bloqueo de rangos privados IPv4/IPv6), intercepción de sub-peticiones en Playwright, límite de payload (4 KB), cola de concurrencia (máx. 2 instancias) y caché LRU en memoria.
   - Habilitado tanto en `npm run dev` como en `npm run preview`.

6. **Audio Procedural y Controles Táctiles Móviles (`ShotAudio.ts`, `App.tsx`)**:
   - Síntesis en tiempo real con Web Audio API para las 5 armas, el siseo del jetpack (`jetpackHiss`) y el pulso armónico de reparación (`repairPulse`).
   - Cruceta táctil responsiva (`◀`, `▶`, `▲`, `▼`) y botón de reparación para pantallas táctiles.

7. **Batería de Pruebas Automatizadas y Build Optimizado**:
   - **42 pruebas unitarias en Vitest** (máscaras, borrado directo, reparación, cinemática, físicas Rapier2D, glifos, armas y seguridad SSRF/caché del scraper).
   - **4 suites E2E en Playwright** (`scene.spec.ts`, `scraper.spec.ts`, `capture.spec.ts`, `stress.spec.ts`).
   - Separación de chunks en Vite (`phaser`, `rapier`, `createGame`, `index`).

---

## Objetivo Global del Proyecto

Simulador interactivo de deconstrucción y reconstrucción web inspirado conceptualmente en *Destroy Any Website*: cargar una página web (demo o URL real), convertir su DOM y tipografía en un escenario físico 2D y demolerlo o reconstruirlo con armas balísticas, láseres, anomalías gravitatorias y rayos nano-reparadores.

Repositorio oficial: [luisrodriguez-rgb/My-Destroy](https://github.com/luisrodriguez-rgb/My-Destroy).
