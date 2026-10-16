import * as Phaser from 'phaser';
import { FirstScene } from './scenes/FirstScene';
import { WORLD } from './tuning';
import type { Preferences, SceneCallbacks } from './bridge';

declare global {
  interface Window { __MY_DESTROY__?: { snapshot: FirstScene['snapshot']; solid: FirstScene['solid'] } }
}

export function createGame(parent: HTMLElement, prefs: Preferences, callbacks: SceneCallbacks) {
  const scene = new FirstScene(prefs, callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, width: WORLD.width, height: WORLD.height,
    backgroundColor: '#0b1018', pixelArt: true, roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene], audio: { noAudio: true }, banner: false,
  });
  if (import.meta.env.DEV) window.__MY_DESTROY__ = { snapshot: () => scene.snapshot(), solid: (x, y) => scene.solid(x, y) };
  return {
    controls: { reset: () => scene.resetLevel(), pause: (v: boolean) => scene.setPaused(v), preferences: (p: Preferences) => scene.setPreferences(p), focus: () => scene.focus() },
    destroy() { if (import.meta.env.DEV) delete window.__MY_DESTROY__; game.destroy(true); },
  };
}
