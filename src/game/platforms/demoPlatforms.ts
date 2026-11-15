import { PAPER, type PlatformMaterial } from '../tuning';

export type { PlatformMaterial } from '../tuning';

export interface Platform {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  oneWay: boolean;
  /** Surface material driving traction, bounce and structural strength. Defaults to 'paper'. */
  material?: PlatformMaterial;
}

/**
 * Geometric platforms mapped directly to the visual elements rendered in demoPage.ts.
 * Each platform can be stood on as long as the underlying CPU mask remains solid.
 */
export function getDemoPlatforms(): Platform[] {
  return [
    // 1. Footer shelf across the lower section of the editorial page
    {
      id: 'footer-shelf',
      name: 'Estante inferior editorial',
      x: PAPER.x + 48,
      y: PAPER.y + 429, // world y = 451
      width: 1008,
      height: 12,
      oneWay: true,
      material: 'concrete',
    },
    // 2. Button card: "Al otro lado ↗"
    {
      id: 'button-card',
      name: 'Tarjeta botón "Al otro lado"',
      x: PAPER.x + 50,
      y: PAPER.y + 338, // world y = 360
      width: 142,
      height: 37,
      oneWay: true,
      material: 'elastic',
    },
    // 3. Right story block / subtitle card
    {
      id: 'story-card',
      name: 'Bloque de historia derecha',
      x: PAPER.x + 598,
      y: PAPER.y + 360, // world y = 382
      width: 458,
      height: 20,
      oneWay: true,
      material: 'wood',
    },
    // 4. Headline card ledge: "Internet, hecho pedazos."
    {
      id: 'headline-shelf',
      name: 'Titular principal',
      x: PAPER.x + 48,
      y: PAPER.y + 260, // world y = 282
      width: 420,
      height: 16,
      oneWay: true,
      material: 'concrete',
    },
    // 5. Editorial landscape middle shelf
    {
      id: 'landscape-shelf',
      name: 'Lámina editorial / horizonte',
      x: PAPER.x + 598,
      y: PAPER.y + 240, // world y = 262
      width: 458,
      height: 20,
      oneWay: true,
      material: 'glass',
    },
    // 6. Editorial landscape top edge
    {
      id: 'landscape-top',
      name: 'Lámina editorial / borde superior',
      x: PAPER.x + 598,
      y: PAPER.y + 100, // world y = 122
      width: 458,
      height: 14,
      oneWay: true,
      material: 'glass',
    },
    // 7. Top navigation bar
    {
      id: 'nav-shelf',
      name: 'Barra de navegación superior',
      x: PAPER.x + 48,
      y: PAPER.y + 70, // world y = 92
      width: 1008,
      height: 12,
      oneWay: true,
      material: 'metal',
    },
  ];
}
