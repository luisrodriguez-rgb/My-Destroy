import * as Phaser from 'phaser';
import { DestructiblePage } from '../destruction/DestructiblePage';
import { ShotAudio } from '../audio/ShotAudio';
import { COLORS, PAPER, WORLD } from '../tuning';
import type { Preferences, SceneCallbacks, WeaponId } from '../bridge';
import { screenToWorld } from '../coordinates';
import { PlatformController } from '../physics/PlatformController';
import { getDemoPlatforms, type Platform } from '../platforms/demoPlatforms';
import { drawDemoPage, getDemoTextRuns } from '../fixtures/demoPage';
import type { ScrapedPageResult } from '../../server/scraper';
import { WEAPONS, WEAPON_ORDER, calculateSpreadAngles } from '../weapons/weapons';
import type { WeaponConfig } from '../weapons/types';
import { DebrisManager } from '../physics/DebrisManager';
import { DOMTextManager } from '../text/DOMTextManager';

type Fragment = { image: Phaser.GameObjects.Image; vx: number; vy: number; spin: number; life: number; duration: number; frame: string };
type Dust = { x: number; y: number; vx: number; vy: number; life: number; duration: number; size: number; color: number };
type ShotTracer = { mx: number; my: number; x: number; y: number; hit: boolean };
type Grenade = { x: number; y: number; vx: number; vy: number; fuse: number; blastRadius: number; angle: number; spin: number };
type Vortex = { x: number; y: number; vx: number; vy: number; fuse: number; maxFuse: number; blastRadius: number; angle: number; spin: number };

export interface ActiveDetachable {
  id: string;
  paperX: number;
  paperY: number;
  worldX: number;
  worldY: number;
  width: number;
  height: number;
  tag: string;
}

export class FirstScene extends Phaser.Scene {
  private surface!: DestructiblePage;
  private controller!: PlatformController;
  private debrisManager!: DebrisManager;
  private domTextManager: DOMTextManager = new DOMTextManager(getDemoTextRuns());
  private detachables: ActiveDetachable[] = [];
  private initialDetachables: ActiveDetachable[] = [];
  private currentPlatforms: Platform[] = getDemoPlatforms();
  private actor!: Phaser.GameObjects.Container;
  private arm!: Phaser.GameObjects.Graphics;
  private feet!: Phaser.GameObjects.Graphics;
  private jetpackFlames!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Graphics;
  private shadow!: Phaser.GameObjects.Ellipse;
  private audio = new ShotAudio();
  private fragments: Fragment[] = [];
  private debrisLayer!: Phaser.GameObjects.Container;
  private dust: Dust[] = [];
  private grenades: Grenade[] = [];
  private vortices: Vortex[] = [];
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
      platforms: this.currentPlatforms,
      isSolid: (x, y) => this.surface.hit(x, y),
    }, 350, WORLD.floor - 4);
    this.buildPlayer();
    this.effects = this.add.graphics().setDepth(50);
    this.reticle = this.add.graphics().setDepth(60);
    this.audio.setMuted(this.prefs.muted);

    this.debrisLayer = this.add.container(0, 0).setDepth(26);
    const debrisMaskGraphics = this.make.graphics();
    debrisMaskGraphics.fillStyle(0xffffff).fillRect(0, 0, WORLD.width, 530);
    this.debrisLayer.setMask(debrisMaskGraphics.createGeometryMask());

    this.debrisManager = new DebrisManager({
      createDebrisImage: (x, y, frameKey, originX = 0.5, originY = 0.5) => {
        const img = this.add.image(x, y, frameKey).setOrigin(originX, originY);
        this.debrisLayer.add(img);
        return img;
      },
      addDebrisPolygon: (data) => {
        const tex = this.textures.createCanvas(data.frameKey, data.width, data.height);
        if (tex) {
          const ctx = tex.context;
          ctx.clearRect(0, 0, data.width, data.height);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(data.v0.x, data.v0.y);
          ctx.lineTo(data.v1.x, data.v1.y);
          ctx.lineTo(data.v2.x, data.v2.y);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(this.surface.original, -data.cropX, -data.cropY);
          // Dark charred carbon edge for torn paper look
          ctx.strokeStyle = '#17110dbb';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          tex.refresh();
        }
      },
      addDebrisFrame: (frameKey, x, y, w, h) => {
        this.surface.source.add(frameKey, 0, x, y, w, h);
      },
      addLetterFrame: (frameKey, charData) => {
        const pad = 2;
        const w = charData.width + pad * 2;
        const h = charData.height + pad * 2;
        const tex = this.textures.createCanvas(frameKey, w, h);
        if (tex) {
          const ctx = tex.context;
          ctx.clearRect(0, 0, w, h);
          ctx.font = `${charData.fontSize}px ${charData.fontFamily}`;
          ctx.fillStyle = charData.color;
          ctx.textBaseline = 'top';
          ctx.fillText(charData.char, pad, pad);
          tex.refresh();
        }
      },
      removeDebrisFrame: (frameKey) => {
        const tex = this.textures.get(frameKey);
        if (tex) {
          tex.destroy();
        }
        this.textures.remove(frameKey);
      },
    });
    void this.debrisManager.init();
    this.initDemoDetachables();

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
      this.clearEffects(); this.audio.destroy(); this.debrisManager?.destroy();
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
      'Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3', 'Digit4', 'Numpad4', 'Digit5', 'Numpad5',
      'KeyR', 'KeyM', 'Escape',
    ];
    if (!handled.includes(event.code)) return;
    event.preventDefault(); this.keys.add(event.code);
    if (event.repeat) return;
    if (['KeyW', 'ArrowUp', 'Space'].includes(event.code)) this.controller?.requestJump();
    if (['Digit1', 'Numpad1'].includes(event.code)) this.setWeapon('pistol');
    if (['Digit2', 'Numpad2'].includes(event.code)) this.setWeapon('shotgun');
    if (['Digit3', 'Numpad3'].includes(event.code)) this.setWeapon('grenade');
    if (['Digit4', 'Numpad4'].includes(event.code)) this.setWeapon('laser');
    if (['Digit5', 'Numpad5'].includes(event.code)) this.setWeapon('vortex');
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
    this.cameras.main.setBackgroundColor('#081017');
    const g = this.add.graphics();
    // Subterranean facility hull
    g.fillStyle(0x0e1b26).fillRect(24, 22, 1104, 488);

    // High-contrast cyber grid with cyan node points
    for (let x = 28; x < WORLD.width; x += 48) {
      for (let y = 20; y < 530; y += 48) {
        g.lineStyle(1, 0x1d4658, 0.45).strokeRect(x, y, 48, 48);
        g.fillStyle(0x00f5d4, 0.5).fillRect(x + 1, y + 1, 3, 3);
      }
    }

    // Heavy vertical structural columns with illuminated cyan power bus lines
    for (const x of [70, 290, 520, 760, 990]) {
      g.fillStyle(0x08131d).fillRect(x, 20, 28, 510);
      g.fillStyle(0x234d5f).fillRect(x, 20, 4, 510);
      g.fillStyle(0x00e5ff, 0.75).fillRect(x + 12, 20, 4, 510);
      for (let y = 32; y < 520; y += 48) {
        g.fillStyle(0x79e3d8).fillRect(x + 5, y, 4, 4);
      }
    }

    // Heavy horizontal support girders with amber hazard stripes and glowing conduits
    for (const y of [138, 388]) {
      g.fillStyle(0x0a1620).fillRect(30, y, 1080, 22);
      // Hazard diagonal stripes
      for (let sx = 34; sx < 1100; sx += 24) {
        g.fillStyle(0xffb454, 0.65).fillRect(sx, y + 2, 10, 6);
      }
      // Glowing cyan fiber trunk & amber steam pipe
      g.fillStyle(0xff8c00).fillRect(30, y - 5, 1080, 4);
      g.fillStyle(0x00f5d4).fillRect(30, y + 17, 1080, 3);
      for (let x = 60; x < 1100; x += 96) {
        g.fillStyle(0x406370).fillRect(x, y - 7, 8, 30);
      }
    }

    // Mainframe terminal consoles with vibrant multicolor status LEDs and diagnostic displays
    for (const x of [150, 490, 830]) {
      g.fillStyle(0x061118).fillRect(x - 8, 204, 184, 154);
      g.fillStyle(0x1e3e4d).fillRect(x, 210, 168, 142);
      g.lineStyle(2, 0x3d7085).strokeRect(x, 210, 168, 142);
      g.fillStyle(0x0a222c).fillRect(x + 8, 218, 152, 78);

      // Multicolored LED status array: cyan, amber, magenta, emerald
      const ledColors = [0x00f5d4, 0xffb454, 0xff2a85, 0x00ff88, 0x00e5ff, 0xffd166, 0x7000ff];
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 3; row++) {
          const color = ledColors[(col + row * 2) % ledColors.length];
          g.fillStyle(color, 0.85).fillRect(x + 18 + col * 17, 226 + row * 16, 10, 8);
        }
      }

      // Telemetry frequency graph
      g.lineStyle(1.5, 0x00f5d4, 0.9);
      g.beginPath();
      for (let j = 0; j < 9; j++) {
        const px = x + 18 + j * 16;
        const py = 282 - (j % 2 ? 10 : 2);
        if (j === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();

      // Lower status indicators
      g.fillStyle(0x00f5d4).fillRect(x + 14, 316, 8, 8);
      g.fillStyle(0xff8c00).fillRect(x + 26, 316, 8, 8);
      for (let j = 0; j < 4; j++) {
        g.fillStyle(0x193645).fillRect(x + 44, 312 + j * 6, 108, 3);
      }
    }

    // High-visibility machinery sprites from industrial tileset
    for (const [x, y, frame] of [
      [747, 222, 267], [1044, 353, 268], [400, 329, 287], [109, 90, 267],
      [230, 260, 287], [630, 300, 267], [920, 260, 285],
    ]) {
      this.add.image(x, y, 'industrial', frame).setScale(3).setTint(0x00f5d4).setAlpha(0.85);
    }

    // Illuminated industrial signage
    this.add.text(760, 426, 'CORE REACTOR // SUB-LEVEL 01', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#00f5d4',
      letterSpacing: 3,
    });
    this.add.text(760, 444, 'CONTAINMENT GRID • NOMINAL', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#ffb454',
      letterSpacing: 2,
    });

    // Catwalk floor construction
    g.fillStyle(0x050b12).fillRect(0, 530, 1152, 54);
    g.fillStyle(0x30414b).fillRect(0, 534, 1152, 4);
    for (let x = 0; x < 1152; x += 32) {
      g.fillStyle(0x1d2d37).fillRect(x, 546, 24, 3);
      if (x < 192 || x > 960) g.fillStyle(0xffb454, 0.45).fillRect(x, 536, 14, 4);
    }
    this.add.text(28, 563, 'SECTOR 01  /  CÁMARA DE PRUEBAS', { fontFamily: 'monospace', fontSize: '9px', color: '#647c89', letterSpacing: 2 });
    this.add.text(1002, 563, 'CORE • ONLINE', { fontFamily: 'monospace', fontSize: '9px', color: '#00f5d4' });
  }

  private buildPlayer() {
    this.shadow = this.add.ellipse(this.controller.x, WORLD.floor - 2, 46, 8, 0x000000, 0.42).setDepth(19);
    const body = this.add.graphics();
    // High-tech Jetpack backpack on player's back
    body.fillStyle(0x192834).fillRect(-21, -38, 9, 21); // Dark chassis
    body.fillStyle(0x283e50).fillRect(-22, -36, 3, 17); // Outer plating
    body.fillStyle(0x00f5d4).fillRect(-20, -32, 2, 9);  // Cyan fuel gauge
    body.fillStyle(0x141f28).fillRect(-21, -17, 7, 5);  // Dual thruster nozzle block
    body.fillStyle(0x364d5e).fillRect(-20, -13, 2, 3).fillRect(-16, -13, 2, 3); // Metal exhaust bells

    body.fillStyle(0x101b24).fillRect(-15, -47, 30, 46);
    body.fillStyle(0x956735).fillRect(-17, -29, 8, 22);
    body.fillStyle(COLORS.amber).fillRect(-11, -44, 23, 18).fillRect(-9, -24, 19, 15);
    body.fillStyle(0xffd494).fillRect(-8, -47, 16, 5).fillRect(-10, -23, 5, 9);
    body.fillStyle(0x172834).fillRect(-1, -39, 16, 8).fillRect(-11, -10, 23, 5);
    body.fillStyle(COLORS.cyan).fillRect(2, -38, 11, 4);
    body.fillStyle(0x805e37).fillRect(-8, -26, 17, 3);
    this.feet = this.add.graphics();
    this.jetpackFlames = this.add.graphics();
    this.actor = this.add.container(this.controller.x, this.controller.y, [this.jetpackFlames, body, this.feet]).setDepth(30);
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
            this.debrisManager?.applyBlastImpulse(tx, ty, weapon.radius * 1.2, 140);
            this.checkTextSplits(tx, ty, weapon.radius);
          }
        }
      });

      if (anyHit) {
        this.hits++;
        this.debrisManager?.syncPlatforms((px, py) => this.surface.hit(px, py));
        this.checkDetachables();
      }
      this.lastShot = { time: now, flash: weapon.flash, weapon: 'shotgun', tracers };
      this.audio.shotgun(anyHit);
      this.notify();
      return;
    }

    // 3. VORTEX / GRAVITATIONAL SINGULARITY
    if (this.currentWeaponId === 'vortex') {
      const proj = weapon.projectile!;
      const speed = proj.speed;
      const vx = Math.cos(baseAngle) * speed + this.controller.vx * 0.25;
      const vy = Math.sin(baseAngle) * speed + this.controller.vy * 0.25;
      this.vortices.push({
        x: mx,
        y: my,
        vx,
        vy,
        fuse: proj.fuseMs,
        maxFuse: proj.fuseMs,
        blastRadius: proj.blastRadius,
        angle: baseAngle,
        spin: 6,
      });
      this.lastShot = {
        time: now,
        flash: weapon.flash,
        weapon: 'vortex',
        tracers: [{ mx, my, x: mx + Math.cos(baseAngle) * 24, y: my + Math.sin(baseAngle) * 24, hit: false }],
      };
      this.audio.vortexLaunch();
      this.notify();
      return;
    }

    // 4. THERMAL LASER BEAM
    if (this.currentWeaponId === 'laser') {
      const hit = this.surface.hit(this.aim.x, this.aim.y);
      const tracers: ShotTracer[] = [{ mx, my, x: this.aim.x, y: this.aim.y, hit }];
      this.lastShot = { time: now, flash: weapon.flash, weapon: 'laser', tracers };

      if (hit) {
        const result = this.surface.damage(this.aim.x, this.aim.y, weapon.radius, this.shots * 1.77);
        if (result.removed.length) {
          this.hits++;
          this.emitImpact(this.aim.x, this.aim.y, baseAngle, weapon.radius, weapon.fragments);
          this.debrisManager?.applyBlastImpulse(this.aim.x, this.aim.y, weapon.radius * 1.1, 95);
          this.debrisManager?.syncPlatforms((px, py) => this.surface.hit(px, py));
          this.checkDetachables();
          this.checkTextSplits(this.aim.x, this.aim.y, weapon.radius);
        }
      }
      this.audio.laserPulse(hit);
      this.notify();
      return;
    }

    // 5. PISTOL (precision single hit)
    const hit = this.surface.hit(this.aim.x, this.aim.y);
    const tracers: ShotTracer[] = [{ mx, my, x: this.aim.x, y: this.aim.y, hit }];
    this.lastShot = { time: now, flash: weapon.flash, weapon: 'pistol', tracers };
    if (hit) {
      const result = this.surface.damage(this.aim.x, this.aim.y, weapon.radius, this.shots * 2.39);
      if (result.removed.length) {
        this.hits++;
        this.emitImpact(this.aim.x, this.aim.y, baseAngle, weapon.radius, weapon.fragments);
        this.debrisManager?.applyBlastImpulse(this.aim.x, this.aim.y, weapon.radius * 1.3, 160);
        this.debrisManager?.syncPlatforms((px, py) => this.surface.hit(px, py));
        this.checkDetachables();
        this.checkTextSplits(this.aim.x, this.aim.y, weapon.radius);
      }
    }
    this.audio.shot(hit);
    this.notify();
  }

  private emitImpact(x: number, y: number, angle: number, radius = 24, fragmentCount = 11) {
    this.debrisManager?.spawnFracture(x, y, radius, angle, Math.min(8, Math.ceil(fragmentCount / 2)), 220);
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
    this.debrisManager?.reset();
    while (this.fragments.length) this.removeFragment(0);
    this.dust = [];
    this.grenades = [];
    this.vortices = [];
    this.lastShot = undefined;
    this.effects?.clear();
  }

  private initDemoDetachables(): void {
    const demoList: ActiveDetachable[] = [
      {
        id: 'demo-button',
        paperX: 50,
        paperY: 338,
        worldX: PAPER.x + 50,
        worldY: PAPER.y + 338,
        width: 142,
        height: 37,
        tag: 'button',
      },
      {
        id: 'demo-landscape',
        paperX: 598,
        paperY: 100,
        worldX: PAPER.x + 598,
        worldY: PAPER.y + 100,
        width: 458,
        height: 235,
        tag: 'img',
      },
    ];
    this.initialDetachables = [...demoList];
    this.detachables = [...demoList];
  }

  private checkDetachables(): void {
    if (!this.surface || this.detachables.length === 0) return;
    for (let i = this.detachables.length - 1; i >= 0; i--) {
      const d = this.detachables[i];
      const inset = Math.max(3, Math.min(8, Math.min(d.width, d.height) * 0.15));
      const corners = [
        { x: d.worldX + inset, y: d.worldY + inset },
        { x: d.worldX + d.width - inset, y: d.worldY + inset },
        { x: d.worldX + inset, y: d.worldY + d.height - inset },
        { x: d.worldX + d.width - inset, y: d.worldY + d.height - inset },
      ];

      let solidAnchors = 0;
      for (const pt of corners) {
        if (this.surface.hit(pt.x, pt.y)) {
          solidAnchors++;
        }
      }

      // If it loses 2 or more anchors (solidAnchors <= 2), detach!
      if (solidAnchors <= 2) {
        this.detachables.splice(i, 1);
        this.triggerDetach(d);
      }
    }
  }

  private triggerDetach(d: ActiveDetachable): void {
    const frameKey = `detachable-${d.id}-${this.serial++}`;
    const tex = this.textures.createCanvas(frameKey, d.width, d.height);
    if (tex) {
      const ctx = tex.context;
      ctx.clearRect(0, 0, d.width, d.height);
      ctx.drawImage(this.surface.original, d.paperX, d.paperY, d.width, d.height, 0, 0, d.width, d.height);
      // Subtle charred outline
      ctx.strokeStyle = '#17110dbb';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(0, 0, d.width, d.height);
      tex.refresh();
    }

    // Erase element from background surface so it doesn't leave a ghost
    this.surface.clearArea(d.paperX, d.paperY, d.width, d.height);

    // Spawn Rapier2D dynamic rigid body
    this.debrisManager?.spawnDetachable({
      id: d.id,
      x: d.worldX,
      y: d.worldY,
      width: d.width,
      height: d.height,
      tag: d.tag,
    }, frameKey);

    this.audio.debrisCrack();
    this.emitImpact(d.worldX + d.width / 2, d.worldY + d.height / 2, -Math.PI / 2, Math.min(d.width, d.height) * 0.4, 6);
  }

  private checkTextSplits(blastX: number, blastY: number, radius: number): void {
    if (!this.domTextManager || !this.debrisManager) return;
    const detached = this.domTextManager.splitOnImpact(blastX, blastY, radius, 14);
    for (const item of detached) {
      const ch = item.char;
      // Clear character area on paper so no ghost character remains
      this.surface.clearArea(ch.paperX, ch.paperY, ch.width, ch.height);

      const frameKey = `text-${ch.id}-${this.serial++}`;
      this.debrisManager.spawnLetterDebris(
        {
          id: ch.id,
          char: ch.char,
          x: ch.worldX,
          y: ch.worldY,
          width: ch.width,
          height: ch.height,
          fontSize: ch.fontSize,
          fontFamily: ch.fontFamily,
          color: ch.color,
        },
        frameKey,
        item.radialAngle,
        180
      );
    }
  }

  async loadCustomPage(data: ScrapedPageResult): Promise<void> {
    let sourceElement: HTMLCanvasElement | HTMLImageElement;

    if (data.screenshot && data.screenshot.startsWith('data:image/')) {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load page screenshot'));
        img.src = data.screenshot;
      });
      sourceElement = img;
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = PAPER.width;
      canvas.height = PAPER.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, PAPER.width, PAPER.height);
      ctx.fillStyle = '#202122';
      ctx.font = 'bold 26px Georgia';
      ctx.fillText(data.title || data.url, 48, 55);
      ctx.fillStyle = '#a2a9b1';
      ctx.fillRect(48, 72, PAPER.width - 96, 1);
      for (const p of data.platforms) {
        ctx.fillStyle = '#eaecf0';
        ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.fillStyle = '#36414c';
        ctx.font = '11px sans-serif';
        ctx.fillText(p.name, p.x + 8, p.y + Math.min(18, p.height - 4));
      }
      sourceElement = canvas;
    }

    this.clearEffects();
    this.audio.stop();
    this.keys.clear();
    this.shots = 0;
    this.hits = 0;
    this.shotTime = -1000;
    this.resets++;

    // 1. Surface: draw new image and reset regions
    this.surface.loadPage(sourceElement);

    // 2. Map platforms to world space
    const worldPlatforms: Platform[] = data.platforms.map(p => ({
      id: p.id,
      name: p.name,
      x: PAPER.x + p.x,
      y: PAPER.y + p.y,
      width: p.width,
      height: p.height,
      oneWay: true,
    }));
    this.currentPlatforms = worldPlatforms;
    this.controller.setPlatforms(worldPlatforms);
    this.debrisManager?.setPlatforms(worldPlatforms);

    // 3. Set up active detachables
    const mappedDetachables: ActiveDetachable[] = data.detachables.map(d => ({
      id: d.id,
      paperX: d.x,
      paperY: d.y,
      worldX: PAPER.x + d.x,
      worldY: PAPER.y + d.y,
      width: d.width,
      height: d.height,
      tag: d.tag,
    }));
    this.initialDetachables = [...mappedDetachables];
    this.detachables = [...mappedDetachables];

    // 4. Setup text runs for character splitting physics
    if (data.textRuns && data.textRuns.length > 0) {
      this.domTextManager.loadRuns(data.textRuns);
    } else {
      this.domTextManager.loadRuns([]);
    }

    // 5. Place player safely on catwalk
    this.controller.reset(350, WORLD.floor - 4);
    this.notify();
  }

  loadDemoPage(): void {
    this.clearEffects();
    this.audio.stop();
    this.keys.clear();
    this.shots = 0;
    this.hits = 0;
    this.shotTime = -1000;
    this.resets++;

    const demoCanvas = drawDemoPage();
    this.surface.loadPage(demoCanvas);

    const demoPlatforms = getDemoPlatforms();
    this.currentPlatforms = demoPlatforms;
    this.controller.setPlatforms(demoPlatforms);
    this.debrisManager?.setPlatforms(demoPlatforms);

    this.initDemoDetachables();
    this.domTextManager.loadRuns(getDemoTextRuns());
    this.controller.reset(350, WORLD.floor - 4);
    this.notify();
  }

  resetLevel() {
    this.clearEffects(); this.audio.stop(); this.surface.reset(); this.keys.clear();
    this.shots = 0; this.hits = 0; this.shotTime = -1000;
    this.detachables = [...this.initialDetachables];
    this.domTextManager?.reset();
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
      debris: this.debrisManager ? this.debrisManager.count : 0,
      textRemaining: this.domTextManager ? this.domTextManager.remainingChars : 0,
      textDetached: this.domTextManager ? this.domTextManager.detachedChars : 0,
      detachables: this.detachables.length,
      platforms: this.currentPlatforms.length,
      objects: this.children.length + (this.debrisLayer ? this.debrisLayer.length : 0),
      sourceFrames: this.surface?.source.getFrameNames(true).length,
      resets: this.resets,
      playerX: this.controller ? this.controller.x : 350,
      playerY: this.controller ? this.controller.y : WORLD.floor - 4,
      playerVy: this.controller ? this.controller.vy : 0,
      onGround: this.controller ? this.controller.onGround : true,
      isJetpacking: this.controller ? this.controller.isJetpacking : false,
      platform: this.controller ? this.controller.currentPlatformId : 'catwalk',
      weapon: this.currentWeaponId,
      grenades: this.grenades.length,
      vortices: this.vortices.length,
      paused: this.paused,
      muted: this.prefs.muted,
      reducedMotion: this.prefs.reducedMotion,
    };
  }
  solid(x: number, y: number) { return this.surface.hit(x, y); }

  update(_time: number, delta: number) {
    if (!this.surface || this.paused) return;
    this.debrisManager?.update();
    const dt = Math.min(delta, 32) / 1000;
    const movement = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const jump = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.keys.has('Space');
    const drop = this.keys.has('KeyS') || this.keys.has('ArrowDown');

    this.controller.update({ moveX: movement, jump, drop, dt });

    if (this.controller.onGround) {
      this.phase += Math.abs(movement) * dt * 16;
    }
    this.actor.setPosition(this.controller.x, this.controller.y);

    // Dynamic Jetpack Thruster Flames
    this.jetpackFlames.clear();
    if (this.controller.isJetpacking && !this.prefs.reducedMotion) {
      const pulse = Math.sin(this.time.now * 0.05);
      const flameLen = 14 + pulse * 5;
      const nozzleX = -18;
      const nozzleY = -11;

      // 1. Fiery red-orange outer thruster plume
      this.jetpackFlames.fillStyle(0xff4500, 0.85);
      this.jetpackFlames.fillTriangle(
        nozzleX - 4, nozzleY,
        nozzleX + 4, nozzleY,
        nozzleX, nozzleY + flameLen
      );

      // 2. Incandescent amber-yellow core
      this.jetpackFlames.fillStyle(0xffea78, 0.95);
      this.jetpackFlames.fillTriangle(
        nozzleX - 2.5, nozzleY,
        nozzleX + 2.5, nozzleY,
        nozzleX, nozzleY + flameLen * 0.65
      );

      // 3. Ultra-hot white plasma nozzle injection
      this.jetpackFlames.fillStyle(0xffffff, 1);
      this.jetpackFlames.fillRect(nozzleX - 1.5, nozzleY - 1, 3, 3);

      // Procedural audio hiss while ascending
      if (Math.random() < 0.2) {
        this.audio.jetpackHiss();
      }
    }

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

    // Continuous automatic laser firing while holding mouse button down
    if (this.input.activePointer.isDown && this.currentWeaponId === 'laser' && !this.paused) {
      this.aim = this.pointerPosition(this.input.activePointer);
      this.shoot();
    }

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
    } else if (this.currentWeaponId === 'laser') {
      // Thermal Laser: high-tech elongated rifle, cyan energy conduits, orange focusing emitter
      this.arm.fillStyle(COLORS.ink).fillRect(3 - recoil, -6, 42, 11);
      this.arm.fillStyle(0x1a2d36).fillRect(12 - recoil, -7, 28, 5);
      this.arm.fillStyle(COLORS.cyan).fillRect(16 - recoil, -5, 20, 2);
      this.arm.fillStyle(0xff6b00).fillRect(38 - recoil, -5, 7, 9);
      this.arm.fillStyle(COLORS.amber).fillRect(5 - recoil, -1, 10, 7);
    } else if (this.currentWeaponId === 'vortex') {
      // Gravitational Singularity Cannon: heavy magnetic containment coils, dark core, violet emitter
      this.arm.fillStyle(COLORS.ink).fillRect(2 - recoil, -9, 40, 17);
      this.arm.fillStyle(0x0f1722).fillRect(14 - recoil, -10, 24, 19);
      this.arm.fillStyle(0x9b5de5).fillRect(20 - recoil, -8, 8, 15);
      this.arm.fillStyle(COLORS.cyan).fillRect(32 - recoil, -6, 6, 11);
      this.arm.fillStyle(COLORS.amber).fillRect(4 - recoil, -3, 9, 9);
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
      } else if (s.weapon === 'laser') {
        const t = s.tracers[0];
        // Outer thermal glow
        this.effects.lineStyle(6, 0xff5500, 0.45 * progress).lineBetween(t.mx, t.my, t.x, t.y);
        // Mid incandescent core
        this.effects.lineStyle(3, 0xffb454, 0.8 * progress).lineBetween(t.mx, t.my, t.x, t.y);
        // Inner intense white core
        this.effects.lineStyle(1.2, 0xffffff, 0.95 * progress).lineBetween(t.mx, t.my, t.x, t.y);

        // Muzzle optic discharge
        this.effects.fillStyle(0xffffff, 0.9).fillRect(t.mx - 4, t.my - 4, 8, 8);
        this.effects.fillStyle(0xff5500, 0.7).fillRect(t.mx - 7, t.my - 2, 14, 4);

        if (t.hit) {
          this.effects.fillStyle(0xffffff, 0.9).fillCircle(t.x, t.y, 4);
          this.effects.lineStyle(2, 0xff7700, 0.8 * progress).strokeCircle(t.x, t.y, 8 + (1 - progress) * 6);
        }
      } else if (s.weapon === 'vortex') {
        const mx = s.tracers[0].mx, my = s.tracers[0].my;
        this.effects.fillStyle(0x9b5de5, 0.85 * progress).fillCircle(mx, my, 8);
        this.effects.lineStyle(2, COLORS.cyan, 0.75 * progress).strokeCircle(mx, my, 14);
      }
    }

    // Update and draw flying grenades
    const plats = this.currentPlatforms;
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
        for (const p of plats) {
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
        // Blast impulse to scatter stacked debris with radial impulse & angular torque
        this.debrisManager?.applyBlastImpulse(g.x, g.y, g.blastRadius, 520);
        this.debrisManager?.syncPlatforms((px, py) => this.surface.hit(px, py));
        this.checkDetachables();
        this.checkTextSplits(g.x, g.y, g.blastRadius);
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

    // Update and draw flying & swirling singularities
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.vy += 340 * dt;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      v.vx *= 0.96;
      v.vy *= 0.96;
      v.angle += v.spin * dt;
      v.fuse -= dt * 1000;

      // Catwalk containment
      if (v.y >= WORLD.floor - 8) {
        v.y = WORLD.floor - 8;
        v.vy = -Math.abs(v.vy) * 0.2;
        v.vx *= 0.85;
      }

      // Gravitational attraction vortex pulling nearby debris & letters
      this.debrisManager?.applyVortexPull(v.x, v.y, 220, 360, dt);

      // Periodically trigger a pulse hum
      if (Math.random() < 0.08) {
        this.audio.vortexHum();
      }

      // Gravitational Collapse / Detonation
      if (v.fuse <= 0) {
        const result = this.surface.damage(v.x, v.y, v.blastRadius, Math.random() * 9999);
        if (result.removed.length) {
          this.hits++;
          this.emitImpact(v.x, v.y, -Math.PI / 2, v.blastRadius, 32);
        }
        // Blast impulse to scatter debris outward upon collapse
        this.debrisManager?.applyBlastImpulse(v.x, v.y, v.blastRadius * 1.4, 620);
        this.debrisManager?.syncPlatforms((px, py) => this.surface.hit(px, py));
        this.checkDetachables();
        this.checkTextSplits(v.x, v.y, v.blastRadius);
        this.audio.vortexImplosion();

        if (!this.prefs.reducedMotion) {
          this.cameras.main.shake(180, 0.012);
        }

        // Violent collapse shockwave effect
        this.effects.fillStyle(0x0b1018, 0.95).fillCircle(v.x, v.y, v.blastRadius * 0.7);
        this.effects.lineStyle(4, COLORS.cyan, 0.95).strokeCircle(v.x, v.y, v.blastRadius);
        this.effects.lineStyle(2, 0x9b5de5, 0.9).strokeCircle(v.x, v.y, v.blastRadius * 1.3);

        this.vortices.splice(i, 1);
        this.notify();
        continue;
      }

      // Draw swirling accretion disk
      const vProgress = 1 - v.fuse / v.maxFuse;
      const coreR = Math.max(6, 12 * Math.sin(vProgress * Math.PI));

      // 1. Dark event horizon center
      this.effects.fillStyle(0x05070a, 0.95).fillCircle(v.x, v.y, coreR);

      // 2. Swirling glowing accretion rings
      this.effects.lineStyle(2, COLORS.cyan, 0.85);
      this.effects.strokeCircle(v.x, v.y, coreR + 4);

      this.effects.lineStyle(1.5, 0x9b5de5, 0.75);
      this.effects.strokeCircle(v.x, v.y, coreR + 9 + Math.sin(v.angle) * 3);

      this.effects.lineStyle(1, COLORS.amber, 0.6);
      this.effects.strokeCircle(v.x, v.y, coreR + 15 + Math.cos(v.angle) * 4);

      // 3. Orbiting gravitational jets
      for (let j = 0; j < 3; j++) {
        const jetAngle = v.angle + (j * Math.PI * 2) / 3;
        const jx = v.x + Math.cos(jetAngle) * (coreR + 8);
        const jy = v.y + Math.sin(jetAngle) * (coreR + 8);
        this.effects.fillStyle(0x79e3d8, 0.9).fillRect(jx - 1.5, jy - 1.5, 3, 3);
      }
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
      } else if (this.currentWeaponId === 'laser') {
        this.reticle.lineStyle(2, 0x10232c, 0.8).strokeCircle(x, y, 6);
        this.reticle.lineStyle(1, 0xff7700, 1).strokeCircle(x, y, 5);
        this.reticle.lineStyle(1, COLORS.cyan, 0.9);
        for (const [ax, ay, bx, by] of [[-10, 0, -3, 0], [3, 0, 10, 0], [0, -10, 0, -3], [0, 3, 0, 10]]) {
          this.reticle.lineBetween(x + ax, y + ay, x + bx, y + by);
        }
        this.reticle.fillStyle(0xffffff).fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      } else if (this.currentWeaponId === 'vortex') {
        this.reticle.lineStyle(2, 0x10232c, 0.8).strokeCircle(x, y, 18);
        this.reticle.lineStyle(1.5, 0x9b5de5, 1).strokeCircle(x, y, 17);
        this.reticle.lineStyle(1, COLORS.cyan, 0.8).strokeCircle(x, y, 7);
        for (const [ax, ay, bx, by] of [[-24, 0, -17, 0], [17, 0, 24, 0], [0, -24, 0, -17], [0, 17, 0, 24]]) {
          this.reticle.lineBetween(x + ax, y + ay, x + bx, y + by);
        }
        this.reticle.fillStyle(0x9b5de5).fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      }
    }
  }
}
