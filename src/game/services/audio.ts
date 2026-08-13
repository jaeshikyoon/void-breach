export type SfxName =
  | 'ui-click'
  | 'shoot'
  | 'impact'
  | 'critical'
  | 'pickup'
  | 'dash'
  | 'skill'
  | 'explosion'
  | 'level-up'
  | 'warning'
  | 'boss-roar';

export interface AudioLevels {
  master: number;
  sfx: number;
  muted: boolean;
}

export interface PlaySfxOptions {
  volume?: number;
  playbackRate?: number;
  pan?: number;
}

export interface AudioSystemOptions extends Partial<AudioLevels> {
  maxVoices?: number;
}

type BrowserAudioContext = AudioContext;

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

/** Lightweight procedural audio; no network or asset load is required. */
export class AudioSystem {
  private context: BrowserAudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly maxVoices: number;
  private activeVoices = 0;
  private levels: AudioLevels;
  private disposed = false;

  constructor(options: AudioSystemOptions = {}) {
    this.levels = {
      master: clamp(options.master ?? 0.8),
      sfx: clamp(options.sfx ?? 0.9),
      muted: options.muted ?? false,
    };
    this.maxVoices = Math.max(4, Math.floor(options.maxVoices ?? 32));
  }

  get settings(): AudioLevels {
    return { ...this.levels };
  }

  get isReady(): boolean {
    return this.context !== null && this.context.state !== 'closed';
  }

  /** Must be called from a click/tap before sounds can play on mobile browsers. */
  async unlock(): Promise<boolean> {
    if (this.disposed || typeof AudioContext === 'undefined') return false;
    try {
      this.ensureContext();
      if (this.context?.state === 'suspended') await this.context.resume();
      return this.context?.state === 'running';
    } catch {
      return false;
    }
  }

  setMasterVolume(value: number): void {
    this.levels.master = clamp(value);
    this.applyMasterLevel();
  }

  setSfxVolume(value: number): void {
    this.levels.sfx = clamp(value);
  }

  setMuted(muted: boolean): void {
    this.levels.muted = muted;
    this.applyMasterLevel();
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  play(name: SfxName, options: PlaySfxOptions = {}): boolean {
    if (this.disposed || this.levels.muted || this.levels.master <= 0 || this.levels.sfx <= 0) {
      return false;
    }
    try {
      const context = this.ensureContext();
      if (context.state !== 'running' || this.activeVoices >= this.maxVoices) return false;
      const volume = clamp(options.volume ?? 1) * this.levels.sfx;
      const rate = clamp(options.playbackRate ?? 1, 0.5, 2);
      const pan = clamp(options.pan ?? 0, -1, 1);

      switch (name) {
        case 'ui-click':
          this.tone(680 * rate, 920 * rate, 0.045, volume * 0.16, 'sine', pan);
          break;
        case 'shoot':
          this.tone(230 * rate, 95 * rate, 0.085, volume * 0.2, 'square', pan);
          this.noise(0.045, volume * 0.06, 1_600, pan);
          break;
        case 'impact':
          this.noise(0.08, volume * 0.18, 950, pan);
          this.tone(110 * rate, 55 * rate, 0.11, volume * 0.18, 'sine', pan);
          break;
        case 'critical':
          this.noise(0.13, volume * 0.26, 1_450, pan);
          this.tone(180 * rate, 48 * rate, 0.18, volume * 0.28, 'sawtooth', pan);
          break;
        case 'pickup':
          this.arpeggio([620, 820, 1_080], 0.045, volume * 0.13, rate, pan);
          break;
        case 'dash':
          this.noise(0.15, volume * 0.13, 2_800, pan);
          this.tone(440 * rate, 125 * rate, 0.16, volume * 0.12, 'sine', pan);
          break;
        case 'skill':
          this.tone(180 * rate, 780 * rate, 0.28, volume * 0.21, 'sawtooth', pan);
          this.tone(280 * rate, 1_120 * rate, 0.24, volume * 0.11, 'sine', pan, 0.035);
          break;
        case 'explosion':
          this.noise(0.42, volume * 0.36, 720, pan);
          this.tone(95 * rate, 32 * rate, 0.48, volume * 0.35, 'sine', pan);
          break;
        case 'level-up':
          this.arpeggio([392, 523.25, 659.25, 783.99], 0.09, volume * 0.18, rate, pan);
          break;
        case 'warning':
          this.tone(190 * rate, 155 * rate, 0.22, volume * 0.24, 'square', pan);
          this.tone(190 * rate, 155 * rate, 0.22, volume * 0.24, 'square', pan, 0.3);
          break;
        case 'boss-roar':
          this.noise(0.8, volume * 0.28, 500, pan);
          this.tone(82 * rate, 38 * rate, 0.85, volume * 0.42, 'sawtooth', pan);
          break;
      }
      return true;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const context = this.context;
    this.context = null;
    this.masterGain = null;
    this.compressor = null;
    this.noiseBuffer = null;
    if (context && context.state !== 'closed') await context.close();
  }

  private ensureContext(): BrowserAudioContext {
    if (this.disposed) throw new Error('AudioSystem has been disposed.');
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') throw new Error('Web Audio is unavailable.');

    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.masterGain = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 7;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.context.destination);
    this.applyMasterLevel();
    return this.context;
  }

  private applyMasterLevel(): void {
    if (!this.masterGain || !this.context) return;
    const target = this.levels.muted ? 0 : this.levels.master;
    this.masterGain.gain.setTargetAtTime(target, this.context.currentTime, 0.015);
  }

  private routeToOutput(source: AudioNode, pan: number): () => void {
    const context = this.ensureContext();
    if (!this.masterGain) throw new Error('Audio graph is unavailable.');
    if (typeof context.createStereoPanner !== 'function') {
      source.connect(this.masterGain);
      return () => source.disconnect();
    }
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.masterGain);
    source.connect(panner);
    return () => {
      source.disconnect();
      panner.disconnect();
    };
  }

  private tone(
    startHz: number,
    endHz: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    pan: number,
    delay = 0,
  ): void {
    if (this.activeVoices >= this.maxVoices) return;
    const context = this.ensureContext();
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, startHz), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    const disconnectOutput = this.routeToOutput(gain, pan);
    this.activeVoices += 1;
    oscillator.onended = () => {
      oscillator.disconnect();
      disconnectOutput();
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.015);
  }

  private noise(duration: number, volume: number, cutoff: number, pan: number): void {
    if (this.activeVoices >= this.maxVoices) return;
    const context = this.ensureContext();
    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.getNoiseBuffer();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.25), now + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    const disconnectOutput = this.routeToOutput(gain, pan);
    this.activeVoices += 1;
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      disconnectOutput();
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
    source.start(now);
    source.stop(now + duration + 0.01);
  }

  private arpeggio(
    frequencies: readonly number[],
    spacing: number,
    volume: number,
    rate: number,
    pan: number,
  ): void {
    frequencies.forEach((frequency, index) => {
      this.tone(
        frequency * rate,
        frequency * 1.06 * rate,
        spacing * 2.2,
        volume,
        'sine',
        pan,
        index * spacing,
      );
    });
  }

  private getNoiseBuffer(): AudioBuffer {
    const context = this.ensureContext();
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(context.sampleRate);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }
}
