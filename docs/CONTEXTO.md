# My-Destroy — contexto persistente

## Actualización tras recuperar el paquete

Se recuperaron y verificaron los 17 archivos originales en `My-Destroy-recuperado/`. Consultar `RECUPERACION.md` para la corrección y las huellas. La dirección artística original de esa carpeta tiene prioridad visual sobre las propuestas provisionales de esta sesión: página editorial «the everyday internet.», base `#0B1018`, ámbar `#FFB454` y cian `#79E3D8`.

La implementación de la primera escena vive en la raíz con React 19, TypeScript, Vite y Phaser 4.2.1. El archivo `DESARROLLO.md` documenta cómo ejecutarla. La recuperación se conserva como referencia; no se edita su maqueta para convertirla en juego.

Decisión de alcance de la primera escena: la pistola apunta a un punto sobre el plano de la página y comprueba su máscara. Los huecos no vuelven a recibir impactos ni inflan el porcentaje. El personaje se desplaza por una pasarela fija; salto y plataformas destructibles quedan para el siguiente hito, como permite la dirección artística recuperada. No se afirma que esa física completa esté implementada.

## Contexto anterior, conservado

Fecha: 2026-10-15. Fuente: instrucciones del usuario en esta sesión.

## Objetivo

Juego web inspirado en [Destroy Any Website de Sprite Fusion](https://destroy.spritefusion.com/): introducir una URL, convertir su página en escenario y destruirla visualmente con un personaje, armas, explosiones y poderes. La referencia es de experiencia; el proyecto tendrá identidad propia.

Repositorio indicado: [luisrodriguez-rgb/My-Destroy](https://github.com/luisrodriguez-rgb/My-Destroy).

## Acuerdos del usuario

- React, TypeScript y Vite para la interfaz.
- Phaser 4 para el juego.
- Máscaras por regiones para destrucción y colisiones.
- Node y Playwright para capturar URLs en una etapa posterior.
- Prioridad: acabado profesional y atención al detalle.
- Primera entrega pequeña: página ficticia, fondo industrial pixel art, personaje, una pistola y un impacto convincente.
- Ajustar puntería, destello, retroceso, fragmentos, sonido y reinicio antes de ampliar.
- Base oscura, ámbar para el jugador y cian para energía.
- Recursos candidatos: Kenney 1-Bit Platformer y Pixel UI; Pixelify Sans.

## Estado local observado

La inspección inicial encontró la carpeta vacía. Después de la interrupción del turno aparecieron `.git`, `README.md` y `prueba.md`. Se conserva ese trabajo. El repositorio local está en `main`, con `origin` apuntando al repositorio indicado. `prueba.md` estaba sin seguimiento.

No se presume acceso a archivos de sesiones anteriores. El usuario proporcionó posteriormente un texto con un script de recuperación; su resultado se documenta por separado en `RECUPERACION.md`.

## Próximo trabajo

La escena se especifica en [PRIMERA-ESCENA.md](PRIMERA-ESCENA.md) y su organización técnica en [ARQUITECTURA.md](ARQUITECTURA.md). Son propuestas de implementación derivadas de los acuerdos anteriores; las medidas y tiempos se ajustarán jugando.

Esta preparación no constituye una escena implementada. Todavía no hay dependencias instaladas ni una aplicación ejecutable.
