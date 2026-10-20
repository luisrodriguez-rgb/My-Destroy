import { PAPER } from '../tuning';

export interface TextChar {
  id: string;
  char: string;
  paperX: number;
  paperY: number;
  worldX: number;
  worldY: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  detached: boolean;
}

export interface TextRunInput {
  id: string;
  text: string;
  x: number;      // paper relative
  y: number;      // paper relative baseline
  fontSize: number;
  fontFamily: string;
  color?: string;
}

export interface TextSplitResult {
  char: TextChar;
  radialAngle: number;
  distance: number;
}

export class DOMTextManager {
  private chars: TextChar[] = [];

  constructor(runs: TextRunInput[] = []) {
    if (runs.length > 0) {
      this.loadRuns(runs);
    }
  }

  loadRuns(runs: TextRunInput[]): void {
    this.chars = [];
    for (const run of runs) {
      const fontSize = run.fontSize;
      const fontFamily = run.fontFamily;
      const color = run.color || '#2c3431';
      const text = run.text;

      // Estimate character width proportionally or mono
      const isMono = fontFamily.toLowerCase().includes('mono');
      const avgCharWidth = isMono ? fontSize * 0.6 : fontSize * 0.52;

      let curX = run.x;
      const topY = run.y - fontSize * 0.8;

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        let chWidth = avgCharWidth;

        // Custom narrow/wide character adjustments for proportional fonts
        if (!isMono) {
          if ('ijl|!.,:;\' '.includes(ch)) chWidth = fontSize * 0.28;
          else if ('mwMW_@%'.includes(ch)) chWidth = fontSize * 0.82;
          else if (ch === ch.toUpperCase() && ch >= 'A' && ch <= 'Z') chWidth = fontSize * 0.68;
        }

        if (ch.trim().length > 0) {
          this.chars.push({
            id: `${run.id}-c${i}`,
            char: ch,
            paperX: Math.round(curX),
            paperY: Math.round(topY),
            worldX: Math.round(PAPER.x + curX),
            worldY: Math.round(PAPER.y + topY),
            width: Math.max(6, Math.round(chWidth)),
            height: Math.round(fontSize),
            fontSize,
            fontFamily,
            color,
            detached: false,
          });
        }
        curX += chWidth;
      }
    }
  }

  get totalChars(): number {
    return this.chars.length;
  }

  get remainingChars(): number {
    return this.chars.filter(c => !c.detached).length;
  }

  get detachedChars(): number {
    return this.chars.filter(c => c.detached).length;
  }

  /**
   * Evaluates blast impact against on-page characters.
   * Detaches characters whose center falls within blast radius.
   * Caps split count per shot to avoid overwhelming physics.
   */
  splitOnImpact(blastX: number, blastY: number, radius: number, maxSplits = 14): TextSplitResult[] {
    const hits: TextSplitResult[] = [];
    const maxMargin = Math.max(2, radius * 0.4);
    const maxDistSq = (radius + maxMargin) * (radius + maxMargin);

    for (const ch of this.chars) {
      if (ch.detached) continue;

      // Find closest point on character's bounding box to the blast center
      const closeX = Math.max(ch.worldX, Math.min(ch.worldX + ch.width, blastX));
      const closeY = Math.max(ch.worldY, Math.min(ch.worldY + ch.height, blastY));
      const dx = closeX - blastX;
      const dy = closeY - blastY;
      const distSq = dx * dx + dy * dy;

      if (distSq <= maxDistSq) {
        const cx = ch.worldX + ch.width / 2;
        const cy = ch.worldY + ch.height / 2;
        const radialAngle = Math.atan2(cy - blastY, cx - blastX);
        hits.push({ char: ch, radialAngle, distance: Math.sqrt(distSq) });
      }
    }

    // Sort closest to blast first
    hits.sort((a, b) => a.distance - b.distance);
    const selected = hits.slice(0, maxSplits);

    for (const item of selected) {
      item.char.detached = true;
    }

    return selected;
  }

  reset(): void {
    for (const ch of this.chars) {
      ch.detached = false;
    }
  }
}
