import * as Phaser from 'phaser';
import { DestructiblePage } from '../destruction/DestructiblePage';
import { ShotAudio } from '../audio/ShotAudio';
import { COLORS, PAPER, WORLD } from '../tuning';
import type { Preferences, SceneCallbacks, WeaponId } from '../bridge';
import { screenToWorld } from '../coordinates';
import { PlatformController } from '../physics/PlatformController';
import { getDemoPlatforms } from '../platforms/demoPlatforms';
import { WEAPONS, WEAPON_ORDER, calculateSpreadAngles } from '../weapons/weapons';
import type { WeaponConfig } from '../weapons/types';

type Fragment = { image: Phaser.GameObjects.Image; vx: number; vy: number; spin: number; life: number; duration: number; frame: string };
type Dust = { x: number; y: number; vx: number; vy: number; life: number; duration: number; size: number; color: number };
type ShotTracer = { mx: number; my: number; x: number; y: number; hit: boolean };
type Grenade = { x: number; y: number; vx: number; vy: number; fuse: number; blastRadius: number; angle: number; spin: number };

export class FirstScene extends Phaser.Scene {
  private surface!: DestructiblePage;
  private controller!: PlatformController;
  private actor!: Phaser.GameObjects.Container;
  private arm!: Phaser.GameObjects.Graphics;
  private feet!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Graphics;
  private shadow!: Phaser.GameObjects.Ellipse;
  private audio = new ShotAudio();
  private fragments: Fragment[] = [];
  private dust: Dust[] = [];
  private grenades: Grenade[] = [];
  private keys = new Set<string>();
  private aim = { x: 825, y: 220 };
  private inside = false;
  private shotTime = -1000;
  private currentWeaponId: WeaponId = 'pistol';
  private lastShot?: { time: number; flash: number; weapon: WeaponId; tracers: ShotTracer[] };
  private shots = 0;
  private hits = 0;
  private serial = 0;
  private resets = 0;
  private paused = false;
  private phase = 0;

  get playerX() { return this.controller ? this.controller.x : 350; }
  get playerY() { return this.controller ? this.controller.y : WORLD.floor - 4; }
  get currentWeapon(): WeaponConfig { return WEAPONS[this.currentWeaponId as WeaponId]; }

  constructor(private prefs: Preferences, private callbacks: SceneCallbacks) { super('FirstScene'); }

  preload() { this.load.spritesheet('industrial', '/assets/industrial.png', { frameWidth: 16, frameHeight: 16 }); }

  create() {
    this.buildWorld();
    this.surface = new DestructiblePage(this);
    this.controller = new PlatformController({
      floorY: WORLD.floor - 4,
      worldBounds: { minX: 48, maxX: 1104 },
      platforms: getDemoPlatforms(),
      isSolid: (x, y) => this.surface.hit(x, y),
    }, 350, WORLD.floor - 4);
    this.buildPlayer();
    this.effects = this.add.graphics().setDepth(50);
    this.reticle = this.add.graphics().setDepth(60);
    this.audio.setMuted(this.prefs.muted);

    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Escenario destructible con plataformas y arsenal. Ratón para apuntar, clic para disparar. A/D mover, W/Espacio saltar, S bajar. 1, 2, 3 o rueda para cambiar de arma. R reinicia, M silencia y Escape pausa.');
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('pointerenter', this.onEnter);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
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
      canvas.removeEventListener('wheel', this.onWheel);
      window.removeEventListener('keyup', this.onKeyUp); window.removeEventListener('blur', this.onBlur);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.clearEffects(); this.audio.destroy();
    });
    this.notify();
  }

  setWeapon(id: WeaponId) {
    if (!WEAPONS[id as WeaponId] || this.currentWeaponId === id) return;
    this.currentWeaponId = id;
    this.shotTime = -1000;
    this.notify();
  }

  nextWeapon(direction = 1) {
    const currentIndex = WEAPON_ORDER.indexOf(this.currentWeaponId);
    const nextIndex = (currentIndex + direction + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    this.setWeapon(WEAPON_ORDER[nextIndex]);
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY > 0) this.nextWeapon(1);
    else if (event.deltaY < 0) this.nextWeapon(-1);
  };

  private onEnter = () => { this.inside = true; };
  private pointerPosition(pointer: Phaser.Input.Pointer) {
    const event = pointer.event as MouseEvent & { changedTouches?: TouchList };
    const point = event.changedTouches?.[0] ?? event;
    return screenToWorld(point.clientX, point.clientY, this.game.canvas.getBoundingClientRect());
  }
  private onLeave = () => { this.inside = false; this.keys.clear(); };
  private onContextMenu = (event: Event) => event.preventDefault();

  private onKeyDown = (event: KeyboardEvent) => {
    const handled = [
      'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'ArrowUp', 'Space', 'KeyS', 'ArrowDown',
      'Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3',
      'KeyR', 'KeyM', 'Escape',
    ];
    if (!handled.includes(event.code)) return;
    event.preventDefault(); this.keys.add(event.code);
    if (event.repeat) return;
    if (['KeyW', 'ArrowUp', 'Space'].includes(event.code)) this.controller?.requestJump();
    if (['Digit1', 'Numpad1'].includes(event.code)) this.setWeapon('pistol');
    if (['Digit2', 'Numpad2'].includes(event.code)) this.setWeapon('shotgun');
    if (['Digit3', 'Numpad3'].includes(event.code)) this.setWeapon('grenade');
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
  private notify() {
    this.callbacks.update({
      shots: this.shots,
      hits: this.hits,
      percent: this.surface.mask.percent,
      paused: this.paused,
      ready: true,
      weapon: this.currentWeaponId,
    });
  }

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
    this.shadow = this.add.ellipse(this.controller.x, WORLD.floor - 2, 46, 8, 0x000000, 0.42).setDepth(19);
    const body = this.add.graphics();
    body.fillStyle(0x101b24).fillRect(-15, -47, 30, 46);
    body.fillStyle(0x956735).fillRect(-17, -29, 8, 22);
    body.fillStyle(COLORS.amber).fillRect(-11, -44, 23, 18).fillRect(-9, -24, 19, 15);
    body.fillStyle(0xffd494).fillRect(-8, -47, 16, 5).fillRect(-10, -23, 5, 9);
    body.fillStyle(0x172834).fillRect(-1, -39, 16, 8).fillRect(-11, -10, 23, 5);
    body.fillStyle(COLORS.cyan).fillRect(2, -38, 11, 4);
    body.fillStyle(0x805e37).fillRect(-8, -26, 17, 3);
    this.feet = this.add.graphics();
    this.actor = this.add.container(this.controller.x, this.controller.y, [body, this.feet]).setDepth(30);
    this.arm = this.add.graphics().setDepth(31);
  }

  private shoot() {
    const now = this.time.now;
    const weapon = this.currentWeapon;
    if (now - this.shotTime < weapon.cooldown) return;
    this.shotTime = now;
    this.shots++;
    const shoulderY = this.controller.y - 28;
    const baseAngle = Math.atan2(this.aim.y - shoulderY, this.aim.x - this.controller.x);
    const mx = this.controller.x + Math.cos(baseAngle) * 38;
    const my = shoulderY + Math.sin(baseAngle) * 38;

    // 1. GRENADE LAUNCHER
    if (this.currentWeaponId === 'grenade') {
      const proj = weapon.projectile!;
      const speed = proj.speed;
      const vx = Math.cos(baseAngle) * speed + this.controller.vx * 0.25;
      const vy = Math.sin(baseAngle) * speed + this.controller.vy * 0.25;
      this.grenades.push({
        x: mx,
        y: my,
        vx,
        vy,
        fuse: proj.fuseMs,
        blastRadius: proj.blastRadius,
        angle: baseAngle,
        spin: (Math.random() - 0.5) * 8,
      });
      this.lastShot = {
        time: now,
        flash: weapon.flash,
        weapon: 'grenade',
        tracers: [{ mx, my, x: mx + Math.cos(baseAngle) * 22, y: my + Math.sin(baseAngle) * 22, hit: false }],
      };
      this.audio.grenadeLaunch();
      this.notify();
      return;
    }

    // 2. SHOTGUN (multi-pellet cone spread)
    if (this.currentWeaponId === 'shotgun') {
      const angles = calculateSpreadAngles(baseAngle, weapon.pellets ?? 5, weapon.spreadDeg ?? 12);
      const dist = Math.max(140, Math.hypot(this.aim.x - mx, this.aim.y - my));
      const tracers: ShotTracer[] = [];
      let anyHit = false;

      angles.forEach((pAngle, idx) => {
        const jitterDist = dist * (0.88 + Math.random() * 0.24);
        const tx = mx + Math.cos(pAngle) * jitterDist;
        const ty = my + Math.sin(pAngle) * jitterDist;
        const hit = this.surface.hit(tx, ty);
        if (hit) anyHit = true;
        tracers.push({ mx, my, x: tx, y: ty, hit });

        if (hit) {
          const result = this.surface.damage(tx, ty, weapon.radius, this.shots * 5.1 + idx);
          if (result.removed.length) {
            this.emitImpact(tx, ty, pAngle, weapon.radius, 4);
          }
        }
      });

      if (anyHit) this.hits++;
      this.lastShot = { time: now, flash: weapon.flash, weapon: 'shotgun', tracers };
      this.audio.shotgun(anyHit);
      this.notify();
      return;
    }

    // 3. PISTOL (precision single hit)
    const hit = this.surface.hit(this.aim.x, this.aim.y);
    const tracers: ShotTracer[] = [{ mx, my, x: this.aim.x, y: this.aim.y, hit }];
    this.lastShot = { time: now, flash: weapon.flash, weapon: 'pistol', tracers };
    if (hit) {
      const result = this.surface.damage(this.aim.x, this.aim.y, weapon.radius, this.shots * 2.39);
      if (result.removed.length) {
        this.hits++;
        this.emitImpact(this.aim.x, this.aim.y, baseAngle, weapon.radius, weapon.fragments);
      }
    }
    this.audio.shot(hit);
    this.notify();
  }

  private emitImpact(x: number, y: number, angle: number, radius = 24, fragmentCount = 11) {
    const count = this.prefs.reducedMotion ? Math.max(2, Math.floor(fragmentCount / 3)) : fragmentCount;
    for (let i = 0; i < count; i++) {
      if (this.fragments.length >= 80) this.removeFragment(0);
      const width = Phaser.Math.Between(4, 11), height = Phaser.Math.Between(3, 8);
      const sx = Phaser.Math.Clamp(Math.round(x - PAPER.x + Phaser.Math.Between(-15, 15)), 0, PAPER.width - width);
      const sy = Phaser.Math.Clamp(Math.round(y - PAPER.y + Phaser.Math.Between(-15, 15)), 0, PAPER.height - height);
      const frame = `chip-${this.serial++}`;
      this.surface.source.add(frame, 0, sx, sy, width, height);
      const image = this.add.image(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), 'paper-source', frame).setDepth(40);
      const duration = Phaser.Math.Between(350, 720);
      this.fragments.push({
        image,
        vx: Math.cos(angle) * 60 + Phaser.Math.Between(-140, 140),
        vy: Phaser.Math.Between(-180, -45),
        spin: Phaser.Math.FloatBetween(-8, 8),
        life: duration,
        duration,
        frame,
      });
    }
    const dustCount = this.prefs.reducedMotion ? 3 : Math.round(count * 0.8);
    for (let i = 0; i < dustCount; i++) {
      const duration = 160 + Math.random() * 230;
      this.dust.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 160,
        vy: -25 - Math.random() * 110,
        life: duration,
        duration,
        size: 2 + Math.random() * 4,
        color: i % 3 ? 0xe9dfc9 : COLORS.amber,
      });
    }
    this.dust = this.dust.slice(-80);
  }

  private removeFragment(index: number) {
    const [fragment] = this.fragments.splice(index, 1);
    fragment.image.destroy(); this.surface.source.remove(fragment.frame);
  }

  private clearEffects() {
    while (this.fragments.length) this.removeFragment(0);
    this.dust = [];
    this.grenades = [];
    this.lastShot = undefined;
    this.effects?.clear();
  }

  resetLevel() {
    this.clearEffects(); this.audio.stop(); this.surface.reset(); this.keys.clear();
    this.shots = 0; this.hits = 0; this.shotTime = -1000;
    this.controller.reset(350, WORLD.floor - 4);
    this.phase = 0; this.paused = false; this.resets++; this.notify();
  }

  snapshot() {
    return {
      shots: this.shots,
      hits: this.hits,
      percent: this.surface?.mask.percent,
      removed: this.surface?.mask.removedCount,
      fragments: this.fragments.length,
      objects: this.children.length,
      sourceFrames: this.surface?.source.getFrameNames(true).length,
      resets: this.resets,
      playerX: this.controller ? this.controller.x : 350,
      playerY: this.controller ? this.controller.y : WORLD.floor - 4,
      playerVy: this.controller ? this.controller.vy : 0,
      onGround: this.controller ? this.controller.onGround : true,
      platform: this.controller ? this.controller.currentPlatformId : 'catwalk',
      weapon: this.currentWeaponId,
      grenades: this.grenades.length,
      paused: this.paused,
      muted: this.prefs.muted,
      reducedMotion: this.prefs.reducedMotion,
    };
  }
  solid(x: number, y: number) { return this.surface.hit(x, y); }

  update(_time: number, delta: number) {
    if (!this.surface || this.paused) return;
    const dt = Math.min(delta, 32) / 1000;
    const movement = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const jump = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.keys.has('Space');
    const drop = this.keys.has('KeyS') || this.keys.has('ArrowDown');

    this.controller.update({ moveX: movement, jump, drop, dt });

    if (this.controller.onGround) {
      this.phase += Math.abs(movement) * dt * 16;
    }
    this.actor.setPosition(this.controller.x, this.controller.y);

    // Dynamic shadow projected on ground or platform below
    const ground = this.controller.findGroundBelow();
    this.shadow.x = this.controller.x;
    this.shadow.y = ground.y + 1;
    const heightAboveGround = Math.max(0, ground.y - this.controller.y);
    const shadowScale = Phaser.Math.Clamp(1 - heightAboveGround / 220, 0.35, 1);
    this.shadow.setScale(shadowScale, shadowScale * 0.7);
    this.shadow.setAlpha(0.42 * shadowScale);

    const direction = this.aim.x < this.controller.x ? -1 : 1;
    this.actor.scaleX = direction;

    // Feet animation: walking stride on ground vs dynamic airborne pose
    this.feet.clear();
    if (this.controller.onGround) {
      this.feet.fillStyle(0x263746).fillRect(-9, -7, 7, 9).fillRect(3, -7, 7, 9);
      const stride = movement ? Math.round(Math.sin(this.phase) * 3) : 0;
      this.feet.fillStyle(0xffb454).fillRect(-11 + stride, 0, 11, 4).fillRect(2 - stride, 0, 11, 4);
    } else {
      const isRising = this.controller.vy < 0;
      const yOff = isRising ? -2 : 2;
      this.feet.fillStyle(0x263746).fillRect(-9, -7 + yOff, 7, 9).fillRect(3, -7 + yOff, 7, 9);
      this.feet.fillStyle(0xffb454).fillRect(-10, yOff, 10, 4).fillRect(2, yOff, 10, 4);
    }

    const shoulderY = this.controller.y - 28;
    const angle = Math.atan2(this.aim.y - shoulderY, this.aim.x - this.controller.x);
    const w = this.currentWeapon;
    const elapsed = this.time.now - this.shotTime;
    const recoil = Math.max(0, 1 - elapsed / w.recovery) * w.recoil;

    this.arm.setPosition(this.controller.x, shoulderY).setRotation(angle).setScale(1, direction);
    this.arm.clear();

    if (this.currentWeaponId === 'pistol') {
      // Pistol: compact steel barrel, cyan battery cell, amber grip
      this.arm.fillStyle(COLORS.ink).fillRect(4 - recoil, -6, 35, 12);
      this.arm.fillStyle(0x344d58).fillRect(14 - recoil, -7, 24, 8).fillRect(15 - recoil, 0, 7, 9);
      this.arm.fillStyle(COLORS.cyan).fillRect(19 - recoil, -5, 14, 2);
      this.arm.fillStyle(COLORS.amber).fillRect(5 - recoil, -2, 11, 7);
    } else if (this.currentWeaponId === 'shotgun') {
      // Shotgun: heavy double barrel, dark steel pump slide, amber stock
      this.arm.fillStyle(COLORS.ink).fillRect(2 - recoil, -7, 44, 13);
      this.arm.fillStyle(0x2d434d).fillRect(14 - recoil, -8, 32, 6).fillRect(14 - recoil, -1, 32, 6);
      this.arm.fillStyle(0x735129).fillRect(4 - recoil, 1, 14, 8).fillRect(18 - recoil, -2, 10, 8);
      this.arm.fillStyle(COLORS.amber).fillRect(2 - recoil, -3, 8, 8);
      this.arm.fillStyle(COLORS.cyan).fillRect(32 - recoil, -4, 8, 2);
    } else if (this.currentWeaponId === 'grenade') {
      // Grenade launcher: cylindrical revolving drum, heavy reinforced barrel
      this.arm.fillStyle(COLORS.ink).fillRect(3 - recoil, -8, 38, 16);
      this.arm.fillStyle(0x344d58).fillRect(22 - recoil, -9, 19, 12);
      this.arm.fillStyle(0x1a2d36).fillRect(11 - recoil, -7, 14, 14);
      this.arm.fillStyle(COLORS.amber).fillRect(14 - recoil, -4, 8, 8);
      this.arm.fillStyle(COLORS.cyan).fillRect(34 - recoil, -6, 6, 6);
    }

    this.effects.clear();

    // Draw tracer lines & muzzle flash
    if (this.lastShot && elapsed < this.lastShot.flash && !this.prefs.reducedMotion) {
      const s = this.lastShot;
      const progress = 1 - elapsed / s.flash;

      if (s.weapon === 'pistol') {
        const t = s.tracers[0];
        this.effects.lineStyle(1, COLORS.amber, 0.55 * progress).lineBetween(t.mx, t.my, t.x, t.y);
        this.effects.fillStyle(0xfff0be).fillRect(t.mx - 3, t.my - 3, 7, 7);
        this.effects.fillStyle(COLORS.amber, 0.8).fillRect(t.mx - 7, t.my - 1, 15, 3);
        if (t.hit) this.effects.lineStyle(2, 0xffe4af, 0.65).strokeCircle(t.x, t.y, 18 + elapsed / 4);
      } else if (s.weapon === 'shotgun') {
        // Multi-pellet fiery blast
        s.tracers.forEach(t => {
          this.effects.lineStyle(1, 0xffd494, 0.6 * progress).lineBetween(t.mx, t.my, t.x, t.y);
          if (t.hit) this.effects.lineStyle(1.5, 0xffb454, 0.7 * progress).strokeCircle(t.x, t.y, 12 + elapsed / 4);
        });
        const mx = s.tracers[0].mx, my = s.tracers[0].my;
        this.effects.fillStyle(0xffffff, 0.9).fillRect(mx - 4, my - 4, 9, 9);
        this.effects.fillStyle(COLORS.amber, 0.85).fillRect(mx - 9, my - 2, 18, 5);
      } else if (s.weapon === 'grenade') {
        // Launch puff
        const mx = s.tracers[0].mx, my = s.tracers[0].my;
        this.effects.fillStyle(0xffd494, 0.7 * progress).fillRect(mx - 4, my - 4, 8, 8);
      }
    }

    // Update and draw flying grenades
    const demoPlats = getDemoPlatforms();
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vy += 860 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.angle += g.spin * dt;
      g.fuse -= dt * 1000;

      // Catwalk collision
      if (g.y >= WORLD.floor - 4) {
        g.y = WORLD.floor - 4;
        g.vy = -g.vy * 0.52;
        g.vx *= 0.88;
        if (Math.abs(g.vy) > 35) this.audio.grenadeBounce();
      } else if (g.vy > 0) {
        // Platform collisions
        for (const p of demoPlats) {
          if (g.x >= p.x - 4 && g.x <= p.x + p.width + 4 && g.y >= p.y - 4 && g.y <= p.y + 10) {
            if (this.surface.hit(g.x, p.y + 2)) {
              g.y = p.y - 2;
              g.vy = -g.vy * 0.52;
              g.vx *= 0.88;
              if (Math.abs(g.vy) > 35) this.audio.grenadeBounce();
              break;
            }
          }
        }
      }

      // Detonation
      if (g.fuse <= 0) {
        const result = this.surface.damage(g.x, g.y, g.blastRadius, Math.random() * 9999);
        if (result.removed.length) {
          this.hits++;
          this.emitImpact(g.x, g.y, -Math.PI / 2, g.blastRadius, 24);
        }
        this.audio.explosion();
        if (!this.prefs.reducedMotion) {
          this.cameras.main.shake(120, 0.007);
        }
        // Explosive flash circle
        this.effects.fillStyle(0xffffff, 0.85).fillCircle(g.x, g.y, g.blastRadius * 0.5);
        this.effects.lineStyle(3, COLORS.amber, 0.9).strokeCircle(g.x, g.y, g.blastRadius);
        this.grenades.splice(i, 1);
        this.notify();
        continue;
      }

      // Draw grenade
      const fuseBlink = Math.sin(this.time.now * 0.02) > 0;
      this.effects.fillStyle(0x1a2630).fillRect(Math.round(g.x) - 4, Math.round(g.y) - 3, 8, 6);
      this.effects.fillStyle(fuseBlink ? 0xff4d4d : COLORS.amber).fillRect(Math.round(g.x) - 2, Math.round(g.y) - 2, 4, 4);
    }

    // Update fragments
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const p = this.fragments[i]; p.life -= dt * 1000;
      if (p.life <= 0) { this.removeFragment(i); continue; }
      p.vy += 490 * dt; p.image.x += p.vx * dt; p.image.y += p.vy * dt; p.image.rotation += p.spin * dt;
      p.image.alpha = Math.min(1, p.life / 160);
      if (p.image.y > WORLD.floor - 3) { p.image.y = WORLD.floor - 3; p.vy = -Math.abs(p.vy) * 0.24; p.vx *= 0.75; }
    }

    // Update dust
    this.dust = this.dust.filter(p => {
      p.life -= dt * 1000; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt;
      if (p.life <= 0) return false;
      this.effects.fillStyle(p.color, (p.life / p.duration) * 0.6).fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); return true;
    });

    // Draw reticle according to active weapon
    this.reticle.clear();
    if (this.inside) {
      const { x, y } = this.aim;
      const solid = this.surface.hit(x, y);
      const reticleColor = solid ? 0x345e59 : COLORS.cyan;

      if (this.currentWeaponId === 'pistol') {
        this.reticle.lineStyle(2, 0x10232c, 0.8).strokeCircle(x, y, 8);
        this.reticle.lineStyle(1, reticleColor, 1).strokeCircle(x, y, 7);
        for (const [ax, ay, bx, by] of [[-12, 0, -5, 0], [5, 0, 12, 0], [0, -12, 0, -5], [0, 5, 0, 12]]) {
          this.reticle.lineBetween(x + ax, y + ay, x + bx, y + by);
        }
        if (solid) this.reticle.fillStyle(0x345e59).fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      } else if (this.currentWeaponId === 'shotgun') {
        this.reticle.lineStyle(2, 0x10232c, 0.8).strokeCircle(x, y, 16);
        this.reticle.lineStyle(1, reticleColor, 0.9).strokeCircle(x, y, 15);
        for (const [ax, ay, bx, by] of [[-20, 0, -13, 0], [13, 0, 20, 0], [0, -20, 0, -13], [0, 13, 0, 20]]) {
          this.reticle.lineBetween(x + ax, y + ay, x + bx, y + by);
        }
        this.reticle.fillStyle(reticleColor).fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      } else if (this.currentWeaponId === 'grenade') {
        this.reticle.lineStyle(2, 0x10232c, 0.8).strokeCircle(x, y, 12);
        this.reticle.lineStyle(1, COLORS.amber, 1).strokeCircle(x, y, 11);
        this.reticle.lineStyle(1, reticleColor, 0.8).strokeCircle(x, y, 4);
        for (const [ax, ay, bx, by] of [[-16, 0, -8, 0], [8, 0, 16, 0], [0, -16, 0, -8], [0, 8, 0, 16]]) {
          this.reticle.lineBetween(x + ax, y + ay, x + bx, y + by);
        }
      }
    }
  }
}
