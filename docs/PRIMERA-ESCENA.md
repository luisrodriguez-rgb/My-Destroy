# Primera escena — cámara de pruebas industrial

> Documento provisional anterior a la recuperación. La maqueta y `My-Destroy-recuperado/DIRECCION-ARTISTICA.md` recuperadas posteriormente son la referencia visual vigente. La implementación actual usa la página editorial original y apuntado al plano de la página; el movimiento sobre plataformas destructibles queda para el siguiente hito. Consultar `../DESARROLLO.md` para distinguir lo implementado de los criterios futuros de este documento.

## Intención

En pocos segundos debe entenderse qué se puede destruir y sentirse el peso de cada disparo. Una sola escena, una pistola y una página ficticia bastan para evaluar la calidad.

Las decisiones y valores siguientes son propuestas iniciales, no trabajo recuperado de la sesión anterior.

## Composición

Propuesta de encuadre lógico: 960 × 540, cámara fija y escala proporcional. Arte en píxeles nítidos; evitar filtros que difuminen sprites. Priorizar escritorio con ratón y teclado en esta entrega.

| Capa | Contenido | Función |
| --- | --- | --- |
| Fondo | Nave industrial oscura, vigas, tubos y luces discretas | Dar profundidad sin competir con el blanco |
| Suelo | Pasarela sólida e indestructible en el tercio inferior | Mantener al personaje accesible durante las pruebas |
| Blanco | Página ficticia «NEXO / Industrial systems», con cabecera, titular y tres tarjetas | Mostrar una web reconocible y zonas distintas para disparar |
| Personaje | Silueta ámbar, arma separada y brazo orientable | Hacer legibles dirección y retroceso |
| Efectos | Destello, trazo breve, borde roto, fragmentos y polvo | Explicar el impacto y dejar daño persistente |
| Interfaz | Nombre de escena, pistola, sonido, reinicio y controles | Permitir probar sin menús largos |

La página se sitúa por encima de la pasarela, con separación del punto de aparición. Al perforarla se ve el fondo industrial. El escenario no debe parecer una colección de tarjetas de interfaz flotando sin contexto.

Paleta inicial: fondo `#10151D`, estructura `#27313D`, jugador `#FFB547`, energía `#55DDE0` y texto `#E8E5DB`. Reservar el cian para indicadores y pequeñas fuentes de energía. La pistola usa destello cálido. Ajustar contraste en la vista real.

## Interacción

- A/D o flechas: desplazamiento horizontal sobre la pasarela.
- Ratón: orientar arma y retícula en coordenadas de mundo.
- Clic izquierdo: un disparo por pulsación; munición ilimitada para iterar.
- R y botón visible: reiniciar la escena.
- M y botón visible: silenciar sonido.
- Perder foco: pausar entrada y limpiar teclas/botones retenidos.

El clic en botones de interfaz no debe disparar. El primer gesto habilita el audio. No introducir todavía salto, recarga, enemigos, poderes, selección de armas ni captura real de URLs.

## Un disparo, de principio a fin

1. Convertir la posición del puntero teniendo en cuenta escala, márgenes y cámara. Orientar el arma desde su pivote hacia el objetivo.
2. Resolver el primer punto sólido en la trayectoria desde la boca del arma. Comprobar también obstrucciones entre pivote y boca para evitar disparar a través de paredes cercanas.
3. Aplicar destello, retroceso del arma y sonido en el mismo disparo. La dirección se calcula antes del retroceso visual.
4. Si hay impacto, perforar la máscara local y actualizar inmediatamente su textura y colisión. Si se dispara por un hueco, la trayectoria continúa hasta el siguiente sólido.
5. Emitir fragmentos del color de la superficie, polvo breve y un trazo que termine en el impacto. El daño permanece después de desaparecer los efectos.

| Ajuste | Punto de partida | Qué evaluar |
| --- | --- | --- |
| Intervalo mínimo | 180 ms | Cada clic aceptado produce exactamente un disparo |
| Destello | 35–55 ms | Visible y unido a la boca del arma |
| Retroceso | 2–4 px; recuperación de 80–120 ms | Golpe perceptible sin alterar la puntería real |
| Trazo | 30–50 ms | Legible sin convertirse en un láser permanente |
| Radio de daño | 7–10 px, borde irregular | Agujero localizado; no eliminar tarjetas completas |
| Fragmentos | 6–12 por impacto, vida de 250–650 ms | Expulsión coherente, gravedad y desaparición limpia |
| Vibración | Hasta 1–2 px durante 50–80 ms | Acento suave; desactivable con movimiento reducido |
| Sonido | Ataque seco, cuerpo corto y pequeño impacto | Evitar saturación, colas largas y volumen molesto |

## Condiciones para cerrar esta entrega

- La retícula, el cañón y el impacto coinciden mirando en ambas direcciones y tras redimensionar la ventana.
- Un disparo perfora la página; otro atraviesa ese hueco sin golpear una colisión invisible.
- Un impacto que cruza el límite entre regiones rompe ambas sin costuras.
- Disparar al vacío no genera fragmentos ni daño ficticio.
- El jugador no queda incrustado en sólidos ni bloqueado por píxeles destruidos.
- Destello, retroceso, sonido y daño se perciben como un mismo evento.
- Reiniciar restaura página, máscaras, personaje y cámara, y elimina fragmentos, temporizadores y sonidos pendientes. Conserva las preferencias de sonido y movimiento reducido.
- Repetir diez reinicios y una sesión de disparos de un minuto no duplica eventos ni aumenta indefinidamente objetos activos.
- La escena mantiene fluidez en un equipo de referencia documentado. Registrar navegador, resolución y medición antes de declarar cumplido el rendimiento.
- Revisar visualmente escritorio grande y ventana pequeña, incluyendo silencio, pérdida de foco y movimiento reducido.

No ampliar el arsenal hasta que estas condiciones estén satisfechas.
