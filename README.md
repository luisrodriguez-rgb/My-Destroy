# My-Destroy

Un pequeño acto de destrucción. Experiencia interactiva de deconstrucción web, destrucción granular en tiempo real y física de cuerpos rígidos en 2D.

![Demostración en vivo de My-Destroy con arsenal extendido, haz láser, singularidad gravitatoria y escombros](docs/previews/extended-arsenal.png)

---

## 1. Visión General

**My-Destroy** es un simulador de demolición interactiva desarrollado con **Phaser 4.2.1**, **React 19**, **TypeScript** y **Vite**. A diferencia de los juegos clásicos de destrucción de pantalla basados en simples máscaras circulares transparentes, My-Destroy implementa un motor híbrido que combina:

1. **Deconstrucción del DOM y tipografía viva**: Las páginas web no son imágenes planas pasivas; sus titulares, párrafos, tarjetas y botones son segmentados en glifos y bloques geométricos independientes que reaccionan a los impactos balísticos.
2. **Destrucción de superficies con máscara de bits en CPU**: Una cuadrícula de ocupación de dos niveles con celdas de 2 px y bloques regionales de 128 px, procesada mediante una matriz Bayer 4x4 para generar un contorno de disolución con dithering retro.
3. **Física de cuerpos rígidos en WebAssembly**: Simulación física determinista con `@dimforge/rapier2d-compat` y fractura poligonal continua (`delaunator`), generando fragmentos triangulares, cuadriláteros y esquirlas que se apilan físicamente sobre plataformas destructibles.
4. **Movilidad aérea con Jetpack propulsor**: Un modelo cinemático que permite al operario industrial saltar entre elementos de la página o propulsarse verticalmente con vuelo libre para alcanzar cualquier sección del documento.
5. **Síntesis sonora procedural en tiempo real**: Implementación pura sobre la Web Audio API estándar, sin archivos de audio estáticos ni dependencias de red.
6. **Scraper headless de páginas web reales**: Servidor backend integrado con Playwright que captura páginas vivas (como Wikipedia o sitios de noticias), extrae sus cajas de maquetación y las transforma en plataformas transitables y fragmentos desprendibles.

---

## 2. Galería del Sistema

### Deconstrucción de Páginas Web Reales (Playwright Scraper)
Captura en vivo de un artículo real de Wikipedia procesado por el backend, con plataformas dinámicas asociadas a sus cajas de contenido y elementos desacoplables listos para caer.

![Destrucción de página web real de Wikipedia](docs/previews/scraped-wikipedia-destroyed.png)

### Fractura Tipográfica y DOM Text Splitting
Impactos de proyectiles desprendiendo letras individuales de títulos y párrafos, las cuales adquieren masa, inercia rotacional y colisionan con el entorno.

![Desprendimiento de texto tipográfico y letras en caída física](docs/previews/dom-text-splitting.png)

### Dithering Bayer 4x4 y Apilamiento Físico
Visualización del borde quemado retro con matriz Bayer 4x4, la cámara subterránea industrial expuesta y la acumulación persistente de escombros en la pasarela.

![Dithering retro Bayer 4x4 y pilas físicas de escombros](docs/previews/debris-dither-live.png)

---

## 3. Mecánicas de Destrucción y Física

### A. Máscara de Bits en CPU y Dithering Bayer 4x4 (`RegionMask.ts`)
- La superficie destructible mide 1152 x 584 px y está subdividida en una rejilla bidimensional de celdas de 2 px agrupadas en bloques lógicos de 128 px.
- Cada impacto evalúa en CPU qué celdas pasan de estado ocupado a vacío.
- En la periferia de cada cráter ($R < r \le R + 4\text{ px}$), el algoritmo consulta una matriz de dispersión Bayer 4x4:
  $$\begin{bmatrix} 0 & 8 & 2 & 10 \\ 12 & 4 & 14 & 6 \\ 3 & 11 & 1 & 9 \\ 15 & 7 & 13 & 5 \end{bmatrix}$$
  Las celdas se disuelven de forma escalonada según su distancia al centro del impacto, logrando un borde orgánico y pixelado fiel a la estética de demolición retro.
- El cálculo de porcentaje de daño destruido divide celdas vacías entre el total de celdas sólidas iniciales, ignorando disparos sobre huecos ya existentes.

### B. Carbonización y Chispas Incandescentes (`DestructiblePage.ts`)
- Las celdas que bordean inmediatamente una perforación reciben un acabado de quemadura compuesto por:
  - Ribete de carbón oscuro (`#17110d`).
  - Halo de sombra tostada translúcida (`#3c241566`).
  - Partículas y brasas incandescentes de alta temperatura (`#ff6b00`).
- Se expone una cámara subterránea interactiva en el subsuelo, construida con maquinaria industrial, consolas activas y tuberías.

### C. Fractura Poligonal y Acumulación en Rapier2D (`DebrisManager.ts`)
- Al impactar un proyectil sobre material sólido, se distribuyen puntos aleatorios concéntricos y se calcula una triangulación Delaunay mediante `delaunator`.
- Se generan tres morfologías de fragmentos:
  1. **Triángulos afilados**: Trozos angulares con vértices libres.
  2. **Cuadriláteros y trapecios irregulares**: Polígonos de cuatro vértices resultantes de roturas por tensión.
  3. **Esquirlas alargadas (*splinters*)**: Tiras estrechas de papel rasgado (5–9 px de ancho por 16–32 px de largo) con colisionadores rectangulares.
- Cada fragmento se instancia en el mundo físico de Rapier2D (`@dimforge/rapier2d-compat` compilado en WebAssembly) con colisionadores precisos (`triangle` o `cuboid`), restitución elástica y fricción.
- Los escombros caen, rebotan contra plataformas y el suelo, y se acumulan en montículos persistentes. El sistema gestiona un límite de 120 cuerpos activos con reciclaje FIFO para sostener 60 FPS estables.

### D. Deconstrucción Tipográfica (`DOMTextManager.ts`)
- El texto editorial no es una imagen estática: se modela como un conjunto estructurado de caracteres (`TextRunInput`) con métricas proporcionales y cajas envolventes.
- **Detección box-circle precisa**: Al impactar un disparo, se calcula la distancia entre el círculo de detonación y la caja envolvente de cada glifo. Cualquier disparo que roce cualquier parte de una letra la desprende de la página.
- La silueta del glifo desprendido se borra de la textura base para evitar duplicados fantasma.
- La letra se convierte en un cuerpo rígido dinámico en Rapier2D con masa propia, impulso radial, elevación angular y detección continua de colisiones (CCD).

---

## 4. Movilidad y Plataformas

### A. Controlador Cinemático (`PlatformController.ts`)
- Modelo cinemático determinista e independiente del framerate (sub-pasos de tiempo delta).
- Consulta las 7 plataformas geométricas definidas en la escena (titulares, cajas de resumen, barra de búsqueda, pie de página) y la pasarela permanente de contención en $y = 530$.
- **Detección de soporte destructible**: En cada cuadro, muestrea la solidez de la plataforma en los pies del operario (`PlatformController.isFootingSolid()`). Si un disparo demuele el soporte bajo sus pies, el operario pierde apoyo de inmediato y cae por gravedad.
- Soporte para caída voluntaria (*drop-through*) pulsando <kbd>S</kbd> o Flecha Abajo.
- Tolerancia cinemática: *coyote time* de 100 ms y *jump buffer* de 120 ms.

### B. Jetpack Propulsor Integrado
- Al mantener presionado <kbd>W</kbd>, <kbd>Espacio</kbd> o Flecha Arriba mientras el operario se encuentra en el aire, se enciende el sistema de propulsión del **Jetpack**.
- Aplica una fuerza ascendente continua de $1720\text{ px/s}^2$ que contrarresta la gravedad ($980\text{ px/s}^2$), otorgando un ascenso suave y controlado hasta el límite superior de la pantalla ($y = 64$).
- Permite volar, flotar y desplazarse horizontalmente a cualquier altura para alcanzar títulos, barras de navegación o aterrizar sobre plataformas elevadas.
- **Efectos visuales y sonoros**: El sprite del operario cuenta con una mochila de propulsión de titanio en su espalda con medidor de combustible cian y toberas dobles. Al propulsar, proyecta llamaradas dinámicas de plasma (núcleo blanco incandescente, cuerpo ámbar y llama exterior roja) junto con micro-partículas de escape y un siseo sonoro procedural de aire a presión (`jetpackHiss`).

---

## 5. Arsenal de Armas

El juego dispone de 5 armas con roles balísticos y destructivos calibrados para ofrecer máxima precisión y variedad:

| Ranura | Arma | Categoría | Cadencia | Radio de Daño | Descripción Técnica |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **01** | **Pistola** | Semiautomática | 180 ms | 13 px | Disparo directo de alta precisión con retroceso amortiguado. Diseñada para horadar letras individuales y realizar cortes quirúrgicos sin demoler bloques enteros. |
| **02** | **Escopeta** | Dispersión Pesada | 480 ms | 8 px / perdigón | Expulsa 5 perdigones simultáneos en abanico simétrico (14° de dispersión). Cada proyectil abre su propio orificio balístico independiente, generando fragmentación múltiple. |
| **03** | **Lanzagranadas** | Explosivo Balístico | 650 ms | 38 px | Lanza un proyectil táctico rotatorio con física parabólica y rebote elástico. Cuenta con cuerpo verde oliva segmentado tipo piña, espoleta plateada, anilla dorada y mecha con chispas y estela de humo. Detona a los 1.15 s o por impacto en vacío, produciendo un cráter expansivo y sacudida de pantalla. |
| **04** | **Láser Térmico** | Rayo Continuo | 35 ms | 8 px | Disparo continuo de alta frecuencia mientras se sostiene el botón del ratón. Ejecuta interpolación geométrica lineal cada 5 px a lo largo del trazo del puntero, esculpiendo surcos lisos y continuos sin saltos. Haz multicapa con resplandor naranja, núcleo ámbar y filamento blanco incandescente. |
| **05** | **Vórtice** | Singularidad Gravitatoria | 1150 ms | 56 px | Proyectil balístico que desacelera en el aire ($v \times 0.96$) y forma una anomalía cósmica activa. Ejerce atracción centrípeta y torbellino tangencial (`applyVortexPull`) en un radio de 220 px, succionando escombros y letras hacia su disco de acreción con 4 brazos espirales logarítmicos. Tras 1.6 s, se comprime súbitamente e implosiona en una onda de choque expansiva de 620 N. |

---

## 6. Síntesis Sonora Procedural (Web Audio API)

Todo el audio del juego se genera sintéticamente en tiempo real mediante la Web Audio API nativa (`ShotAudio.ts`). No se cargan archivos estáticos (.wav o .mp3), garantizando funcionamiento sin latencia ni tráfico de red:

- **Pistola (`shot`)**: Onda triangular con curva descendente rápida de tono (155 Hz a 48 Hz) combinada con una ráfaga de ruido blanco pasada por un filtro paso-alto (850 Hz / 1400 Hz).
- **Escopeta (`shotgun`)**: Doble oscilador de percusión metálica baja (120 Hz a 30 Hz) superpuesto a un impulso de ruido saturado para emular la descarga de perdigones.
- **Granada**:
  - *Lanzamiento (`grenadeLaunch`)*: Resonancia tubular con barrido de frecuencia suave (180 Hz a 75 Hz).
  - *Rebote (`grenadeBounce`)*: Impacto metálico ligero de alta frecuencia (420 Hz a 180 Hz).
  - *Detonación (`explosion`)*: Retumbe grave con filtro paso-bajo dinámico (sweep de 320 Hz a 35 Hz) y decaimiento exponencial profundo.
- **Láser Térmico (`laserPulse`)**: Síntesis en diente de sierra pasada por filtro paso-alto y paso-banda saturado (1900 Hz, Q=2.5), logrando el chisporroteo eléctrico de la incandescencia.
- **Singularidad Gravitatoria**:
  - *Lanzamiento (`vortexLaunch`)*: Glissando de frecuencia ascendente con resonancia cian.
  - *Acreción (`vortexHum`)*: Dron sub-grave palpitante (58 Hz) con modulación periódica.
  - *Implosión (`vortexImplosion`)*: Corte súbito de silencio (vacío espacial) seguido de una caída sub-grave (45 Hz a 16 Hz) y estallido expansivo.
- **Jetpack (`jetpackHiss`)**: Ruido blanco moldeado con filtro paso-banda aéreo (1600 Hz, Q=1.8) que acompaña dinámicamente el empuje de las toberas.

---

## 7. Integración con Playwright Scraper Backend

El sistema incluye una herramienta de captura en vivo (`src/server/scraper.ts`) construida sobre Express y Playwright:

1. **Proxy y sanitización**: Valida URLs HTTP/HTTPS y restringe el acceso a rangos de red locales o maliciosos (prevención de SSRF).
2. **Navegador headless en alta resolución**: Renderiza la página solicitada en un viewport calibrado de $1152 \times 496\text{ px}$.
3. **Extracción de geometría de maquetación**: Inspecciona el árbol DOM de la página real e identifica los elementos estructurales primarios (`h1`, `h2`, `article`, `section`, `nav`, `.infobox`, `button`, `img`), extrayendo sus rectángulos de posición (`getBoundingClientRect`).
4. **Conversión a plataformas de juego**: Transforma estas cajas en plataformas atravesables y elementos desprendibles (`detachables`), permitiendo al operario subirse sobre los párrafos o destruir los titulares de páginas reales como Wikipedia o GitHub.
5. **Modo fuera de línea resiliente**: Si no se especifica conexión a internet o el scraper se ejecuta sin red externa, el motor recurre automáticamente a representaciones vectoriales simuladas con maquetación idéntica.

---

## 8. Controles

| Acción | Entrada Teclado / Ratón |
| :--- | :--- |
| **Moverse a la izquierda / derecha** | <kbd>A</kbd> / <kbd>D</kbd> o Flechas Izquierda / Derecha |
| **Saltar / Activar Jetpack** | <kbd>W</kbd>, <kbd>Espacio</kbd> o Flecha Arriba (mantener en el aire para volar) |
| **Bajar de plataforma** | <kbd>S</kbd> o Flecha Abajo |
| **Apuntar retícula** | Movimiento del Ratón (retículas adaptadas por arma) |
| **Disparar / Activar corte** | Clic Izquierdo (mantener para láser continuo) |
| **Seleccionar Ranura 01 (Pistola)** | <kbd>1</kbd> o clic en ranura 01 |
| **Seleccionar Ranura 02 (Escopeta)** | <kbd>2</kbd> o clic en ranura 02 |
| **Seleccionar Ranura 03 (Granadas)** | <kbd>3</kbd> o clic en ranura 03 |
| **Seleccionar Ranura 04 (Láser Térmico)** | <kbd>4</kbd> o clic en ranura 04 |
| **Seleccionar Ranura 05 (Vórtice)** | <kbd>5</kbd> o clic en ranura 05 |
| **Ciclar Arsenal** | Rueda del Ratón (arriba / abajo) |
| **Pausar / Reanudar Escena** | <kbd>Escape</kbd> o botón de Pausa |
| **Reiniciar Escenario** | <kbd>R</kbd> o botón Reiniciar |
| **Activar / Silenciar Sonido** | <kbd>M</kbd> o botón de audio |

---

## 9. Estructura del Proyecto

```
My-Destroy/
├── docs/                             # Especificaciones técnicas y registros de auditoría
│   ├── ARQUITECTURA.md               # Detalle de renderizado, máscaras, físicas y armas
│   ├── CONTEXTO.md                   # Resumen del proyecto y metas arquitectónicas
│   ├── RECUPERACION.md               # Trazabilidad de los 17 archivos base recuperados
│   ├── VALIDACION.md                 # Informe de pruebas unitarias, E2E y rendimiento
│   └── previews/                     # Capturas en alta resolución generadas por pruebas
│       ├── extended-arsenal.png      # Captura de demostración del arsenal y jetpack
│       ├── scraped-wikipedia-destroyed.png # Captura de Wikipedia raspada y destruida
│       ├── dom-text-splitting.png    # Captura de desprendimiento de texto
│       └── debris-dither-live.png    # Captura de dithering y escombros en plataforma
├── src/
│   ├── app/                          # Capa de presentación en React 19
│   │   ├── App.tsx                   # HUD, dock de armas, barra de navegación simulada
│   │   ├── icons.tsx                 # Iconografía pixel-art SVG para armas y controles
│   │   └── styles.css                # Sistema de diseño industrial oscuro
│   ├── game/                         # Motor de juego en Phaser 4.2.1
│   │   ├── audio/
│   │   │   └── ShotAudio.ts          # Sintetizador Web Audio procedural de 5 armas y jetpack
│   │   ├── destruction/
│   │   │   ├── RegionMask.ts         # Cuadrícula CPU 2px con Bayer Dithering 4x4
│   │   │   └── Surface.ts            # Bloques WebGL de la página dañada y carbonización
│   │   ├── fixtures/
│   │   │   └── demoPage.ts           # Maquetación editorial sintética y glifos base
│   │   ├── physics/
│   │   │   ├── DebrisManager.ts      # Físicas de fragmentos Rapier2D, quads y esquirlas
│   │   │   ├── DebrisPhysics.ts      # Colisionadores triangulares y poligonales
│   │   │   └── PlatformController.ts # Controlador de salto, jetpack continuo y caída
│   │   ├── platforms/
│   │   │   └── demoPlatforms.ts      # Plataformas transitables de la demo editorial
│   │   ├── scenes/
│   │   │   └── FirstScene.ts         # Orquestador Phaser (render, bucle de armas, actor)
│   │   ├── text/
│   │   │   └── DOMTextManager.ts     # Deconstrucción tipográfica y colisión box-circle
│   │   ├── weapons/
│   │   │   ├── types.ts              # Tipos y contratos de configuración de armas
│   │   │   └── weapons.ts            # Balanceo y cálculo de abanicos de perdigones
│   │   ├── bridge.ts                 # Enlace desacoplado entre React y Phaser
│   │   ├── createGame.ts             # Configuración de canvas y ciclo de vida
│   │   └── tuning.ts                 # Constantes de física, dimensiones y colores
│   └── server/
│       ├── index.ts                  # Servidor proxy Express para scraping
│       └── scraper.ts                # Extractor Playwright headless de páginas web vivas
└── tests/                            # Suites de pruebas automatizadas
    ├── scene.spec.ts                 # Pruebas E2E de armas, jetpack, soporte y físicas
    ├── capture.spec.ts               # Generador de capturas en vivo de alta resolución
    └── endurance.spec.ts             # Prueba de resistencia de disparo continuo
```

---

## 10. Puesta en Marcha

### Requisitos del Sistema
- **Node.js** >= 20.0.0 (desarrollado y verificado en Node 24)
- **npm** >= 10.0.0
- Google Chrome o Chromium instalado (para las pruebas de Playwright con WebAssembly)

### Instalación y Ejecución
```bash
# 1. Clonar el repositorio
git clone https://github.com/luisrodriguez-rgb/My-Destroy.git
cd My-Destroy

# 2. Instalar dependencias exactas
npm ci

# 3. Iniciar el servidor local de desarrollo
npm run dev
```

La aplicación quedará accesible de inmediato en `http://127.0.0.1:5173/`.

---

## 11. Validación de Calidad y Pruebas

El proyecto cuenta con un conjunto integral de pruebas automatizadas:

### Pruebas Unitarias (Vitest)
Evalúan la lógica de negocio sin depender del renderizado de navegador:
```bash
npm test
```
*37 pruebas unitarias ejecutadas en ~700 ms, cubriendo:*
- Máscara de destrucción `RegionMask` y cálculo de Bayer dithering 4x4.
- Cinemática de `PlatformController`, detección de solidez en pies y aceleración de `jetpackThrust`.
- Gestión de cuerpos rígidos en `DebrisManager` (triángulos, cuadriláteros, esquirlas y atracción de vórtice).
- Deconstrucción tipográfica y colisiones caja-círculo en `DOMTextManager`.
- Balanceo de las 5 armas y distribución geométrica de perdigones en `weapons`.
- Validación de URLs y scraping seguro en `scraper`.

### Pruebas End-to-End en Navegador Real (Playwright)
Ejecutan escenarios jugables en Chrome con WebAssembly, renderizado WebGL y simulación física de Rapier2D:
```bash
npx playwright test tests/scene.spec.ts
```
*Pruebas cubiertas:*
- Renderizado de dirección artística y responsividad.
- Apertura de perforaciones con puntero, persistencia de vacíos y reajuste con Reiniciar (<kbd>R</kbd>).
- Salto sobre plataforma destructible y caída al destruir el soporte inferior.
- Conmutación fluida entre las 5 armas del arsenal con atajos y dock interactivo.
- Disparo continuo de láser térmico y colapso de singularidad gravitatoria.
- Fractura poligonal en Delaunay y apilamiento estable de escombros en pasarela.
- Desprendimiento tipográfico con rebote y rotación física de letras individuales.

### Generación de Capturas de Demostración
```bash
npx playwright test tests/capture.spec.ts
```
Genera automáticamente capturas en alta definición en `docs/previews/` documentando el estado actual del juego.

### Compilación para Producción
```bash
npm run build
npm run preview
```
Construye el bundle optimizado en `dist/` separando dependencias de motor WebGL, simulación WASM y frontend.

---

## 12. Créditos y Licencias

- **Desarrollo y Arquitectura**: Antigravity + Google DeepMind Pair Programming.
- **Atlas Industrial**: Colección de dominio público (CC0) de Kenney.
- **Tipografía**: Pixelify Sans (Google Fonts / OFL), empaquetada localmente para ejecución sin conexión.
