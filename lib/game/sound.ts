/** Tiny synthesized sounds, no audio files. Starts only after the viewer's click. */
export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  private tone(f: number, dur: number, type: OscillatorType = "sine", vol = 0.15, delay = 0) {
    const a = this.ctx;
    if (!a || this.muted) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur);
  }

  private noise(dur: number, freq: number, vol: number, wobble = 0) {
    const a = this.ctx;
    if (!a || this.muted) return;
    const t = a.currentTime;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource();
    s.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 3;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (wobble) {
      const l = a.createOscillator(), lg = a.createGain();
      l.frequency.value = wobble;
      lg.gain.value = freq * 0.4;
      l.connect(lg).connect(f.frequency);
      l.start(t);
      l.stop(t + dur);
    }
    s.connect(f).connect(g).connect(a.destination);
    s.start(t);
  }

  pour() { this.noise(0.7, 700, 0.22, 9); }
  clink() { this.tone(2350, 0.5, "sine", 0.12); this.tone(3120, 0.4, "sine", 0.08, 0.02); this.tone(2780, 0.45, "triangle", 0.06, 0.09); }
  eat() { this.noise(0.09, 2200, 0.15); }
  gulp() { this.tone(180, 0.12, "sine", 0.18); this.tone(140, 0.12, "sine", 0.15, 0.16); }
  pop() { this.tone(660, 0.07, "square", 0.04); }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** One audio context for the whole page, so switching venues keeps sound unlocked. */
export const sound = new Sound();
