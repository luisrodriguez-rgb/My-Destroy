# My-Destroy — contexto persistente

## Estado Actual del Proyecto (Actualizado)

El proyecto cuenta con una aplicación completamente jugable, modular y testeada en la raíz del repositorio, construida con **React 19**, **TypeScript**, **Vite** y **Phaser 4.2.1**, conectada a **Web Audio API** nativa.

### Hitos Implementados y Verificados

1. **Recuperación y Preservación de Identidad**:
   - 17 archivos originales recuperados, comprobados mediante SHA-256 y conservados en `My-Destroy-recuperado/`.
   - Dirección artística fiel: base `#0B1018`, detalles ámbar `#FFB454` y cian `#79E3D8`, tipografía *Pixelify Sans* local.

2. **Destrucción Granular por Máscara en CPU (`RegionMask` & `Surface`)**:
   - Página ficticia editorial dividida en regiones cuadradas de 128 px con celdas de 2 px.
   - Texturas WebGL dinámicas con transparencia real (se perfora la superficie y se ve el fondo industrial subyacente).
   - Generación de fragmentos/escombros desprendidos con gravedad y rotación.
   - Control estricto de impactos: no se suma daño sobre huecos ya abiertos.

3. **Física del Personaje y Plataformas Destructibles (`PlatformController`)**:
   - 7 plataformas geométricas superpuestas a la página (tarjetas, cabeceras, estante inferior).
   - Consulta continua de sustentación en la máscara de ocupación en CPU.
   - Si un impacto destruye la plataforma bajo los pies del jugador, este pierde apoyo y cae por gravedad.
   - Mecánica de salto con *coyote time* (100 ms), *jump buffer* (120 ms) y descenso rápido manual (*drop* con <kbd>S</kbd>).
   - Sombra dinámica proyectada hacia la superficie más cercana.

4. **Arsenal de 3 Armas y Balística (`weapons.ts`, `FirstScene.ts`)**:
   - **Pistola**: Semiautomática, perforación directa de 28 px, retroceso de 110 ms, sonido seco.
   - **Escopeta**: Cono de dispersión de 18° con 5 perdigones simultáneos y perforaciones independientes de 16 px.
   - **Lanzagranadas**: Proyectil parabólico con gravedad y rebote elástico sobre plataformas/suelo, espoleta de 1.2 s, sacudida de pantalla (*screen shake*), estruendo subsónico y cráter de demolición radial de 54 px.
   - Selección ágil mediante atajos <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, rueda del ratón o barra de interfaz.

5. **Audio Procedural (Web Audio API)**:
   - Síntesis en tiempo real sin dependencias de red ni ficheros de audio externos.
   - Voces sintetizadas para pistola, escopeta, lanzamiento de granada, rebote metálico y detonación profunda.

6. **Batería de Pruebas Automatizadas**:
   - 16 pruebas unitarias en **Vitest** (máscaras, cinemática, colisiones, armas).
   - 5 pruebas end-to-end en **Playwright** en navegador real (destrucción, escalado móvil, salto, caída por colapso de plataforma, cambio de armas, dispersión, granadas y resistencia a fugas de texturas tras 60 s de fuego continuo).

---

## Objetivo Global del Proyecto

Juego web inspirado conceptualmente en *Destroy Any Website de Sprite Fusion*: permitir cargar una página web, convertirla en un escenario interactivo 2D y destruirla con armas, físicas y explosiones. En las siguientes fases se integrará la captura dinámica de URLs remotas mediante Chromium sin cabeza.

Repositorio oficial: [luisrodriguez-rgb/My-Destroy](https://github.com/luisrodriguez-rgb/My-Destroy).

---

## Próximos Pasos (Roadmap)
- Integración de backend/script para renderizar URLs externas arbitrarias a texturas de página.
- Nuevas armas y poderes (láser continuo, taladro, ataque aéreo).
- Enemigos mecánicos o drones de defensa que patrullan el interior de la página web.
