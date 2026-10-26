import * as Phaser from 'phaser';
import { FirstScene } from './scenes/FirstScene';
import { WORLD } from './tuning';
import type { Preferences, SceneCallbacks, WeaponId } from './bridge';
import type { ScrapedPageResult } from '../server/scraper';

declare global {
  interface Window {
    __MY_DESTROY__?: {
      snapshot: FirstScene['snapshot'];
      solid: FirstScene['solid'];
      setWeapon?: (w: WeaponId) => void;
      loadCustomPage?: (data: ScrapedPageResult) => Promise<void>;
      loadDemoPage?: () => void;
    };
  }
}

export function createGame(parent: HTMLElement, prefs: Preferences, callbacks: SceneCallbacks) {
  const scene = new FirstScene(prefs, callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD.width,
    height: WORLD.height,
    backgroundColor: '#0b1018',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
    audio: { noAudio: true },
    banner: false,
  });

  if (import.meta.env.DEV) {
    window.__MY_DESTROY__ = {
      snapshot: () => scene.snapshot(),
      solid: (x, y) => scene.solid(x, y),
      setWeapon: (w: WeaponId) => scene.setWeapon(w),
      loadCustomPage: (data: ScrapedPageResult) => scene.loadCustomPage(data),
      loadDemoPage: () => scene.loadDemoPage(),
    };
  }

  return {
    controls: {
      reset: () => scene.resetLevel(),
      pause: (v: boolean) => scene.setPaused(v),
      preferences: (p: Preferences) => scene.setPreferences(p),
      focus: () => scene.focus(),
      setWeapon: (w: WeaponId) => scene.setWeapon(w),
      loadCustomPage: (data: ScrapedPageResult) => scene.loadCustomPage(data),
      loadDemoPage: () => scene.loadDemoPage(),
    },
    destroy() {
      if (import.meta.env.DEV) delete window.__MY_DESTROY__;
      game.destroy(true);
    },
  };
}
