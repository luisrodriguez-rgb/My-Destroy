# My-Destroy — Guía de Desarrollo y Ejecución

Aplicación local desarrollada con **React 19**, **TypeScript**, **Vite** y **Phaser 4.2.1**. La carpeta `My-Destroy-recuperado/` se preserva intacta con sus 17 archivos de referencia.

---

## Arranque Rápido

Entorno de ejecución probado: **Node 24.15.0** y **npm 11.12.1** (compatible con Node >= 20).

```bash
# Instalar dependencias exactas
npm ci

# Iniciar servidor local de desarrollo
npm run dev
```

Abrir <http://127.0.0.1:5173/> en el navegador. La aplicación es totalmente autónoma: no necesita conexión a Internet, claves de API ni base de datos. El script de desarrollo copia los recursos de referencia en `public/reference/` y sirve la maqueta original desde el enlace del pie de página.

---

## Controles del Juego

| Acción | Control |
| --- | --- |
| **Apuntar** | Ratón (retícula dinámica orientable) |
| **Disparar** | Clic izquierdo (un disparo por pulsación) |
| **Moverse** | <kbd>A</kbd> / <kbd>D</kbd> o Flechas Izquierda / Derecha |
| **Saltar** | <kbd>W</kbd>, <kbd>Espacio</kbd> o Flecha Arriba |
| **Descender de plataforma** | <kbd>S</kbd> o Flecha Abajo |
| **Cambiar de arma** | <kbd>1</kbd> Pistola, <kbd>2</kbd> Escopeta, <kbd>3</kbd> Granadas, rueda del ratón o toolbar |
| **Reiniciar escenario** | <kbd>R</kbd> o botón *Reiniciar* |
| **Silenciar sonido** | <kbd>M</kbd> o botón de volumen |
| **Pausa** | <kbd>Escape</kbd> o botón de pausa |
| **Reducir efectos** | Botón *Efectos suaves* |

> **Comportamiento del foco:** Hacer clic en el escenario otorga el foco de teclado al juego. Si la ventana pierde el foco, el juego se pausa automáticamente y libera cualquier tecla retenida para evitar derivas de movimiento. El contexto de audio se activa tras la primera interacción de disparo.

---

## Subsistemas Implementados

1. **Destrucción Granular por Máscara en CPU (`RegionMask`)**:
   - Cuadrícula de regiones cuadradas de 128 px con celdas de 2 px.
   - Texturas WebGL perforadas dinámicamente: los huecos son transparentes y revelan el fondo industrial, sin círculos superpuestos.
   - Desprendimiento de fragmentos con física, rotación angular y desvanecimiento.
   - Medición estricta de porcentaje de destrucción sobre píxeles nuevos.

2. **Física Cinemática y Plataformas Destructibles (`PlatformController`)**:
   - 7 plataformas geométricas semi-sólidas (*one-way*) mapeadas a elementos de la página.
   - Consulta de sustentación en tiempo real contra la máscara en CPU. Si un tiro rompe el soporte donde pisa el operario, este cae por gravedad.
   - Amortiguación elástica de salto, *coyote time* (100 ms) y *jump buffer* (120 ms).
   - Proyección dinámica de sombra sobre la superficie más cercana.

3. **Arsenal y Balística (`weapons.ts`, `FirstScene.ts`)**:
   - **Pistola**: Munición rápida, orificios limpios de 28 px y retroceso visual.
   - **Escopeta**: Cono de 18° con 5 perdigones independientes de 16 px y expulsión múltiple de escombros.
   - **Lanzagranadas**: Proyectil parabólico con gravedad y rebote sobre pasarela y plataformas, detonación con espoleta de 1.2 s, sacudida de pantalla (*screen shake*) y cráter de demolición de 54 px.

4. **Síntesis Sonora (`ShotAudio.ts`)**:
   - Audio procedural con Web Audio API: 5 voces sintetizadas (disparo de pistola, descarga de escopeta, propulsión de granada, rebote metálico y estruendo de detonación).

5. **Ajustes y Accesibilidad**:
   - Modo de efectos suaves (reduce el número de partículas y desactiva la sacudida de pantalla).
   - Silenciado global con persistencia en `localStorage`.

---

## Verificación y Calidad

```bash
# Pruebas unitarias de física, máscara, armas y coordenadas
npm test

# Compilación de producción estricta con TypeScript
npm run build

# Pruebas E2E en navegador real (Google Chrome)
npm run test:browser
```

- `npm run build` genera los bundles optimizados en `dist/`. Phaser se empaqueta en un chunk separado.
- `npm run preview` sirve la versión de producción en <http://127.0.0.1:4173/>.
- `npm run test:browser` valida en un Chrome real el renderizado, el salto hacia plataformas, la destrucción bajo los pies, el cambio de arsenal, la detonación de granadas y la ausencia de fugas de texturas tras 60 s de disparo continuo.

---

## Localización del Código Clave

- `src/game/tuning.ts`: Constantes físicas, gravedad, cadencias y dimensiones.
- `src/game/weapons/`: Tipos de armas, configuraciones y cálculo de dispersión angular.
- `src/game/physics/`: Controlador cinemático del personaje y consulta de máscara.
- `src/game/destruction/`: Lógica de regiones, perforación y texturas WebGL.
- `src/game/scenes/FirstScene.ts`: Ciclo de vida de Phaser, proyectiles, granadas y render.
- `src/game/audio/ShotAudio.ts`: Nodos y osciladores de audio procedural.
- `src/app/`: Interfaz en React 19, barra de estado y panel de arsenal.
