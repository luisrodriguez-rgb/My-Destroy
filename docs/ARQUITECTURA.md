# Arquitectura Técnica de My-Destroy

Este documento describe la arquitectura modular implementada en el proyecto, detallando la interacción entre la interfaz de usuario en **React 19**, el motor de juego en **Phaser 4.2.1**, el subsistema de destrucción por regiones en CPU, el controlador de plataformas cinemáticas y el arsenal de armas con audio procedural.

---

## 1. Diagrama de Alto Nivel

```
┌─────────────────────────────────────────────────────────────┐
│                    REACT 19 (App.tsx)                       │
│  - Shell del navegador ficticio  - Toolbar de selección     │
│  - Métricas de destrucción       - Gestión de preferencias  │
└───────────────────────────┬─────────────────────────────────┘
                            │ bridge.ts (SceneControls / SceneStats)
┌───────────────────────────▼─────────────────────────────────┐
│                   PHASER 4 (createGame.ts)                  │
│                                                             │
│  FirstScene.ts                                              │
│  ├── PlatformController.ts ◄──► RegionMask (CPU Ocupación)  │
│  │   └── demoPlatforms.ts                                   │
│  │                                                          │
│  ├── DebrisManager.ts (Rapier2D WASM + Delaunator)          │
│  │   └── Fractura triangular y apilamiento de escombros     │
│  │                                                          │
│  ├── DestructiblePage.ts (Canvas Textures por regiones)     │
│  │   └── RegionMask.ts (Bayer 4×4 Dithering + celdas 2px)   │
│  │                                                          │
│  ├── Weapons System (weapons.ts)                            │
│  │   ├── Pistola (Hitscan puntual)                          │
│  │   ├── Escopeta (Dispersión angular 5 perdigones)         │
│  │   └── Granadas (Balística parabólica + rebote + cráter)  │
│  │                                                          │
│  └── ShotAudio.ts (Web Audio API procedural sintetizado)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Responsabilidades por Módulo

### A. Capa de Aplicación e Interfaz (`src/app/`)
- **`App.tsx`**: Renderiza el contenedor del juego (`game-host`), la barra de direcciones simulada, el medidor de destrucción en porcentaje y la barra inferior de selección de arsenal (`arsenal-slots`). Mantiene la persistencia de configuración (`muted`, `reducedMotion`) en `localStorage`.
- **`styles.css`**: Sistema de diseño con estética industrial oscura, bordes metálicos, fuentes pixeladas y acentos en ámbar (`#FFB454`) y cian (`#79E3D8`).

### B. Puente Tipado (`src/game/bridge.ts`)
- Desacopla la lógica de React y Phaser mediante dos interfaces estrictas:
  - `SceneControls`: Permite a React solicitar acciones (`reset`, `pause`, `preferences`, `setWeapon`, `focus`).
  - `SceneStats`: Emite cambios de estado hacia React (`shots`, `hits`, `percent`, `paused`, `ready`, `weapon`).
- La instancia de Phaser expone sus métodos de inspección en `window.__MY_DESTROY__` para pruebas de navegador E2E sin ensuciar el código productivo.

### C. Subsistema de Destrucción y Dithering (`src/game/destruction/`)
- **`RegionMask.ts`**:
  - Almacena una cuadrícula en CPU de 1152 × 584 px con celdas de 2 px agrupadas en bloques de 128 px.
  - Al recibir un impacto (radio $R$ y coordenadas $X,Y$), evalúa exactamente qué celdas pasan de estado ocupado a vacío.
  - **Bayer Dithering 4×4**: En la franja exterior del cráter ($R < r \le R + 4\text{px}$), aplica la matriz Bayer 4×4 para disolver celdas con densidad decreciente, produciendo un contorno irregular retro-pixelado.
  - Calcula el porcentaje de daño destruido dividiendo celdas destruidas entre el total de celdas sólidas iniciales.
  - Expone métodos de consulta instantánea (`isSolid(x, y)`).
- **`DestructiblePage.ts`**:
  - Renderiza la textura de la página por bloques regionales en el canvas de Phaser.
  - **Carbonización y Chispas Incandescentes**: Dibuja un ribete de carbón oscuro (`#17110dee`), un halo de sombra quemada (`#3c241566`) y partículas incandescentes de brasa (`#ff6b00ee`) sobre las celdas sólidas que bordean un agujero.

### D. Físicas Rígidas y Fractura Poligonal (`src/game/physics/`)
- **`DebrisManager.ts`**:
  - Genera fractura geométrica usando `delaunator` para dividir el área demolida en múltiples triángulos texturizados recortados de la página original.
  - Simula los escombros mediante el motor de física de cuerpos rígidos `@dimforge/rapier2d-compat` (WASM).
  - Cada fragmento posee un colisionador de triángulo (`RAPIER.ColliderDesc.triangle`) o cuboid, restituyendo rebotes elásticos y fricción real.
  - Los trozos colisionan contra el suelo de la pasarela y las 7 plataformas geométricas, **acumulándose en pilas físicas persistentes** a los pies del jugador.
  - Administra un límite estricto de capacidad (`maxDebris = 120`) con reciclaje automático para garantizar 60 FPS sostenidos.
- **`PlatformController.ts`**:
  - Implementa un modelo cinemático determinista para el operario (sin depender de simulaciones pesadas de físicas como Arcade o Matter).
  - Consulta las 7 plataformas geométricas definidas en `demoPlatforms.ts` (tarjetas, botones, barras de la página) y el suelo indestructible de la pasarela (`y = 530`).
  - **Detección de soporte destructible**: en cada fotograma, muestrea la solidez de la plataforma en los pies del jugador (`PlatformController.isFootingSolid()`). Si un disparo abre un agujero en ese punto, el soporte se cancela de inmediato y el jugador cae por aceleración de gravedad.
  - Gestiona salto elástico, caída voluntaria (*drop*) con <kbd>S</kbd>, *coyote time* (100 ms) y *jump buffer* (120 ms).

### E. Sistema de Armas (`src/game/weapons/`)
- Arquitectura basada en datos:
  - `WeaponConfig`: define nombre, categoría, cadencia (*cooldown*), destello, retroceso, radio de daño y comportamiento de proyectiles.
  - **Pistola**: impacto directo puntual de 28 px.
  - **Escopeta**: calcula abanico simétrico (`calculateSpreadAngles()`) y dispara 5 perdigones simultáneos con desvío aleatorio menor y perforaciones de 16 px.
  - **Lanzagranadas**: proyectiles con velocidad vectorial, gravedad y colisión elástica (rebotando contra plataformas y suelo con coeficiente de restitución), que al detonar por tiempo o impacto en vacío ejecutan un cráter de 54 px con sacudida de pantalla.

### F. Síntesis Sonora Procedural (`src/game/audio/ShotAudio.ts`)
- Utiliza la Web Audio API estándar del navegador para sintetizar sonido dinámico sin dependencias de red ni ficheros de audio estáticos.
- Genera osciladores con curvas exponenciales de frecuencia y envolventes de ganancia para simular:
  - Disparo de pistola.
  - Descarga percutora de escopeta.
  - Lanzamiento de granada y su rebote elástico.
  - Retumbe de baja frecuencia con filtro paso-bajo en la detonación.

### G. Deconstrucción y Fractura de Texto DOM (`src/game/text/DOMTextManager.ts`)
- Mapea líneas tipográficas (`TextRunInput`) en cajas envolventes con anchos métricos proporcionales para cada glifo visible.
- **Desprendimiento físico por impacto (`splitOnImpact`)**: al impactar cualquier arma (pistola, escopeta, granada), calcula qué letras caen dentro del radio de la onda expansiva.
- **Borrado de la superficie (`surface.clearArea`)**: elimina la silueta del carácter en la textura de papel para evitar glifos fantasma duplicados, descubriendo el sustrato digital interactivo.
- **Cuerpos rígidos dinámicos en Rapier2D (`spawnLetterDebris`)**: proyecta las letras con impulso radial, elevación y torque de rotación con colisionadores cuboid y detección continua de colisiones (CCD), posándose y rebotando sobre pasarelas y plataformas.

