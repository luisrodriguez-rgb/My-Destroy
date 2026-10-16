# Organización técnica propuesta

> Propuesta inicial conservada. Ya existe una implementación local descrita en `../DESARROLLO.md`. Tras recuperar la dirección original se eligió el impacto puntual sobre el plano de la página para el primer hito. La máscara ya controla superficie, daño y porcentaje; los raycasts físicos y el controlador de plataformas descritos aquí siguen pendientes.

## Responsabilidades

React gestiona la interfaz, preferencias y montaje del juego. Phaser 4 gestiona escena, entrada de juego, personaje, arma, texturas, efectos y audio. Evitar enviar posiciones y partículas a React en cada fotograma.

Usar un puente pequeño y tipado: comandos de reinicio/sonido/pausa y eventos de escena preparada/pausada/error. Destruir la instancia de Phaser y desregistrar sus eventos cuando se desmonte el contenedor; comprobar que el montaje de desarrollo no duplica el juego.

Antes de instalar, comprobar versiones compatibles y APIs oficiales de Phaser 4 para texturas, máscaras, renderizado y audio. Fijar las versiones elegidas y generar un lockfile. No sustituir silenciosamente Phaser 4 por otra versión.

## Estructura prevista

```text
src/
  app/                       Interfaz React y preferencias
  game/
    createGame.ts            Creación y destrucción de Phaser
    bridge.ts                Comunicación tipada con React
    scenes/FirstScene.ts     Ciclo de vida y composición
    entities/Player.ts       Movimiento, orientación y animación
    weapons/Pistol.ts       Cadencia y resolución del disparo
    destruction/
      RegionMask.ts         Ocupación y daño de una región
      DestructiblePage.ts   Consulta de regiones y renderizado del daño
    effects/ImpactEffects.ts Fragmentos, polvo y destello
    audio/ShotAudio.ts       Mezcla, activación y silencio
    fixtures/demoPage.ts    Contenido y geometría de la página ficticia
    tuning.ts               Parámetros ajustables
public/assets/              Recursos incorporados y licencias
docs/                       Contexto, escena, recuperación y recursos
```

Este árbol organiza el trabajo futuro; no representa módulos ya implementados. Crear archivos cuando haya una responsabilidad real que implementar.

## Máscaras por regiones

Dividir la página en regiones acotadas, inicialmente de hasta 128 × 128 píxeles lógicos. Cada región conserva imagen original, ocupación inicial, ocupación actual y estado de actualización pendiente. Un píxel ocupado corresponde a material sólido.

La ocupación actual es la fuente común para dibujar el daño y resolver colisiones. Una máscara visual por sí sola no modifica la física. Evitar lectura de píxeles desde GPU en cada disparo: mantener la ocupación en CPU y subir únicamente regiones modificadas.

Para un disparo, localizar regiones cruzadas por el rayo y recorrer sus celdas en orden hasta el primer sólido. El daño circular afecta todas las regiones que intersecta, incluso cuando el centro queda en una sola. Los impactos sucesivos no pueden restaurar material.

El suelo industrial es estático e indestructible. Las consultas de movimiento del personaje contra la página usan la misma ocupación, con paso de simulación acotado y barrido suficiente para evitar atravesar obstáculos. No generar un cuerpo físico por píxel. Fragmentos decorativos no participan en las colisiones de la página.

Reinicio: copiar las máscaras iniciales, restaurar texturas y vaciar efectos y tareas pendientes. Los datos originales de la página deben ser inmutables.

## Secuencia de construcción

1. Base React + TypeScript + Vite + Phaser 4 y comprobación de montaje, escalado y desmontaje.
2. Composición industrial, página ficticia y personaje; revisar una captura antes de añadir complejidad.
3. Puntería, pistola y primer impacto con máscaras compartidas para daño y colisión.
4. Afinar destello, retroceso, fragmentos y sonido con parámetros centralizados.
5. Reinicio completo, foco, silencio y movimiento reducido.
6. Verificar los criterios de `PRIMERA-ESCENA.md` y registrar evidencia.

Pruebas automatizadas útiles al implementar: conversión de coordenadas, primer sólido del rayo, daño entre regiones, paso por huecos y restauración exacta de máscaras. Verificar sensación y composición manualmente; un test unitario no acredita el acabado visual.

## Etapa posterior

Node y Playwright capturarán URLs y producirán imagen y datos de escenario. Definir ese contrato cuando funcione la escena ficticia. La captura web no debe convertirse en requisito de la primera entrega.
