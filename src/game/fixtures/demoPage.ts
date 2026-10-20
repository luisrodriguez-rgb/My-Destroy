import { PAPER } from '../tuning';

export function drawDemoPage(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PAPER.width; canvas.height = PAPER.height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f3f1e9'; c.fillRect(0, 0, canvas.width, canvas.height);
  const text = (s: string, x: number, y: number, font: string, color = '#2c3431') => {
    c.font = font; c.fillStyle = color; c.fillText(s, x, y);
  };
  const line = (x: number, y: number, w: number) => { c.fillStyle = '#d5d7cd'; c.fillRect(x, y, w, 1); };
  text('the everyday internet.', 48, 48, 'bold 23px Georgia');
  text('Ideas     Historias     Explorar', 817, 46, '12px sans-serif', '#70766d');
  line(48, 70, 1008);
  text('UNA PÁGINA DE EJEMPLO   /   Nº 001', 48, 112, '10px monospace', '#7b8177');
  text('Internet,', 48, 184, '65px Georgia');
  text('hecho pedazos.', 48, 250, '65px Georgia');
  text('Todo parece estar en su sitio. Hasta que un pequeño', 50, 286, '14px sans-serif', '#73796f');
  text('agujero revela un mundo completamente diferente.', 50, 309, '14px sans-serif', '#73796f');
  c.fillStyle = '#2d423a'; c.fillRect(50, 338, 142, 37);
  text('Al otro lado   ↗', 68, 362, '12px sans-serif', '#f3f1e9');
  // Own editorial landscape, intentionally crisp and different from the pixel world beneath.
  c.save(); c.beginPath(); c.rect(598, 100, 458, 235); c.clip();
  c.fillStyle = '#c9d2bd'; c.fillRect(598, 100, 458, 235);
  c.fillStyle = '#eee8d4'; c.beginPath(); c.arc(915, 193, 86, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#93aa98'; c.beginPath(); c.moveTo(598, 264); c.bezierCurveTo(720, 141, 810, 282, 1056, 209); c.lineTo(1056, 335); c.lineTo(598, 335); c.fill();
  c.fillStyle = '#5d7b6b'; c.beginPath(); c.moveTo(598, 305); c.bezierCurveTo(740, 219, 920, 337, 1056, 240); c.lineTo(1056, 335); c.lineTo(598, 335); c.fill();
  c.restore();
  text('01 / HAY ALGO AL OTRO LADO', 598, 364, '10px monospace', '#6b776b');
  text('Lo extraordinario está bajo la superficie.', 598, 391, '21px Georgia');
  line(48, 429, 1008);
  text('Un pequeño experimento sobre las cosas que damos por hechas.', 48, 454, '11px sans-serif', '#82877b');
  text('EDICIÓN 001  ·  OCT 2026', 889, 454, '10px monospace', '#82877b');
  return canvas;
}

export function getDemoTextRuns() {
  return [
    { id: 'brand', text: 'the everyday internet.', x: 48, y: 48, fontSize: 23, fontFamily: 'Georgia', color: '#2c3431' },
    { id: 'nav', text: 'Ideas     Historias     Explorar', x: 817, y: 46, fontSize: 12, fontFamily: 'sans-serif', color: '#70766d' },
    { id: 'issue', text: 'UNA PÁGINA DE EJEMPLO   /   Nº 001', x: 48, y: 112, fontSize: 10, fontFamily: 'monospace', color: '#7b8177' },
    { id: 'h1-1', text: 'Internet,', x: 48, y: 184, fontSize: 65, fontFamily: 'Georgia', color: '#2c3431' },
    { id: 'h1-2', text: 'hecho pedazos.', x: 48, y: 250, fontSize: 65, fontFamily: 'Georgia', color: '#2c3431' },
    { id: 'p-1', text: 'Todo parece estar en su sitio. Hasta que un pequeño', x: 50, y: 286, fontSize: 14, fontFamily: 'sans-serif', color: '#73796f' },
    { id: 'p-2', text: 'agujero revela un mundo completamente diferente.', x: 50, y: 309, fontSize: 14, fontFamily: 'sans-serif', color: '#73796f' },
    { id: 'btn', text: 'Al otro lado   ↗', x: 68, y: 362, fontSize: 12, fontFamily: 'sans-serif', color: '#f3f1e9' },
    { id: 'col-header', text: '01 / HAY ALGO AL OTRO LADO', x: 598, y: 364, fontSize: 10, fontFamily: 'monospace', color: '#6b776b' },
    { id: 'col-quote', text: 'Lo extraordinario está bajo la superficie.', x: 598, y: 391, fontSize: 21, fontFamily: 'Georgia', color: '#2c3431' },
    { id: 'footer-1', text: 'Un pequeño experimento sobre las cosas que damos por hechas.', x: 48, y: 454, fontSize: 11, fontFamily: 'sans-serif', color: '#82877b' },
    { id: 'footer-2', text: 'EDICIÓN 001  ·  OCT 2026', x: 889, y: 454, fontSize: 10, fontFamily: 'monospace', color: '#82877b' },
  ];
}
