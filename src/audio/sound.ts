/**
 * Web Audio APIによるプロシージャル効果音とBGM。外部音源ファイルは使わない。
 * AudioContextはユーザー操作後に初期化する（自動再生制限対応）。
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private nextNoteTime = 0;
  private stepIndex = 0;
  private intensity = 1; // 1: 序盤, 2: 中盤(5:00〜), 3: ボス
  muted = false;

  /** ユーザー操作のタイミングで呼ぶ */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.16;
    this.bgmGain.connect(this.master);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // --- SFXプリミティブ -------------------------------------------------------
  private tone(
    freq: number, dur: number, type: OscillatorType, vol: number,
    slideTo?: number, delay = 0,
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // --- 効果音 ----------------------------------------------------------------
  swing(): void { this.noise(0.08, 0.10, 1200); }
  /** プロローグのページ送り（柔らかい鈴の音） */
  page(): void { this.tone(660, 0.5, 'sine', 0.05, 658); this.tone(990, 0.6, 'sine', 0.025, 988, 0.04); }
  hit(): void { this.noise(0.05, 0.12, 2500); this.tone(180, 0.06, 'square', 0.05, 120); }
  kill(): void { this.tone(330, 0.1, 'square', 0.08, 110); }
  gem(): void { this.tone(880, 0.07, 'sine', 0.05, 1320); }
  meat(): void { this.noise(0.12, 0.2, 700); this.tone(140, 0.12, 'sine', 0.1, 90); }
  hurt(): void { this.tone(140, 0.18, 'sawtooth', 0.16, 70); this.noise(0.1, 0.1, 900); }
  levelup(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.07, undefined, i * 0.07));
  }
  roar(): void { this.tone(90, 0.5, 'sawtooth', 0.22, 45); this.noise(0.4, 0.15, 500); }
  stomp(): void { this.tone(70, 0.25, 'sine', 0.3, 30); this.noise(0.15, 0.2, 400); }
  bone(): void { this.noise(0.05, 0.07, 3000); }
  pig(): void { this.tone(440, 0.08, 'square', 0.1, 660); this.tone(330, 0.1, 'square', 0.1, 220, 0.09); }
  summon(): void { this.tone(220, 0.2, 'triangle', 0.12, 440); }
  bossSpawn(): void {
    [0, 0.25, 0.5].forEach((d) => this.tone(110, 0.22, 'sawtooth', 0.2, 80, d));
  }
  win(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'square', 0.09, undefined, i * 0.13));
  }
  lose(): void {
    [330, 277, 233, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, undefined, i * 0.18));
  }

  // --- エンディングテーマ（オルゴール調・約30秒を一括スケジュール） ---------------
  private endingGain: GainNode | null = null;

  playEndingTheme(): void {
    if (!this.ctx || !this.master) return;
    this.stopEndingTheme();
    this.endingGain = this.ctx.createGain();
    this.endingGain.gain.value = 0.3;
    this.endingGain.connect(this.master);
    const t0 = this.ctx.currentTime + 0.3;
    const beat = 0.62;

    // C - G - Am - F の循環（オルゴールのアルペジオ + 柔らかいパッド + 低音）
    const chords: number[][] = [
      [261.6, 329.6, 392.0, 523.3],
      [196.0, 246.9, 392.0, 493.9],
      [220.0, 261.6, 329.6, 440.0],
      [174.6, 261.6, 349.2, 440.0],
    ];
    const roots = [65.4, 49.0, 55.0, 43.7];
    for (let bar = 0; bar < 12; bar++) {
      const chord = chords[bar % 4];
      const barT = t0 + bar * beat * 4;
      // 低音とパッド
      this.box(roots[bar % 4], barT, beat * 4.1, 'sine', 0.22);
      this.box(chord[0], barT, beat * 4.0, 'triangle', 0.07);
      this.box(chord[1], barT, beat * 4.0, 'triangle', 0.06);
      // オルゴールの分散和音
      for (let n = 0; n < 8; n++) {
        const note = chord[[0, 2, 1, 3, 2, 1, 3, 2][n]] * 2;
        this.box(note, barT + n * beat * 0.5, beat * 1.6, 'sine', 0.12);
      }
    }
    // 終止音
    this.box(523.3, t0 + 12 * beat * 4, 4, 'sine', 0.14);
    this.box(261.6, t0 + 12 * beat * 4, 4, 'sine', 0.12);
    this.box(65.4, t0 + 12 * beat * 4, 4.2, 'sine', 0.2);
  }

  stopEndingTheme(): void {
    if (this.endingGain) {
      this.endingGain.disconnect();
      this.endingGain = null;
    }
  }

  /** エンディング専用ゲインに直接鳴らすトーン */
  private box(freq: number, t0: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.endingGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.endingGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // --- BGM（16ステップのループシーケンサ） -------------------------------------
  startBgm(): void {
    if (!this.ctx || this.bgmTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.stepIndex = 0;
    this.bgmTimer = setInterval(() => this.scheduleBgm(), 40) as unknown as number;
  }

  stopBgm(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  setIntensity(level: 1 | 2 | 3): void {
    this.intensity = level;
  }

  private scheduleBgm(): void {
    if (!this.ctx || !this.bgmGain || this.muted) {
      if (this.ctx) this.nextNoteTime = Math.max(this.nextNoteTime, this.ctx.currentTime + 0.05);
      return;
    }
    const stepDur = this.intensity >= 3 ? 0.115 : this.intensity >= 2 ? 0.125 : 0.14;
    while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.stepIndex % 16, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.stepIndex++;
    }
  }

  private bgmTone(freq: number, t0: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private playStep(step: number, t0: number, stepDur: number): void {
    if (!this.ctx) return;
    // キック（1拍ごと）
    if (step % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
      gain.gain.setValueAtTime(0.9, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      osc.connect(gain);
      gain.connect(this.bgmGain!);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    }
    // ベース（Aマイナーの威圧的なリフ）
    const bassLine = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 65.4, 0];
    const bass = bassLine[step];
    if (bass > 0) this.bgmTone(bass, t0, stepDur * 1.8, 'sawtooth', 0.5);
    // ハイハット
    if (step % 2 === 1) this.bgmTone(6000 + Math.random() * 2000, t0, 0.03, 'square', 0.04);
    // 中盤以降: 上モノのアルペジオ
    if (this.intensity >= 2) {
      const arp = [220, 0, 262, 0, 330, 0, 262, 0, 220, 0, 196, 0, 262, 0, 330, 392];
      const note = arp[step];
      if (note > 0) this.bgmTone(note, t0, stepDur * 1.2, 'square', 0.12);
    }
    // ボス戦: 追いの高音
    if (this.intensity >= 3 && step % 4 === 2) {
      this.bgmTone(440, t0, stepDur, 'sawtooth', 0.1);
    }
  }
}
