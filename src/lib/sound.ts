type SoundNote = {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
  delayMs?: number;
  detuneCents?: number;
  shimmer?: number;
  attackMs?: number;
  releaseMs?: number;
  vibratoHz?: number;
  vibratoDepth?: number;
};

export type ArcaneSoundEvent =
  | 'buttonClick'
  | 'tileSelect'
  | 'move'
  | 'invalidMove'
  | 'match'
  | 'win'
  | 'lose'
  | 'tipReveal';

const MASTER_VOLUME = 0.2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Tiny event-based synthesizer for arcade SFX.
 * Uses Web Audio so there are no external sound assets to license or ship.
 */
export class ArcaneSoundEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private delayInput: GainNode | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return;
    }

    if (!this.context) {
      this.context = new Ctx();
      this.masterGain = this.context.createGain();
      this.delayInput = this.context.createGain();
      this.masterGain.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.masterGain.connect(this.context.destination);

      // Lightweight feedback delay for mystical tails.
      const delayNode = this.context.createDelay(1.2);
      const feedback = this.context.createGain();
      const toneFilter = this.context.createBiquadFilter();
      const wetLevel = this.context.createGain();

      delayNode.delayTime.value = 0.18;
      feedback.gain.value = 0.34;
      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = 1800;
      wetLevel.gain.value = 0.28;

      this.delayInput.gain.value = 0.85;
      this.delayInput.connect(delayNode);
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      delayNode.connect(toneFilter);
      toneFilter.connect(wetLevel);
      wetLevel.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;
    if (this.context && this.masterGain) {
      const now = this.context.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(nextMuted ? 0 : MASTER_VOLUME, now, 0.01);
    }
  }

  play(event: ArcaneSoundEvent, intensity = 1): void {
    if (!this.context || !this.masterGain || this.muted) {
      return;
    }

    switch (event) {
      case 'buttonClick':
        this.playNotes([
          { frequency: 510, durationMs: 55, type: 'triangle', gain: 0.14, shimmer: 0.2 },
          { frequency: 765, durationMs: 90, type: 'sine', gain: 0.1, delayMs: 34, shimmer: 0.32 },
        ]);
        break;
      case 'tileSelect':
        this.playNotes([
          { frequency: 680, durationMs: 40, type: 'sine', gain: 0.09, shimmer: 0.14 },
          { frequency: 1020, durationMs: 55, type: 'triangle', gain: 0.05, delayMs: 18, shimmer: 0.2 },
        ]);
        break;
      case 'move':
        this.playNotes([
          { frequency: 230, durationMs: 75, type: 'triangle', gain: 0.16, shimmer: 0.15, detuneCents: -4 },
          { frequency: 345, durationMs: 85, type: 'triangle', gain: 0.13, delayMs: 30, shimmer: 0.22, detuneCents: 5 },
          { frequency: 468, durationMs: 96, type: 'sine', gain: 0.1, delayMs: 58, shimmer: 0.28 },
        ]);
        this.playNoiseBurst({ durationMs: 90, gain: 0.014, delayMs: 18, startFreq: 1100, endFreq: 500 });
        break;
      case 'invalidMove':
        this.playNotes([
          {
            frequency: 240,
            durationMs: 120,
            type: 'sawtooth',
            gain: 0.13,
            attackMs: 6,
            releaseMs: 130,
            shimmer: 0.08,
            detuneCents: -16,
          },
          {
            frequency: 156,
            durationMs: 190,
            type: 'sawtooth',
            gain: 0.12,
            delayMs: 50,
            releaseMs: 180,
            shimmer: 0.06,
            detuneCents: -8,
          },
        ]);
        this.playNoiseBurst({ durationMs: 180, gain: 0.02, delayMs: 20, startFreq: 520, endFreq: 120 });
        break;
      case 'match': {
        const capped = clamp(intensity, 1, 5);
        const base = 390 + capped * 42;
        this.playNotes([
          {
            frequency: base,
            durationMs: 80,
            type: 'triangle',
            gain: 0.12 + capped * 0.007,
            shimmer: 0.2,
            vibratoHz: 4.2,
            vibratoDepth: 8,
          },
          {
            frequency: base * 1.26,
            durationMs: 90,
            type: 'triangle',
            gain: 0.11 + capped * 0.006,
            delayMs: 30,
            shimmer: 0.3,
            detuneCents: 6,
          },
          {
            frequency: base * 1.51,
            durationMs: 130,
            type: 'sine',
            gain: 0.095 + capped * 0.005,
            delayMs: 70,
            shimmer: 0.38,
          },
        ]);
        this.playNoiseBurst({
          durationMs: 130 + capped * 20,
          gain: 0.013 + capped * 0.002,
          delayMs: 10,
          startFreq: 1800 + capped * 150,
          endFreq: 600 + capped * 90,
        });
        break;
      }
      case 'win':
        this.playNotes([
          { frequency: 392, durationMs: 210, type: 'triangle', gain: 0.14, shimmer: 0.25, vibratoHz: 3.4, vibratoDepth: 7 },
          { frequency: 523, durationMs: 220, type: 'triangle', gain: 0.13, delayMs: 110, shimmer: 0.3 },
          { frequency: 659, durationMs: 260, type: 'triangle', gain: 0.12, delayMs: 220, shimmer: 0.34, detuneCents: 4 },
          { frequency: 784, durationMs: 320, type: 'sine', gain: 0.11, delayMs: 320, shimmer: 0.44 },
          { frequency: 1046, durationMs: 360, type: 'sine', gain: 0.08, delayMs: 430, shimmer: 0.5 },
        ]);
        this.playNoiseBurst({ durationMs: 360, gain: 0.02, delayMs: 70, startFreq: 2400, endFreq: 450 });
        break;
      case 'lose':
        this.playNotes([
          { frequency: 285, durationMs: 180, type: 'sawtooth', gain: 0.13, shimmer: 0.11, releaseMs: 180 },
          { frequency: 214, durationMs: 220, type: 'sawtooth', gain: 0.115, delayMs: 90, shimmer: 0.1, releaseMs: 200 },
          { frequency: 151, durationMs: 290, type: 'triangle', gain: 0.115, delayMs: 180, shimmer: 0.08, releaseMs: 250 },
          { frequency: 108, durationMs: 420, type: 'sine', gain: 0.09, delayMs: 260, releaseMs: 280 },
        ]);
        this.playNoiseBurst({ durationMs: 300, gain: 0.022, delayMs: 24, startFreq: 700, endFreq: 70 });
        break;
      case 'tipReveal':
        this.playNotes([
          { frequency: 520, durationMs: 78, type: 'sine', gain: 0.09, shimmer: 0.2 },
          { frequency: 780, durationMs: 115, type: 'triangle', gain: 0.11, delayMs: 44, shimmer: 0.3 },
          { frequency: 1040, durationMs: 150, type: 'sine', gain: 0.08, delayMs: 110, shimmer: 0.4 },
        ]);
        this.playNoiseBurst({ durationMs: 120, gain: 0.011, delayMs: 12, startFreq: 2100, endFreq: 840 });
        break;
      default:
        break;
    }
  }

  private playNotes(notes: SoundNote[]): void {
    if (!this.context || !this.masterGain || !this.delayInput || this.muted) {
      return;
    }

    const now = this.context.currentTime;
    notes.forEach((note) => {
      const oscillator = this.context!.createOscillator();
      const overtone = this.context!.createOscillator();
      const gainNode = this.context!.createGain();
      const shimmerSend = this.context!.createGain();
      const duration = Math.max(note.durationMs / 1000, 0.012);
      const start = now + (note.delayMs ?? 0) / 1000;
      const attack = Math.max(0.002, Math.min((note.attackMs ?? 12) / 1000, duration * 0.4));
      const release = Math.max(0.01, Math.min((note.releaseMs ?? note.durationMs) / 1000, duration + 0.25));
      const peak = note.gain ?? 0.1;

      oscillator.type = note.type ?? 'sine';
      oscillator.frequency.value = note.frequency;
      oscillator.detune.value = note.detuneCents ?? 0;

      overtone.type = 'triangle';
      overtone.frequency.value = note.frequency * 2;
      overtone.detune.value = (note.detuneCents ?? 0) + 6;

      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.linearRampToValueAtTime(peak, start + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + release);

      oscillator.connect(gainNode);
      const overtoneGain = this.context!.createGain();
      overtoneGain.gain.value = peak * 0.23;
      overtone.connect(overtoneGain);
      overtoneGain.connect(gainNode);

      gainNode.connect(this.masterGain!);
      shimmerSend.gain.value = clamp(note.shimmer ?? 0.2, 0, 0.7);
      gainNode.connect(shimmerSend);
      shimmerSend.connect(this.delayInput!);

      if (note.vibratoHz && note.vibratoDepth) {
        const lfo = this.context!.createOscillator();
        const lfoGain = this.context!.createGain();
        lfo.frequency.value = note.vibratoHz;
        lfoGain.gain.value = note.vibratoDepth;
        lfo.connect(lfoGain);
        lfoGain.connect(oscillator.frequency);
        lfo.start(start);
        lfo.stop(start + release + 0.03);
      }

      oscillator.start(start);
      overtone.start(start);
      oscillator.stop(start + release + 0.02);
      overtone.stop(start + release + 0.03);
    });
  }

  private playNoiseBurst({
    durationMs,
    gain,
    delayMs = 0,
    startFreq,
    endFreq,
  }: {
    durationMs: number;
    gain: number;
    delayMs?: number;
    startFreq: number;
    endFreq: number;
  }): void {
    if (!this.context || !this.masterGain || !this.noiseBuffer || this.muted) {
      return;
    }

    const now = this.context.currentTime;
    const start = now + delayMs / 1000;
    const duration = Math.max(durationMs / 1000, 0.03);

    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;

    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(startFreq, start);
    bandpass.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 60), start + duration);
    bandpass.Q.value = 1.2;

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.linearRampToValueAtTime(gain, start + Math.min(0.02, duration * 0.3));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(this.masterGain);
    if (this.delayInput) {
      const shimmerSend = this.context.createGain();
      shimmerSend.gain.value = 0.12;
      gainNode.connect(shimmerSend);
      shimmerSend.connect(this.delayInput);
    }

    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.context) {
      return null;
    }

    const seconds = 1;
    const frameCount = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      channel[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }
}
