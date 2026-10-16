/** Short synthesized voices. No network assets, autoplay, or unbounded tails. */
export class ShotAudio {
  private context?: AudioContext;
  private voices = new Set<AudioScheduledSourceNode>();
  private noise?: AudioBuffer;
  muted = false;

  shot(hit: boolean) {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      const ctx = this.context;
      void ctx.resume().catch(() => {});
      if (!this.noise) {
        this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.14, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const now = ctx.currentTime;
      const source = ctx.createBufferSource(); source.buffer = this.noise;
      const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = hit ? 850 : 1400;
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0.18, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      source.connect(filter).connect(gain).connect(ctx.destination);
      this.track(source, () => { filter.disconnect(); gain.disconnect(); });
      source.start(now); source.stop(now + 0.14);
      const body = ctx.createOscillator(); body.type = 'triangle'; body.frequency.setValueAtTime(155, now); body.frequency.exponentialRampToValueAtTime(48, now + 0.09);
      const bodyGain = ctx.createGain(); bodyGain.gain.setValueAtTime(0.2, now); bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      body.connect(bodyGain).connect(ctx.destination); this.track(body, () => bodyGain.disconnect()); body.start(now); body.stop(now + 0.11);
    } catch { /* Audio support is optional; the scene remains playable. */ }
  }
  private track(source: AudioScheduledSourceNode, cleanup: () => void) {
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); cleanup(); };
  }
  stop() { for (const voice of this.voices) { try { voice.stop(); } catch { /* Already stopped. */ } } this.voices.clear(); }
  setMuted(value: boolean) { this.muted = value; if (value) this.stop(); }
  destroy() { this.stop(); void this.context?.close().catch(() => {}); }
}
