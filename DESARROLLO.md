# My-Destroy — primera escena jugable

Aplicación local de React + TypeScript + Vite + Phaser **4.2.1**. La recuperación original permanece separada en `My-Destroy-recuperado/`. El `README.md` y `prueba.md` que ya existían no se modificaron.

## Arranque

Se ha utilizado Node 24.15.0 y npm 11.12.1.

```bash
npm ci
npm run dev
```

Abrir <http://127.0.0.1:5173/>. No necesita cuenta, claves ni backend. Tras instalar dependencias, la escena y todos sus recursos funcionan sin Internet. El comando de desarrollo genera una copia de la maqueta en `public/reference/` y sirve la dirección visual original desde el enlace del pie de página.

## Controles

| Acción | Control |
| --- | --- |
| Apuntar | Ratón |
| Disparar | Clic izquierdo, un tiro por pulsación |
| Caminar por la pasarela | A/D o flechas, con el juego enfocado |
| Reiniciar | R o botón Reiniciar |
| Silenciar | M o botón de sonido |
| Pausa | Escape o botón de pausa |
| Reducir efectos | Efectos suaves |

Hacer clic en el escenario le da el foco de teclado. Perder el foco de la ventana pausa el juego y limpia las teclas retenidas. El sonido se inicia únicamente después de un disparo. Las preferencias de sonido y efectos se conservan localmente.

## Implementado

- Página editorial ficticia y paisaje propios, siguiendo la maqueta recuperada.
- Fondo industrial con estructuras, tuberías, máquinas y piezas del atlas CC0 de Kenney.
- Personaje ámbar con visor cian, arma orientable y movimiento horizontal.
- Pistola con cadencia de 180 ms, destello de 45 ms, retroceso de 110 ms, sonido sintetizado y partículas acotadas.
- Máscara en CPU con celdas de 2 px y regiones de 128 px. Los huecos son transparentes y revelan el escenario real detrás; no son círculos pintados encima.
- Borde irregular y sombreado, fragmentos recortados de la imagen de la página y limpieza de sus frames al desaparecer.
- Colisión del disparo con la superficie usando esa misma máscara. Un clic sobre un hueco no registra otro impacto ni suma daño.
- Porcentaje basado únicamente en área nueva destruida, pausa, silencio, efectos suaves y restauración completa.
- Interfaz adaptable y aviso de que esta primera entrega está orientada a ratón y teclado.

La pistola apunta al plano de la página: el destino del disparo es la retícula. No se afirma que haya raycast físico a través de plataformas, salto, soporte destructible, captura de URLs, otras armas o poderes. El personaje camina sobre una pasarela indestructible. Son ampliaciones posteriores, conforme al hito pequeño de la dirección recuperada.

## Comprobación

```bash
npm test
npm run build
npm run test:browser
```

Las pruebas de navegador utilizan Google Chrome instalado (`channel: chrome`), inician Vite si no está sirviendo y generan capturas en `docs/previews/`. También regeneran `My-Destroy-recuperado/docs/art-direction-preview.png` sin modificar los 17 originales. Si Chrome no está instalado, instalarlo o ajustar explícitamente el canal del proyecto antes de ejecutar esas pruebas.

`npm run build` produce `dist/`; `npm run preview` sirve esa compilación en <http://127.0.0.1:4173/>. Phaser se carga en un chunk separado cuando se prepara la escena. Vite advierte sobre su tamaño: el motor ocupa aproximadamente 1,39 MB sin comprimir y 372 KB gzip en esta compilación. No se ha ocultado el aviso ni se ha retirado funcionalidad del motor sin medirla.

## Dónde continuar

- `src/game/tuning.ts`: medidas y tiempos de la pistola.
- `src/game/destruction/`: máscara, colisiones de superficie y texturas regionales.
- `src/game/scenes/FirstScene.ts`: mundo, personaje, disparo y efectos.
- `src/game/audio/ShotAudio.ts`: síntesis y ciclo de vida del audio.
- `src/app/`: interfaz, preferencias y montaje/desmontaje de Phaser.
- `docs/RECUPERACION.md`: corrección del paquete y verificación de identidad.
- `My-Destroy-recuperado/DIRECCION-ARTISTICA.md`: dirección visual original.

Los atlas y fuentes conservan sus avisos en `public/assets/`; el manifiesto completo de procedencia sigue en la carpeta recuperada. El código del proyecto todavía no tiene una licencia general elegida.
