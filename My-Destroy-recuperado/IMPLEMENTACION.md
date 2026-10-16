# My-Destroy: plan de implementación

## Objetivo del primer producto

El usuario introduce una URL pública, espera la preparación del mapa y juega sobre una representación de esa página: corre, salta, apunta y la rompe con pistola, escopeta y lanzagranadas. Los agujeros revelan un mundo pixel art y modifican las plataformas. Hay porcentaje de destrucción, pausa y reinicio.

Una demo local estará disponible desde el primer hito y seguirá funcionando si una URL no puede capturarse.

Este archivo define trabajo futuro. Todavía no se ha implementado la aplicación. Se prepararon recursos licenciados y una lámina visual según `DIRECCION-ARTISTICA.md`.

## Decisiones fijadas

- Aplicación web para escritorio primero; soporte táctil en una fase posterior.
- TypeScript en todo el proyecto, React/Vite para interfaz y Phaser 4.2.1 para juego.
- Captura con Playwright/Chromium en un worker separado de la API Node.
- Mapas congelados: imágenes por regiones y geometría del DOM, con coordenadas y versión comunes.
- Un módulo central de daño gobierna huecos, colisiones y estadísticas.
- Sin cuenta obligatoria para jugar. Persistencia local al comienzo; almacenamiento compartido al desplegar mapas públicos.
- Modo sandbox con munición infinita configurable. Rendimiento protegido mediante límites de entidades y carga por regiones.

## Pantallas y recorrido

1. **Inicio:** nombre My-Destroy, campo de URL, acción «Destruir» y «Probar demo».
2. **Preparación:** progreso por etapas — cargar página, preparar mapa y entrar — con error explicable y opción de reintento o demo.
3. **Juego:** porcentaje arriba, arsenal abajo, personaje y cámara sobre la página; controles visibles al empezar.
4. **Pausa:** continuar, volumen, calidad, reducir efectos, reiniciar mapa y cambiar URL.
5. **Resultado opcional:** porcentaje, tiempo y reinicio. El sandbox puede continuar sin terminar automáticamente.

## Hito 0 — Dirección visual y escena de calidad

Antes de ampliar funcionalidades, construir una escena breve siguiendo `DIRECCION-ARTISTICA.md`: una página ficticia, fondo, personaje y un arma. Ajustar nitidez de sprites, legibilidad del HUD, pivotes, puntería, destello, retroceso, borde del agujero, fragmentos y sonido. La lámina `art-direction.html` sirve como composición objetivo y no sustituye esa demo.

Ya se prepararon dos packs CC0 y una fuente OFL con licencias y procedencia en `assets/`. La salida de este hito combina el núcleo mínimo de daño del Hito 1 con una revisión visual en navegador. El movimiento completo, URLs, arsenal ampliado y multijugador no son requisitos de esta primera escena.

## Hito 1 — Superficie destructible local

**Resultado visible:** una página ficticia se rompe al disparar y aparece el fondo.

| Tarea | Depende de | Termina cuando… |
| --- | --- | --- |
| Crear workspace npm y app React/Vite/Phaser | — | La demo arranca con instrucciones reproducibles |
| Definir contratos de mapa y eventos | Workspace | Se validan coordenadas, versión y recursos locales |
| Crear página fixture propia y componer el fondo con recursos seleccionados | Contratos y dirección artística | El mapa reconoce texto, imágenes y bloques sin recursos de red |
| Implementar rejilla de daño y regiones | Contratos | Un impacto modifica únicamente las regiones tocadas |
| Conectar máscaras visuales | Rejilla y fixture | Desaparece contenido real del mapa en el área alcanzada |
| Añadir pistola y escopeta | Daño y input | Se apunta con ratón y la escopeta genera dispersión reproducible |
| Añadir porcentaje y reinicio | Daño | No duplica área y reiniciar restaura exactamente el estado |
| Validar integración | Todo lo anterior | Un disparo real en navegador produce un hueco y puede deshacerse con reinicio |

Checks: daño repetido, impacto entre regiones, restauración, build, tipos y recorrido de navegador. Todavía no necesita personaje ni backend.

## Hito 2 — Personaje y plataformas

**Resultado visible:** el jugador puede recorrer y destruir el nivel.

- Crear controlador cinemático con correr, saltar y caída.
- Añadir cámara vertical y separación entre coordenadas de pantalla y mundo.
- Convertir las regiones seleccionadas en plataformas visibles; no usar el fondo blanco como sólido.
- Recortar el soporte con la rejilla de daño existente. Destruir el suelo hace caer al personaje.
- Mantener input, animación y simulación separados, con paso fijo y pausa estable.
- Añadir selección de armas por teclas y rueda, controles iniciales y opción de reducir efectos.

Checks: caída por un hueco, plataformas solapadas, cambios de cámara, reinicio durante movimiento y disparo sin perder el control del personaje.

## Hito 3 — URL a nivel

**Resultado visible:** el recorrido de inicio a juego funciona con una web pública compatible.

- Implementar API de trabajos y estados según `PLAN.md`.
- Implementar worker aislado, viewport fijo, espera acotada y carga de recursos diferidos.
- Extraer geometría visible y capturas en el mismo estado de la página.
- Generar imágenes por regiones, manifiesto validado y hash del contenido.
- Servir los recursos propios del mapa y conectarlos con el cargador del juego.
- Añadir timeout, cancelación, errores de captura, caché y presupuestos de recursos.
- Aplicar restricciones de salida del worker a navegación, redirecciones y subrecursos antes de admitir URLs arbitrarias.
- Mantener la demo como alternativa cuando una captura falle.

Checks: captura real completa de fixtures y de un corpus público definido; imagen y plataformas alineadas; página SPA; contenido largo; elementos sticky; recursos fallidos; acceso privado rechazado. No basta con devolver una captura si el juego no puede usarla.

## Hito 4 — Arsenal y sensación de juego

**Resultado visible:** primera versión completa con URL, personaje, escopeta y lanzagranadas.

- Añadir granadas con parábola, rebote, espoleta y explosión radial.
- Generar fragmentos recortados de la textura del mapa, con vida útil y cantidad acotadas.
- Añadir partículas, humo, destellos y audio después de la interacción inicial.
- Dibujar personaje y arsenal originales con estética pixel art y fondo revelado al destruir.
- Añadir pausa, volumen, reinicio, cambio de URL y calidad configurable.
- Medir una escena de referencia y ajustar presupuestos de regiones, partículas y fragmentos.

Checks: una granada explota después de cambiar de arma; el reinicio limpia efectos pendientes; las colisiones corresponden al hueco; las estadísticas siguen correctas; se puede jugar una sesión sostenida sin crecimiento continuo de memoria.

## Definición de terminado del primer producto

- Instalación reproducible con lockfile e instrucciones de desarrollo.
- Demo que funciona sin Internet ni claves.
- Recorrido de URL pública compatible hasta mapa jugable comprobado.
- Personaje, movimiento, salto, cámara y tres armas terminados.
- Destrucción visual y física conectadas al mismo estado.
- Porcentaje correcto, pausa, errores claros y reinicio completo.
- Build, tipos, pruebas del núcleo y recorrido de navegador ejecutados.
- Métricas de rendimiento con condiciones documentadas; Safari real comprobado antes de anunciarlo como compatible.
- Worker desplegado con aislamiento y límites adecuados antes de abrir capturas al público.

## Expansiones después del primer producto

1. Cohetes, láser, fuego y poder orbital como el de la referencia.
2. Reparación, combinaciones entre armas, materiales de diseño y retos.
3. Compartir mapas congelados, resultados y clips.
4. Salas multijugador con estado de terreno determinado por el servidor y reconexión.
5. Controles táctiles, editor de reglas y modos cooperativos o competitivos.

Las expansiones reutilizan el mismo formato de mapa y motor de daño. El próximo bloque de implementación es el **Hito 0: escena local de calidad**, apoyado en el núcleo de destrucción del Hito 1.
