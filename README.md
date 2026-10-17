# My-Destroy

> **Un pequeño acto de destrucción.**
> Rompe la página web ficticia para descubrir el mundo industrial que late al otro lado.

---

## ✦ Visión General

**My-Destroy** es una experiencia jugable en 2D desarrollada con **Phaser 4.2.1**, **React 19**, **TypeScript** y **Vite**. Combina físicas de plataformas cinemáticas, destrucción granular de superficies en tiempo real mediante máscaras de bits en CPU y un arsenal interactivo con síntesis de audio procedural.

El jugador controla un operario industrial sobre una pasarela suspendida frente a una página web editorial ficticia. Al disparar, los proyectiles horadan la superficie del documento, dejando al descubierto una enorme instalación subterránea con maquinaria pesada, tuberías y circuitos de energía.

---

## 🎮 Mecánicas de Juego

### 1. Destrucción Granular de Superficies
- **Máscara en CPU (`RegionMask`)**: La página destructible se almacena en memoria dividida en regiones cuadradas de 128 px compuestas por celdas de 2 px.
- **Transparencia Real**: Los impactos no superponen manchas ni círculos; eliminan físicamente los píxeles de la textura en el canvas WebGL para revelar el fondo real.
- **Fragmentos y Escombros**: Cada perforación desprende esquirlas de textura proporcionales al material arrancado, sujetas a gravedad, dispersión angular y desvanecimiento.
- **Detección Continua de Vacíos**: Disparar sobre un hueco ya abierto no genera daño redundante ni cuenta como impacto nuevo. El porcentaje de destrucción es estrictamente acumulativo sobre material intacto.

### 2. Soporte Físico y Plataformas Destructibles
- **Plataformas de la Página**: 7 elementos geométricos extraídos de la maquetación editorial (titulares, paneles, barra de pie de página) actúan como plataformas elevadas atravesables (*one-way*).
- **Caída por Destrucción**: El controlador cinemático del personaje (`PlatformController`) sondea la máscara de ocupación en los puntos de contacto de sus pies. Si un disparo destruye el soporte bajo el operario, este pierde sustentación de inmediato y cae por gravedad.
- **Salto y Maniobrabilidad**:
  - Salto elástico con soporte de *coyote time* (100 ms) y *jump buffer* (120 ms).
  - Caída manual (*drop-through*) para descender rápidamente a niveles inferiores.
  - Sombra dinámica proyectada que calcula la distancia hacia la plataforma más cercana o el suelo de la pasarela.

### 3. Arsenal de Armas y Físicas Balísticas
El juego cuenta con 3 armas diferenciadas, seleccionables mediante teclado, rueda del ratón o la barra de interfaz:

| Arma | Tipo | Cadencia | Efecto | Comportamiento |
| --- | --- | --- | --- | --- |
| **01 Pistola** | Semiautomática | 180 ms | Agujero de 28 px | Disparo rápido, retroceso de 110 ms, destello de cañón y percusión sintética seca. |
| **02 Escopeta** | Dispersión | 520 ms | 5 perdigones simultáneos | Cono de dispersión de 18° con 5 proyectiles independientes. Cada perdigón perfora un cráter de 16 px y expulsa sus propios fragmentos. |
| **03 Lanzagranadas** | Proyectil Balístico | 850 ms | Cráter de 54 px | Munición parabólica con gravedad y rebote elástico sobre plataformas y suelo. Detonación por espoleta (1.2 s) o impacto en vacío, generando sacudida de pantalla (*screen shake*), estruendo grave y destrucción radial masiva. |

---

## 🕹️ Controles

| Acción | Teclado / Ratón |
| --- | --- |
| **Moverse** | <kbd>A</kbd> / <kbd>D</kbd> o Flechas Izquierda / Derecha |
| **Saltar** | <kbd>W</kbd>, <kbd>Espacio</kbd> o Flecha Arriba |
| **Bajar de plataforma** | <kbd>S</kbd> o Flecha Abajo |
| **Apuntar** | Movimiento del Ratón (retícula dinámica) |
| **Disparar** | Clic Izquierdo |
| **Seleccionar Arma** | <kbd>1</kbd> (Pistola), <kbd>2</kbd> (Escopeta), <kbd>3</kbd> (Granadas) o Rueda del Ratón |
| **Pausar / Reanudar** | <kbd>Escape</kbd> o botón *Pausa* |
| **Reiniciar Escenario** | <kbd>R</kbd> o botón *Reiniciar* |
| **Silenciar Audio** | <kbd>M</kbd> o botón de volumen |

> **Nota:** Al perder el foco de la ventana del navegador, el juego se pausa automáticamente y limpia los estados de teclas retenidas. Al hacer clic sobre el escenario, el juego reclama el foco de teclado.

---

## 🔊 Audio Procedural (Web Audio API)

No se utilizan archivos `.mp3` ni `.wav` externos. Todo el paisaje sonoro se sintetiza en tiempo real mediante nodos nativos de la Web Audio API (`ShotAudio`):
- **Pistola**: Onda triangular con caída hiperbólica de tono (340 Hz → 42 Hz) y estallido filtrado de ruido blanco.
- **Escopeta**: Ráfaga combinada con impulso metálico de baja frecuencia y ruido moldeado para simular dispersión de perdigones.
- **Lanzagranadas**:
  - *Disparo*: Impulso sordo con resonancia tubular.
  - *Rebote*: Ping elástico de impacto metálico ligero.
  - *Explosión*: Retumbe subsónico con filtro paso-bajo dinámico (biquad sweep 220 Hz → 30 Hz) y saturación cálida.

---

## 🧱 Arquitectura del Código

```
My-Destroy/
├── docs/                        # Documentación técnica, decisiones y validación
│   ├── ARQUITECTURA.md          # Especificación del subsistema de destrucción y render
│   ├── CONTEXTO.md              # Resumen del proyecto e hitos completados
│   ├── RECUPERACION.md          # Trazabilidad de los 17 archivos históricos recuperados
│   └── VALIDACION.md            # Registro de suites de pruebas y rendimiento
├── My-Destroy-recuperado/        # Archivos de dirección artística y assets CC0 intactos
├── src/
│   ├── app/                     # Capa de interfaz de usuario en React 19
│   │   ├── App.tsx              # Shell del navegador simulado, métricas, toolbar de armas
│   │   └── styles.css           # Estilos oscuros industriales inspirados en la maqueta
│   └── game/                    # Motor de juego en Phaser 4.2.1
│       ├── audio/
│       │   └── ShotAudio.ts     # Síntesis procedural de disparos, rebotes y detonaciones
│       ├── destruction/
│       │   ├── RegionMask.ts    # Máscara CPU en celda de 2px con cálculo de porcentaje
│       │   └── Surface.ts       # Renderizado WebGL de la página dañada y extracción de fragmentos
│       ├── physics/
│       │   └── PlatformController.ts # Físicas cinemáticas de salto, gravedad y soporte destructible
│       ├── platforms/
│       │   └── demoPlatforms.ts # Definición de las 7 plataformas geométricas de la demo
│       ├── scenes/
│       │   └── FirstScene.ts    # Escena principal (mundo, armas, proyectiles, bucle de juego)
│       ├── weapons/
│       │   ├── types.ts         # Contratos de datos de armas y proyectiles
│       │   └── weapons.ts       # Definición de estadísticas y cálculo de dispersión
│       ├── bridge.ts            # Comunicación desacoplada entre React y Phaser
│       ├── createGame.ts        # Bootstrap y ciclo de vida de la instancia de Phaser
│       └── tuning.ts            # Parámetros calibrados de físicas, armas y dimensiones
└── tests/                       # Pruebas end-to-end con Playwright
    ├── scene.spec.ts            # Pruebas de destrucción, salto, plataformas y arsenal
    └── endurance.spec.ts        # Prueba de resistencia de disparo continuo y fugas de textura
```

---

## 🚀 Puesta en Marcha

### Requisitos
- **Node.js** >= 20.0.0 (probado en Node 24.15.0)
- **npm** >= 10.0.0 (probado en npm 11.12.1)
- Google Chrome instalado (para pruebas de navegador automatizadas)

### Instalación y Ejecución Local
```bash
# Instalar dependencias exactas
npm ci

# Iniciar servidor de desarrollo en http://127.0.0.1:5173/
npm run dev
```

El servidor Vite genera automáticamente la referencia visual de la dirección artística en `public/reference/` y arranca la escena jugable de inmediato sin requerir configuración externa.

---

## 🧪 Pruebas y Validación

El proyecto cuenta con validación estricta en dos niveles:

### 1. Pruebas Unitarias (Vitest)
Evalúan la lógica geométrica, el sistema de armas, la cinemática de plataformas y la integridad de la máscara de bits sin depender de un DOM real:
```bash
npm test
```
*Cobertura: 16 pruebas unitarias verificando `RegionMask`, `PlatformController`, `calculateSpreadAngles` y transformaciones de coordenadas.*

### 2. Pruebas End-to-End en Navegador (Playwright)
Comprueban la interacción real en Google Chrome: disparos con puntero, persistencia de huecos, salto hacia plataformas, colapso por destrucción bajo los pies, cambio de armas, dispersión de escopeta, física de granadas y resistencia contra fugas de memoria:
```bash
npm run test:browser
```

### 3. Compilación de Producción
```bash
npm run build
npm run preview
```
Genera la distribución optimizada en `dist/` con chunks separados para el motor Phaser y la interfaz React.

---

## 📜 Historial y Fidelidad del Proyecto
- Todos los archivos recuperados del paquete original (`My-Destroy-recuperado/`) permanecen inalterados con sus huellas SHA-256 verificadas.
- Los assets del atlas industrial provienen de la colección de dominio público (CC0) de Kenney.
- La fuente tipográfica pixelada **Pixelify Sans** se carga localmente sin dependencias de servicios externos en tiempo de ejecución.
