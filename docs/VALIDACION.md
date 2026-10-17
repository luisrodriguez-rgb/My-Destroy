# Validación Técnica y Pruebas de Calidad

Fecha de actualización: 17 de octubre de 2026. Revisión correspondiente a la suite integral de pruebas automatizadas sobre la primera escena, físicas de plataformas y arsenal de armas.

---

## Resumen de Resultados

- **`npm run build`**: Compilación estricta con TypeScript (`tsc --noEmit`) y empaquetado de producción con Vite 7.3.7 sin errores ni fallos de tipos.
- **`npm test`**: **21 pruebas unitarias pasadas al 100%** en Vitest:
  - 4 pruebas de `RegionMask` (daño repetido, costuras entre cuatro regiones, bordes del mapa, restauración exacta de máscara con Bayer 4×4 dithering).
  - 7 pruebas de `PlatformController` (movimiento horizontal, aceleración de gravedad, salto elástico, soporte destructible, caída al horadar plataforma, *coyote time* y *jump buffer*).
  - 3 pruebas de `DebrisManager` (triangulación Delaunay, simulación de físicas Rapier2D y control estricto de capacidad máxima).
  - 2 pruebas de `DebrisPhysics` (integración y simulación de cuerpos rígidos con colisionadores convexos de triángulo).
  - 3 pruebas de `weapons` (cálculo de dispersión angular simétrica, configuración de armas, límites de munición).
  - 2 pruebas de `coordinates` (transformaciones de pantalla a mundo con escalado y scroll).
- **`npm run test:browser`**: **6 pruebas end-to-end pasadas al 100%** en Google Chrome real mediante Playwright:
  1. *Art direction preview*: Comprueba renderizado fiel de la lámina recuperada en escritorio y móvil (390 px) sin desbordamiento.
  2. *Destruction & UI lifecycle*: Comprueba disparo con puntero, corte de huecos transparentes, no re-impacto en orificios, pausa, silencio, efectos suaves, 10 reinicios sucesivos, tecla <kbd>R</kbd>, escalado dinámico de ventana y pausa al perder el foco.
  3. *Destructible platform mechanics*: Comprueba que el personaje salta sobre el estante inferior (`y = 451`), camina sobre él, y tras disparar justo bajo sus pies destruyendo el soporte, pierde sustentación y cae por gravedad hasta la pasarela (`y = 530`).
  4. *Weapon arsenal switching & physics*: Comprueba el cambio de arma mediante teclado (<kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>) y botones de interfaz, disparo de escopeta en abanico, balística de granadas con retardo de detonación y cráter de impacto masivo.
  5. *Polygonal debris & Rapier2D physics*: Comprueba la fractura en triángulos con `delaunator`, la simulación física con `@dimforge/rapier2d-compat` y la acumulación persistente de escombros sobre el suelo y plataformas.
  6. *Endurance test (60 s)*: Sesión de fuego continuo durante 60 segundos (291 disparos) para verificar liberación de escombros y ausencia de fugas de memoria o frames residuales en Phaser.
- **Seguridad**: Cero vulnerabilidades conocidas en la auditoría de dependencias (`npm audit`).
- **Integridad de Recuperación**: Los 17 archivos originales en `My-Destroy-recuperado/` se mantienen intactos con sus huellas SHA-256 inalteradas.

---

## Métricas de la Sesión de Resistencia (1 minuto de fuego)

Entorno: macOS arm64, Chrome headless, viewport 1440 × 1100. Registro completo en `docs/previews/stress-metrics.json`.

| Métrica | Medición Registrada |
| --- | --- |
| **Clics / disparos aceptados** | 291 / 291 |
| **Impactos nuevos sobre superficie intacta** | 168 |
| **Pico de fragmentos visuales en pantalla** | 27 (límite configurado: 80) |
| **Fragmentos activos al detener el fuego** | 0 (eliminación completa) |
| **Objetos en escena antes / después** | 49 / 49 (sin acumulación) |
| **Frames activos de textura antes / después** | 1 / 1 (reutilización limpia) |
| **Intervalo requestAnimationFrame p50 / p95** | 16,7 ms / 16,7 ms (60 FPS estables) |

---

## Verificación Visual y Capturas

Las pruebas generan capturas de pantalla automáticas para auditoría visual en `docs/previews/`:
- `scene-intact.png`: Escenario antes de interactuar.
- `scene-damaged.png`: Escenario tras múltiples disparos con orificios transparentes.
- `scene-mobile.png`: Adaptación responsiva en resolución móvil (390 × 844).
- `art-direction-preview.png`: Verificación de la maqueta artística recuperada.
