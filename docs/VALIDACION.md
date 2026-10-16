# Validación de la primera escena

Fecha local: 15 de octubre de 2026. Esta revisión corresponde a la aplicación nueva; la lámina recuperada continúa siendo una referencia estática.

## Resultado

- `npm run build`: tipos TypeScript y build de producción correctos con Vite 7.3.7.
- `npm test`: 6 pruebas correctas. Daño repetido, costuras entre cuatro regiones, bordes del mapa, restauración exacta, entradas inválidas y conversión de coordenadas con escala/scroll.
- `npm run test:browser`: 3 pruebas correctas en Chrome 155.0.8059.82.
- La instalación final informa cero vulnerabilidades conocidas en su auditoría npm.
- Los nueve textos y ocho recursos de la recuperación conservan sus bytes verificados. `README.md` y `prueba.md` de la raíz permanecen intactos.

## Navegador y revisión visual

Se regeneró e inspeccionó `My-Destroy-recuperado/docs/art-direction-preview.png`. La lámina carga su fuente y no presenta desbordamiento horizontal a 390 px.

Se inspeccionaron las capturas de la escena intacta, dañada y móvil en `docs/previews/`. La interacción automatizada comprueba un único canvas, daño visible mediante entrada real, ausencia de colisión en un hueco, porcentaje estable al volver a disparar allí, pausa, silencio, efectos suaves, diez reinicios, movimiento, tecla R, cambio de tamaño y pérdida de foco. No se observaron errores de página ni respuestas HTTP fallidas en ese recorrido.

La prueba de cambio de tamaño detectó un desfase de coordenadas que quedó corregido: cada evento calcula su punto desde el rectángulo visible actual del canvas. También se corrigió la orientación vertical de la pistola al apuntar a la izquierda.

## Sesión de un minuto

Equipo de prueba: macOS arm64, Apple M5; Chrome headless, viewport 1440 × 1100. Datos completos en [stress-metrics.json](previews/stress-metrics.json).

| Medida | Resultado |
| --- | --- |
| Clics / disparos aceptados | 291 / 291 |
| Impactos sobre superficie aún intacta | 168 |
| Máximo de fragmentos observado en las muestras | 27; límite configurado: 80 |
| Fragmentos activos tras asentarse | 0 |
| Objetos de escena antes / después | 49 / 49 |
| Frames activos de la textura de fragmentos antes / después | 1 / 1 |
| Intervalo requestAnimationFrame p50 / p95 | 16,7 / 16,7 ms |

El contador `frameTotal` de Phaser es acumulativo en esta API y no baja al retirar frames. La comprobación usa los nombres de frames que siguen presentes, no ese contador histórico. Los resultados muestran liberación de los objetos y frames observados; no constituyen un análisis completo del heap ni una garantía de rendimiento en otros equipos.

## Límites de esta revisión

La comprobación visual se hizo mediante capturas de Chrome. El audio está integrado en el recorrido, pero su volumen y timbre todavía requieren escucha humana para la siguiente ronda de ajuste. No se ha comprobado Safari real, Firefox ni controles táctiles. Tampoco se han implementado captura de URLs, salto o plataformas físicas destructibles.

Vite conserva su aviso de tamaño para el chunk de Phaser, documentado en `../DESARROLLO.md`. El motor se descarga separado de la interfaz y los recursos artísticos se sirven localmente.
