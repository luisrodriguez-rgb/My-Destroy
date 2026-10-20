/** Short synthesized voices. No network assets, autoplay, or unbounded tails. */
export class ShotAudio {
  private context?: AudioContext;
  private voices = new Set<AudioScheduledSourceNode>();
  private noise?: AudioBuffer;
  muted = false;

  private getContext(): AudioContext | undefined {
    if (this.muted) return undefined;
    this.context ??= new AudioContext();
    void this.context.resume().catch(() => {});
    return this.context;
  }

  private getNoiseBuffer(ctx: AudioContext, seconds = 0.3): AudioBuffer {
    if (!this.noise || this.noise.duration < seconds) {
      this.noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  shot(hit: boolean) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const noiseBuf = this.getNoiseBuffer(ctx, 0.16);

      // Snap crack
      const source = ctx.createBufferSource();
      source.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = hit ? 850 : 1400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      source.connect(filter).connect(gain).connect(ctx.destination);
      this.track(source, () => { filter.disconnect(); gain.disconnect(); });
      source.start(now);
      source.stop(now + 0.14);

      // Low thump
      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(155, now);
      body.frequency.exponentialRampToValueAtTime(48, now + 0.09);
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.2, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      body.connect(bodyGain).connect(ctx.destination);
      this.track(body, () => bodyGain.disconnect());
      body.start(now);
      body.stop(now + 0.11);
    } catch { /* Audio support is optional */ }
  }

  shotgun(hit: boolean) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const noiseBuf = this.getNoiseBuffer(ctx, 0.28);

      // Dual burst noise
      const source = ctx.createBufferSource();
      source.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(400, now + 0.24);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      source.connect(filter).connect(gain).connect(ctx.destination);
      this.track(source, () => { filter.disconnect(); gain.disconnect(); });
      source.start(now);
      source.stop(now + 0.26);

      // Heavy body thump
      const body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(110, now);
      body.frequency.exponentialRampToValueAtTime(32, now + 0.18);
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.35, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      body.connect(bodyGain).connect(ctx.destination);
      this.track(body, () => bodyGain.disconnect());
      body.start(now);
      body.stop(now + 0.21);
    } catch { /* Audio support is optional */ }
  }

  grenadeLaunch() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.14);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain).connect(ctx.destination);
      this.track(osc, () => gain.disconnect());
      osc.start(now);
      osc.stop(now + 0.16);
    } catch { /* Audio support is optional */ }
  }

  grenadeBounce() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.04);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain).connect(ctx.destination);
      this.track(osc, () => gain.disconnect());
      osc.start(now);
      osc.stop(now + 0.05);
    } catch { /* Audio support is optional */ }
  }

  explosion() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const noiseBuf = this.getNoiseBuffer(ctx, 0.45);

      // Low-pass filtered rumble explosion
      const source = ctx.createBufferSource();
      source.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + 0.4);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      source.connect(filter).connect(gain).connect(ctx.destination);
      this.track(source, () => { filter.disconnect(); gain.disconnect(); });
      source.start(now);
      source.stop(now + 0.44);

      // Sub-bass sweep
      const sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(90, now);
      sub.frequency.exponentialRampToValueAtTime(22, now + 0.35);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.45, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      sub.connect(subGain).connect(ctx.destination);
      this.track(sub, () => subGain.disconnect());
      sub.start(now);
      sub.stop(now + 0.4);
    } catch { /* Audio support is optional */ }
  }

  debrisCrack() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const noiseBuf = this.getNoiseBuffer(ctx, 0.2);
      const source = ctx.createBufferSource();
      source.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      source.connect(filter).connect(gain).connect(ctx.destination);
      this.track(source, () => { filter.disconnect(); gain.disconnect(); });
      source.start(now);
      source.stop(now + 0.18);
    } catch { /* Audio support is optional */ }
  }

  laserPulse(hit: boolean) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hit ? 680 : 880, now);
      osc.frequency.exponentialRampToValueAtTime(hit ? 320 : 440, now + 0.05);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.value = 3.5;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      this.track(osc, () => { filter.disconnect(); gain.disconnect(); });
      osc.start(now);
      osc.stop(now + 0.05);
    } catch { /* Audio support is optional */ }
  }

  vortexLaunch() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.32);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc.connect(gain).connect(ctx.destination);
      this.track(osc, () => gain.disconnect());
      osc.start(now);
      osc.stop(now + 0.35);
    } catch { /* Audio support is optional */ }
  }

  vortexHum() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.linearRampToValueAtTime(95, now + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain).connect(ctx.destination);
      this.track(osc, () => gain.disconnect());
      osc.start(now);
      osc.stop(now + 0.15);
    } catch { /* Audio support is optional */ }
  }

  vortexImplosion() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // 1. Vacuum sub-bass suck
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(45, now);
      sub.frequency.exponentialRampToValueAtTime(16, now + 0.45);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.48, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      sub.connect(subGain).connect(ctx.destination);
      this.track(sub, () => subGain.disconnect());
      sub.start(now);
      sub.stop(now + 0.5);

      // 2. Cosmic implosion boom noise
      const noiseBuf = this.getNoiseBuffer(ctx, 0.45);
      const source = ctx.createBufferSource();
      source.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.42);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

      source.connect(filter).connect(gain).connect(ctx.destination);
      this.track(source, () => { filter.disconnect(); gain.disconnect(); });
      source.start(now);
      source.stop(now + 0.46);
    } catch { /* Audio support is optional */ }
  }

  jetpackHiss() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const noiseBuf = this.getNoiseBuffer(ctx, 0.12);
      const source = ctx.createBufferSource();
      source.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.Q.value = 1.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      source.connect(filter).connect(gain).connect(ctx.destination);
      this.track(source, () => { filter.disconnect(); gain.disconnect(); });
      source.start(now);
      source.stop(now + 0.1);
    } catch { /* Audio support is optional */ }
  }

  private track(source: AudioScheduledSourceNode, cleanup: () => void) {
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); cleanup(); };
  }

  stop() { for (const voice of this.voices) { try { voice.stop(); } catch { /* Already stopped. */ } } this.voices.clear(); }
  setMuted(value: boolean) { this.muted = value; if (value) this.stop(); }
  destroy() { this.stop(); void this.context?.close().catch(() => {}); }
}
