import * as Phaser from 'phaser';
import { DestructiblePage } from '../destruction/DestructiblePage';
import { ShotAudio } from '../audio/ShotAudio';
import { COLORS, PAPER, PISTOL, WORLD } from '../tuning';
import type { Preferences, SceneCallbacks } from '../bridge';
import { screenToWorld } from '../coordinates';

type Fragment = { image: Phaser.GameObjects.Image; vx: number; vy: number; spin: number; life: number; duration: number; frame: string };
type Dust = { x: number; y: number; vx: number; vy: number; life: number; duration: number; size: number; color: number };

export class FirstScene extends Phaser.Scene {
  private surface!: DestructiblePage;
  private actor!: Phaser.GameObjects.Container;
  private arm!: Phaser.GameObjects.Graphics;
  private feet!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Graphics;
  private shadow!: Phaser.GameObjects.Ellipse;
  private audio = new ShotAudio();
  private fragments: Fragment[] = [];
  private dust: Dust[] = [];
  private keys = new Set<string>();
  private playerX = 350;
  private aim = { x: 825, y: 220 };
  private inside = false;
  private shotTime = -1000;
  private lastShot?: { x: number; y: number; mx: number; my: number; hit: boolean };
  private shots = 0;
  private hits = 0;
  private serial = 0;
  private resets = 0;
  private paused = false;
  private phase = 0;

  constructor(private prefs: Preferences, private callbacks: SceneCallbacks) { super('FirstScene'); }

  preload() { this.load.spritesheet('industrial', '/assets/industrial.png', { frameWidth: 16, frameHeight: 16 }); }

  create() {
    this.buildWorld();
    this.surface = new DestructiblePage(this);
    this.buildPlayer();
    this.effects = this.add.graphics().setDepth(50);
    this.reticle = this.add.graphics().setDepth(60);
    this.audio.setMuted(this.prefs.muted);
    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Escenario destructible. Ratón para apuntar, clic para disparar. A y D para moverte. R reinicia, M silencia y Escape pausa.');
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('pointerenter', this.onEnter);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.aim = this.pointerPosition(p); this.inside = true; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0 || this.paused) return;
      this.focus(); this.aim = this.pointerPosition(p); this.inside = true; this.shoot();
    });
    this.events.once('shutdown', () => {
      canvas.removeEventListener('keydown', this.onKeyDown);
      canvas.removeEventListener('pointerenter', this.onEnter);
      canvas.removeEventListener('pointerleave', this.onLeave);
      canvas.removeEventListener('contextmenu', this.onContextMenu);
      window.removeEventListener('keyup', this.onKeyUp); window.removeEventListener('blur', this.onBlur);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.clearEffects(); this.audio.destroy();
    });
    this.notify();
  }

  private onEnter = () => { this.inside = true; };
  private pointerPosition(pointer: Phaser.Input.Pointer) {
    const event = pointer.event as MouseEvent & { changedTouches?: TouchList };
    const point = event.changedTouches?.[0] ?? event;
    return screenToWorld(point.clientX, point.clientY, this.game.canvas.getBoundingClientRect());
  }
  private onLeave = () => { this.inside = false; this.keys.clear(); };
  private onContextMenu = (event: Event) => event.preventDefault();
  private onKeyDown = (event: KeyboardEvent) => {
    if (!['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyR', 'KeyM', 'Escape'].includes(event.code)) return;
    event.preventDefault(); this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'KeyR') this.resetLevel();
    if (event.code === 'KeyM') this.callbacks.toggleMute();
    if (event.code === 'Escape') this.setPaused(!this.paused);
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private onBlur = () => this.setPaused(true);
  private onVisibility = () => { if (document.hidden) this.setPaused(true); };

  focus() { this.game.canvas.focus({ preventScroll: true }); }
  setPreferences(value: Preferences) { this.prefs = value; this.audio.setMuted(value.muted); }
  setPaused(value: boolean) { this.paused = value; this.keys.clear(); if (value) { this.audio.stop(); this.lastShot = undefined; } this.notify(); }
  private notify() { this.callbacks.update({ shots: this.shots, hits: this.hits, percent: this.surface.mask.percent, paused: this.paused, ready: true }); }

  private buildWorld() {
    this.cameras.main.setBackgroundColor('#0b1520');
    const g = this.add.graphics();
    g.fillStyle(0x10232c).fillRect(24, 22, 1104, 488);
    for (let x = 28; x < WORLD.width; x += 48) for (let y = 20; y < 530; y += 48) {
      g.lineStyle(1, 0x79e3d8, 0.06).strokeRect(x, y, 48, 48);
      g.fillStyle(0x42616b, 0.35).fillRect(x + 3, y + 3, 2, 2);
    }
    for (let x = 70; x < 1152; x += 248) {
      g.fillStyle(0x0b1620).fillRect(x, 20, 24, 510);
      g.fillStyle(0x243b45).fillRect(x, 20, 4, 510);
      for (let y = 32; y < 520; y += 64) g.fillStyle(0x44606a).fillRect(x + 8, y, 4, 4);
    }
    // Two pipe runs and three machine bays form a continuous world beneath the paper.
    for (const y of [140, 390]) {
      g.fillStyle(0x0b151e).fillRect(30, y, 1080, 16);
      g.fillStyle(0x37535c).fillRect(30, y, 1080, 5);
      g.fillStyle(0x79e3d8, 0.32).fillRect(30, y + 6, 1080, 2);
      for (let x = 60; x < 1100; x += 96) g.fillStyle(0x54666a).fillRect(x, y - 3, 6, 22);
    }
    for (const x of [160, 500, 840]) {
      g.fillStyle(0x080f18).fillRect(x - 8, 204, 172, 152);
      g.fillStyle(0x233c46).fillRect(x, 210, 156, 136);
      g.lineStyle(2, 0x3a5960).strokeRect(x, 210, 156, 136);
      g.fillStyle(0x0c2028).fillRect(x + 10, 224, 136, 72);
      for (let j = 0; j < 7; j++) g.fillStyle(0x79e3d8, 0.18 + j * 0.06).fillRect(x + 20 + j * 16, 278 - (j % 3) * 12, 8, 10 + (j % 3) * 12);
      g.fillStyle(0x79e3d8).fillRect(x + 13, 313, 6, 6);
      for (let j = 0; j < 4; j++) g.fillStyle(0x101e28).fillRect(x + 44, 309 + j * 7, 98, 3);
    }
    for (const [x, y, frame] of [[747, 222, 267], [1044, 353, 268], [400, 329, 287], [109, 90, 267]]) {
      this.add.image(x, y, 'industrial', frame).setScale(3).setTint(0x79e3d8).setAlpha(0.45);
    }
    this.add.text(775, 435, 'THE UNDERLAYER', { fontFamily: 'monospace', fontSize: '13px', color: '#548d91', letterSpacing: 4 });
    g.fillStyle(0x050b12).fillRect(0, 530, 1152, 54);
    g.fillStyle(0x30414b).fillRect(0, 534, 1152, 4);
    for (let x = 0; x < 1152; x += 32) {
      g.fillStyle(0x1d2d37).fillRect(x, 546, 24, 3);
      if (x < 192 || x > 960) g.fillStyle(0xffb454, 0.3).fillRect(x, 536, 14, 4);
    }
    this.add.text(28, 563, 'SECTOR 01  /  CÁMARA DE PRUEBAS', { fontFamily: 'monospace', fontSize: '9px', color: '#647c89', letterSpacing: 2 });
    this.add.text(1002, 563, 'CORE • ONLINE', { fontFamily: 'monospace', fontSize: '9px', color: '#79e3d8' });
  }

  private buildPlayer() {
    this.shadow = this.add.ellipse(this.playerX, WORLD.floor - 2, 46, 8, 0x000000, 0.42).setDepth(19);
    const body = this.add.graphics();
    body.fillStyle(0x101b24).fillRect(-15, -47, 30, 46);
    body.fillStyle(0x956735).fillRect(-17, -29, 8, 22);
    body.fillStyle(COLORS.amber).fillRect(-11, -44, 23, 18).fillRect(-9, -24, 19, 15);
    body.fillStyle(0xffd494).fillRect(-8, -47, 16, 5).fillRect(-10, -23, 5, 9);
    body.fillStyle(0x172834).fillRect(-1, -39, 16, 8).fillRect(-11, -10, 23, 5);
    body.fillStyle(COLORS.cyan).fillRect(2, -38, 11, 4);
    body.fillStyle(0x805e37).fillRect(-8, -26, 17, 3);
    this.feet = this.add.graphics();
    this.actor = this.add.container(this.playerX, WORLD.floor - 4, [body, this.feet]).setDepth(30);
    this.arm = this.add.graphics().setDepth(31);
  }

  private shoot() {
    const now = this.time.now;
    if (now - this.shotTime < PISTOL.cooldown) return;
    this.shotTime = now;
    this.shots++;
    const angle = Math.atan2(this.aim.y - (WORLD.floor - 30), this.aim.x - this.playerX);
    const mx = this.playerX + Math.cos(angle) * 37, my = WORLD.floor - 30 + Math.sin(angle) * 37;
    // Aiming into the page is a depth-plane hit: the pointer selects the surface.
    // The CPU mask rejects holes. Foreground platform raycasts belong to the next milestone.
    const hit = this.surface.hit(this.aim.x, this.aim.y);
    this.lastShot = { ...this.aim, mx, my, hit };
    if (hit) {
      const result = this.surface.damage(this.aim.x, this.aim.y, PISTOL.radius, this.shots * 2.39);
      if (result.removed.length) { this.hits++; this.emitImpact(this.aim.x, this.aim.y, angle); }
    }
    this.audio.shot(hit); this.notify();
  }

  private emitImpact(x: number, y: number, angle: number) {
    for (let i = 0; i < (this.prefs.reducedMotion ? 4 : PISTOL.fragments); i++) {
      if (this.fragments.length >= PISTOL.maxFragments) this.removeFragment(0);
      const width = Phaser.Math.Between(4, 11), height = Phaser.Math.Between(3, 8);
      const sx = Phaser.Math.Clamp(Math.round(x - PAPER.x + Phaser.Math.Between(-15, 15)), 0, PAPER.width - width);
      const sy = Phaser.Math.Clamp(Math.round(y - PAPER.y + Phaser.Math.Between(-15, 15)), 0, PAPER.height - height);
      const frame = `chip-${this.serial++}`;
      this.surface.source.add(frame, 0, sx, sy, width, height);
      const image = this.add.image(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), 'paper-source', frame).setDepth(40);
      const duration = Phaser.Math.Between(350, 720);
      this.fragments.push({ image, vx: Math.cos(angle) * 60 + Phaser.Math.Between(-140, 140), vy: Phaser.Math.Between(-180, -45), spin: Phaser.Math.FloatBetween(-8, 8), life: duration, duration, frame });
    }
    for (let i = 0; i < (this.prefs.reducedMotion ? 3 : 8); i++) {
      const duration = 160 + Math.random() * 230;
      this.dust.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -25 - Math.random() * 110, life: duration, duration, size: 2 + Math.random() * 4, color: i % 3 ? 0xe9dfc9 : COLORS.amber });
    }
    this.dust = this.dust.slice(-80);
  }

  private removeFragment(index: number) {
    const [fragment] = this.fragments.splice(index, 1);
    fragment.image.destroy(); this.surface.source.remove(fragment.frame);
  }
  private clearEffects() { while (this.fragments.length) this.removeFragment(0); this.dust = []; this.lastShot = undefined; this.effects?.clear(); }
  resetLevel() {
    this.clearEffects(); this.audio.stop(); this.surface.reset(); this.keys.clear();
    this.shots = 0; this.hits = 0; this.shotTime = -1000; this.playerX = 350; this.phase = 0; this.paused = false; this.resets++; this.notify();
  }

  snapshot() { return { shots: this.shots, hits: this.hits, percent: this.surface?.mask.percent, removed: this.surface?.mask.removedCount, fragments: this.fragments.length, objects: this.children.length, sourceFrames: this.surface?.source.getFrameNames(true).length, resets: this.resets, playerX: this.playerX, paused: this.paused, muted: this.prefs.muted, reducedMotion: this.prefs.reducedMotion }; }
  solid(x: number, y: number) { return this.surface.hit(x, y); }

  update(_time: number, delta: number) {
    if (!this.surface || this.paused) return;
    const dt = Math.min(delta, 32) / 1000;
    const movement = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    this.playerX = Phaser.Math.Clamp(this.playerX + movement * 185 * dt, 48, 1104);
    this.phase += Math.abs(movement) * dt * 16;
    this.actor.x = this.playerX; this.shadow.x = this.playerX;
    const direction = this.aim.x < this.playerX ? -1 : 1;
    this.actor.scaleX = direction;
    this.feet.clear().fillStyle(0x263746).fillRect(-9, -7, 7, 9).fillRect(3, -7, 7, 9);
    const stride = movement ? Math.round(Math.sin(this.phase) * 3) : 0;
    this.feet.fillStyle(0xffb454).fillRect(-11 + stride, 0, 11, 4).fillRect(2 - stride, 0, 11, 4);
    const angle = Math.atan2(this.aim.y - (WORLD.floor - 30), this.aim.x - this.playerX);
    const elapsed = this.time.now - this.shotTime;
    const recoil = Math.max(0, 1 - elapsed / PISTOL.recovery) * 5;
    this.arm.setPosition(this.playerX, WORLD.floor - 30).setRotation(angle).setScale(1, direction);
    this.arm.clear().fillStyle(COLORS.ink).fillRect(4 - recoil, -6, 35, 12);
    this.arm.fillStyle(0x344d58).fillRect(14 - recoil, -7, 24, 8).fillRect(15 - recoil, 0, 7, 9);
    this.arm.fillStyle(COLORS.cyan).fillRect(19 - recoil, -5, 14, 2);
    this.arm.fillStyle(COLORS.amber).fillRect(5 - recoil, -2, 11, 7);
    this.effects.clear();
    if (this.lastShot && elapsed < PISTOL.flash && !this.prefs.reducedMotion) {
      const s = this.lastShot;
      this.effects.lineStyle(1, COLORS.amber, 0.55 * (1 - elapsed / PISTOL.flash)).lineBetween(s.mx, s.my, s.x, s.y);
      this.effects.fillStyle(0xfff0be).fillRect(s.mx - 3, s.my - 3, 7, 7);
      this.effects.fillStyle(COLORS.amber, 0.8).fillRect(s.mx - 7, s.my - 1, 15, 3);
      if (s.hit) this.effects.lineStyle(2, 0xffe4af, 0.65).strokeCircle(s.x, s.y, 18 + elapsed / 4);
    }
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const p = this.fragments[i]; p.life -= dt * 1000;
      if (p.life <= 0) { this.removeFragment(i); continue; }
      p.vy += 490 * dt; p.image.x += p.vx * dt; p.image.y += p.vy * dt; p.image.rotation += p.spin * dt;
      p.image.alpha = Math.min(1, p.life / 160);
      if (p.image.y > WORLD.floor - 3) { p.image.y = WORLD.floor - 3; p.vy = -Math.abs(p.vy) * 0.24; p.vx *= 0.75; }
    }
    this.dust = this.dust.filter(p => {
      p.life -= dt * 1000; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt;
      if (p.life <= 0) return false;
      this.effects.fillStyle(p.color, (p.life / p.duration) * 0.6).fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); return true;
    });
    this.reticle.clear();
    if (this.inside) {
      const { x, y } = this.aim;
      const solid = this.surface.hit(x, y);
      this.reticle.lineStyle(2, 0x10232c, 0.8).strokeCircle(x, y, 8);
      this.reticle.lineStyle(1, solid ? 0x345e59 : COLORS.cyan, 1).strokeCircle(x, y, 7);
      for (const [ax, ay, bx, by] of [[-12, 0, -5, 0], [5, 0, 12, 0], [0, -12, 0, -5], [0, 5, 0, 12]]) this.reticle.lineBetween(x + ax, y + ay, x + bx, y + by);
      if (solid) this.reticle.fillStyle(0x345e59).fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }
  }
}
