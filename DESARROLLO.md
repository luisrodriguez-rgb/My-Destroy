# My-Destroy — Guía de Desarrollo y Ejecución

Aplicación local desarrollada con **React 19**, **TypeScript**, **Vite**, **Phaser 4.2.1** y **Rapier2D (WASM)**. La carpeta `My-Destroy-recuperado/` se preserva intacta con sus 17 archivos de referencia.

---

## Arranque Rápido

Entorno de ejecución probado: **Node 24.15.0** y **npm 11.12.1** (compatible con Node >= 20).

```bash
# Instalar dependencias exactas
npm ci

# Iniciar servidor local de desarrollo
npm run dev
```

Abrir <http://127.0.0.1:5173/> en el navegador. La aplicación es totalmente autónoma para la escena base y el modo offline; además incluye el endpoint `/api/scrape` (activo en `dev` y `preview`) para capturar páginas web reales con Playwright.

---

## Controles del Juego

| Acción | Control |
| --- | --- |
| **Apuntar** | Ratón o toque sobre el lienzo (retícula adaptada por arma) |
| **Disparar / Cortar** | Clic izquierdo o toque (mantener para láser térmico continuo) |
| **Rayo Reparador Nano-Cian** | Clic derecho sostenido, tecla <kbd>E</kbd> o botón `REPARAR [E]` |
| **Moverse** | <kbd>A</kbd> / <kbd>D</kbd>, Flechas Izquierda / Derecha o botones táctiles `◀` / `▶` |
| **Saltar / Jetpack** | <kbd>W</kbd>, <kbd>Espacio</kbd>, Flecha Arriba o botón táctil `▲` (mantener en el aire para propulsar) |
| **Descender de plataforma** | <kbd>S</kbd>, Flecha Abajo o botón táctil `▼` |
| **Cambiar de arma** | <kbd>1</kbd> Pistola, <kbd>2</kbd> Escopeta, <kbd>3</kbd> Granadas, <kbd>4</kbd> Láser, <kbd>5</kbd> Vórtice, rueda del ratón o dock |
| **Reiniciar escenario** | <kbd>R</kbd> o botón *Reiniciar* |
| **Silenciar sonido** | <kbd>M</kbd> o botón de volumen |
| **Pausa** | <kbd>Escape</kbd> o botón de pausa |
| **Reducir efectos** | Botón *Efectos suaves* |

> **Comportamiento del foco:** Hacer clic en el escenario otorga el foco de teclado al juego. Si la ventana pierde el foco, el juego se pausa automáticamente y libera cualquier tecla retenida para evitar derivas de movimiento. El contexto de audio se activa tras la primera interacción de disparo.

---

## Subsistemas Implementados

1. **Destrucción Granular y Reconstrucción por Máscara en CPU (`RegionMask`, `DestructiblePage`)**:
   - Cuadrícula de regiones cuadradas de 128 px con celdas de 2 px y dithering Bayer 4x4.
   - Texturas WebGL perforadas dinámicamente con refresco diferido por lotes (`flushDirtyRegions`), carbonización perimetral y brasas.
   - Borrado rectangular directo (`clearRect`) para bloques DOM desprendidos y reconstrucción nano-cian (`repair`) que restaura la imagen original y el porcentaje de integridad.
   - Atlas dinámico único (`debris-atlas` de $1024 \times 1024\text{ px}$) para renderizar escombros y glifos sin crear ni destruir texturas WebGL individuales.

2. **Física Rapier2D, Fractura Delaunay y Plataformas (`DebrisManager`, `PlatformController`)**:
   - Simulación de cuerpos rígidos en WebAssembly (`@dimforge/rapier2d-compat`) con triangulación Delaunay (`delaunator`) de triángulos, cuadriláteros y esquirlas.
   - 7 plataformas geométricas semi-sólidas (*one-way*) cuyos colisionadores se desactivan al demolerse (>80 % de daño) y se reactivan automáticamente al ser reparadas con el rayo nano-cian.
   - Modelo cinemático con salto, *coyote time* (100 ms), *jump buffer* (120 ms) y **Jetpack propulsor** continuo en el aire.

3. **Deconstrucción Tipográfica (`DOMTextManager`)**:
   - Medición tipográfica precisa en canvas (`measureText`), colisión caja-círculo y conversión de letras individuales en cuerpos rígidos de Rapier2D con conteo $O(1)$.

4. **Arsenal de 5 Armas y Rayo Reparador (`weapons.ts`, `FirstScene.ts`)**:
   - **Pistola (01)**: Semiautomática de precisión (radio de 13 px, 180 ms).
   - **Escopeta (02)**: Cono de 14° con 5 perdigones independientes de 8 px.
   - **Lanzagranadas (03)**: Proyectil parabólico con rebote elástico, espoleta de 1.15 s y cráter de 38 px.
   - **Láser Térmico (04)**: Corte continuo interpolado cada 5 px (cadencia de 35 ms, radio de 8 px).
   - **Vórtice (05)**: Singularidad gravitatoria con atracción de escombros en radio de 220 px e implosión de 56 px.
   - **Rayo Reparador (<kbd>E</kbd> / Clic Derecho)**: Haz secundario continuo de reconstrucción estructural (radio de 20 px).

5. **Scraper Headless Seguro (`src/server/scraper.ts`)**:
   - Prevención de SSRF y DNS rebinding (bloqueo de IPs privadas/loopback/link-local en IPv4 e IPv6), intercepción de rutas en Playwright, límite de concurrencia (máx. 2 navegadores) y caché LRU en memoria.

6. **Síntesis Sonora (`ShotAudio.ts`) y Controles Móviles (`App.tsx`)**:
   - Audio procedural con Web Audio API para las 5 armas, el siseo del jetpack (`jetpackHiss`) y el pulso armónico de reparación (`repairPulse`).
   - Controles táctiles en pantalla para dispositivos móviles y modo de efectos suaves con persistencia en `localStorage`.

---

## Verificación y Calidad

```bash
# 42 pruebas unitarias de física, máscara, reparación, armas, texto y seguridad del scraper
npm test

# Compilación de producción estricta con TypeScript (tsc --noEmit + vite build)
npm run build

# Pruebas E2E en navegador real (Google Chrome)
npm run test:browser
```

- `npm run build` valida tipos con `tsc --noEmit` y genera los bundles optimizados en `dist/`, separando `phaser` y `rapier` en chunks independientes.
- `npm run preview` sirve la versión de producción en <http://127.0.0.1:4173/> incluyendo el middleware `/api/scrape`.
- `npm run test:browser` valida en un Chrome real el renderizado, el salto y vuelo con jetpack, la destrucción bajo los pies, el cambio entre las 5 armas, la fractura Delaunay, el desprendimiento tipográfico y la estabilidad de texturas.

---

## Localización del Código Clave

- `src/game/tuning.ts`: Constantes físicas, gravedad, propulsión de jetpack, cadencias y dimensiones.
- `src/game/weapons/`: Tipos de armas, balanceo de las 5 armas y cálculo de dispersión angular.
- `src/game/physics/`: `PlatformController.ts` (cinemática y jetpack) y `DebrisManager.ts` (Rapier2D y Delaunay).
- `src/game/destruction/`: `RegionMask.ts` (máscara 2 px, Bayer 4x4, `clearRect`, `repair`) y `DestructiblePage.ts` (bloques WebGL y carbonización).
- `src/game/text/DOMTextManager.ts`: Deconstrucción tipográfica y colisión caja-círculo.
- `src/game/scenes/FirstScene.ts`: Orquestador de Phaser, atlas dinámico de escombros, proyectiles, vórtice y rayo reparador.
- `src/game/audio/ShotAudio.ts`: Sintetizador procedural Web Audio API.
- `src/server/scraper.ts`: Scraper Playwright headless con validación anti-SSRF y caché LRU.
- `src/app/`: Interfaz en React 19, HUD, controles táctiles móviles y dock de arsenal.
