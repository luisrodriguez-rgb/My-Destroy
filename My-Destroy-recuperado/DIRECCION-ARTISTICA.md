# My-Destroy: dirección artística y primera escena

## Prioridad de producto

La indicación del usuario es trabajar con acabado profesional y atención al detalle, sin intentar completar todo el juego en la primera entrega. El próximo entregable será una escena breve que demuestre la calidad deseada: una página, un personaje, un arma y un impacto convincente. El backend de URLs y el arsenal completo se incorporan después.

Los recursos existentes sirven para acelerar la producción; la selección y adaptación deben mantener una identidad coherente. No se usarán todos los estilos disponibles a la vez.

## Dirección elegida: demolición tecnológica

La web conserva su nitidez y su aspecto reconocible. Al romperla aparece una capa industrial oscura, con profundidad, luces y piezas técnicas pixel art. El jugador y la interfaz tienen una presencia clara sin competir con el contenido.

| Función | Color inicial | Regla |
| --- | --- | --- |
| Base | `#0B1018` | Fondo y superficies profundas |
| Panel | `#151D29` | HUD y controles, con borde discreto |
| Texto claro | `#F4F1E8` | Información principal sobre fondo oscuro |
| Texto secundario | `#AAB6C8` | Ayuda y estados de menor prioridad |
| Ámbar | `#FFB454` | Jugador, arma activa, interacción principal |
| Cian | `#79E3D8` | Energía y detalles del mundo oculto |
| Coral | `#F37973` | Daño recibido y estados que requieren atención |

No depender solo del color para comunicar selección o error: combinar borde, icono y texto. Las etiquetas pequeñas deben mantener contraste y tamaño legibles.

## Reglas de píxel y composición

- Piezas del entorno de 16 × 16 y detalles sobre una rejilla de un píxel lógico. Los sprites propios pueden ocupar varias celdas, manteniendo igual densidad de píxel.
- Escalado nearest-neighbor. Para el acabado principal, usar múltiplos enteros en la capa de sprites y redondear el render de cámara; la física conserva sus coordenadas precisas.
- La captura web y la interfaz de lectura no se reducen a la resolución de los sprites.
- Una dirección de luz y un grosor de contorno comunes. Evitar mezclar iconos blandos, personajes de otra perspectiva y partículas con resolución incompatible.
- Pixelify Sans para títulos y etiquetas breves; fuente legible convencional para instrucciones, errores y textos largos.
- Más contraste y saturación en el jugador que en el fondo. Desaturar y oscurecer el decorado al integrar; preservar los originales descargados.
- HUD con áreas estables: progreso arriba, arsenal abajo, ayuda contextual fuera de la zona de puntería. Respetar zonas seguras y tamaños de clic.

## Selección real de recursos

Se descargaron dos packs CC0 de Kenney y la fuente Pixelify Sans con licencia OFL; ver `assets/README.md` y `assets/manifest.json`. Los atlases se inspeccionaron visualmente. El atlas 1-Bit preparado mide 320 × 320 y usa tiles empaquetados de 16 × 16; el de Pixel UI mide 538 × 592 y su ficha indica tiles de 16 × 16 separados por 2 px.

**1-Bit Platformer:** seleccionar estructuras, tuberías, piezas mecánicas y siluetas. Se puede tintar para construir la base industrial. Los personajes del atlas son candidatos de arranque, no un personaje final ya animado.

**Pixel UI:** extraer solo símbolos y paneles que encajen. Los botones completos se ajustarán al sistema visual propio. No mostrar todas las variantes de colores del pack en un mismo HUD.

**Personaje y armas:** diseñar una silueta pequeña y clara, con brazo/arma separados para apuntar. Preparar pivote de agarre, boca del cañón, dirección de disparo y puntos de emisión. Los iconos del arsenal tienen que representar el arma equipada y compartir perspectiva.

**Fondos:** componer profundidad con piezas reutilizadas y capas propias. Usar objetos técnicos identificables y movimiento de cámara discreto; no llenar el hueco de ruido visual.

**Efectos:** crear una familia coherente de destello, impacto, chispas, humo y fragmentos. El atlas o animación que se elija debe revisarse en movimiento antes de integrarse como definitivo.

## La primera escena que construiremos

1. Una página ficticia cuidada, con título, texto y tarjetas. Sin dependencia de una URL externa.
2. Un encuadre reconocible, un personaje y un arma activa; el resto del arsenal se añade cuando esta interacción tenga buen acabado.
3. Apuntar y disparar con respuesta inmediata. El disparo muestra destello, retroceso breve, impacto y recorte persistente.
4. El agujero deja ver el mundo industrial; el borde tiene sombra/quemadura, unos pocos fragmentos conservan contenido de la página y el humo se disipa.
5. El porcentaje refleja el daño nuevo. Un botón restaura la escena, sin residuos de partículas, temporizadores o audio.
6. Una vez ajustada la interacción, añadir movimiento, salto y soporte que desaparece al destruirse.

La lámina `art-direction.html` presenta composición, paleta y recursos seleccionados. Es un estudio visual estático, no una demo jugable ni una prueba del motor de destrucción. `docs/art-direction-preview.png` es su captura renderizada.

## Detalle del disparo

Tiempos iniciales para ajustar al probar, no resultados ya medidos:

- Respuesta visual del arma en el mismo frame de entrada admitido por la simulación.
- Destello de unos 30–60 ms, seguido de recuperación de 70–120 ms según el arma.
- Retroceso local legible; vibración de cámara pequeña, opcional y sin desplazar el HUD.
- Agujero persistente con borde irregular coherente con la escala de píxel; no solo un círculo opaco pintado encima.
- Fragmentos con posiciones y colores procedentes de la región dañada; partículas puramente cosméticas separadas de la lógica.
- Sonido con variación discreta y volumen controlado. No superponer tantas voces que el impacto se vuelva una masa indistinta.
- El personaje sigue visible delante de la página y los efectos no tapan la puntería durante demasiado tiempo.

## Estados y pulido de interfaz

- Inicio, carga, recurso ausente, pausa y reinicio tienen un diseño propio.
- Foco de teclado visible, estado seleccionado persistente y feedback al pulsar.
- No enseñar acciones que parezcan disponibles cuando aún no están implementadas en la primera demo.
- Menos animación y destellos con la preferencia del usuario; sonido apagable y sin autoplay.
- Reservar espacio para el HUD para que cambios de porcentaje o mensajes no muevan la composición.
- Verificar legibilidad con el navegador al 100 % y con distintas densidades de pantalla.

## Criterio de salida de la primera escena

- Estilo consistente entre personaje, arma, decorado y HUD.
- Sprites nítidos, pivotes correctos y ausencia de halos o filtrado de tiles vecinos.
- El impacto elimina la superficie y revela el fondo; el reinicio reconstruye el estado.
- Sin recursos rotos, errores de consola ni llamadas externas necesarias para abrir la demo.
- Interacción cómoda con ratón y teclado, foco visible y efectos reducibles.
- Revisión visual a tamaño real y grabación breve para comprobar tiempos, transiciones y sonido.
- Registro de fuentes y licencias conservado al exportar los recursos finales.

La calidad de esta escena decide el estándar de las siguientes. No es necesario que incluya todas las armas, URLs arbitrarias o multijugador para ser una primera entrega válida.
