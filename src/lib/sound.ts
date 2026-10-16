type SoundNote = {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
  delayMs?: number;
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
  private muted = false;

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
      this.masterGain.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.masterGain.connect(this.context.destination);
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
          { frequency: 480, durationMs: 34, type: 'triangle', gain: 0.13 },
          { frequency: 660, durationMs: 46, type: 'triangle', gain: 0.1, delayMs: 22 },
        ]);
        break;
      case 'tileSelect':
        this.playNotes([{ frequency: 710, durationMs: 36, type: 'sine', gain: 0.09 }]);
        break;
      case 'move':
        this.playNotes([
          { frequency: 260, durationMs: 52, type: 'triangle', gain: 0.14 },
          { frequency: 380, durationMs: 64, type: 'triangle', gain: 0.11, delayMs: 40 },
        ]);
        break;
      case 'invalidMove':
        this.playNotes([
          { frequency: 240, durationMs: 75, type: 'sawtooth', gain: 0.12 },
          { frequency: 168, durationMs: 120, type: 'sawtooth', gain: 0.1, delayMs: 45 },
        ]);
        break;
      case 'match': {
        const capped = clamp(intensity, 1, 5);
        const base = 420 + capped * 35;
        this.playNotes([
          { frequency: base, durationMs: 48, type: 'triangle', gain: 0.12 },
          { frequency: base * 1.24, durationMs: 55, type: 'triangle', gain: 0.11, delayMs: 30 },
          { frequency: base * 1.5, durationMs: 78, type: 'triangle', gain: 0.1, delayMs: 60 },
        ]);
        break;
      }
      case 'win':
        this.playNotes([
          { frequency: 392, durationMs: 120, type: 'triangle', gain: 0.13 },
          { frequency: 523, durationMs: 130, type: 'triangle', gain: 0.12, delayMs: 95 },
          { frequency: 659, durationMs: 180, type: 'triangle', gain: 0.11, delayMs: 185 },
          { frequency: 784, durationMs: 240, type: 'sine', gain: 0.1, delayMs: 260 },
        ]);
        break;
      case 'lose':
        this.playNotes([
          { frequency: 290, durationMs: 130, type: 'sawtooth', gain: 0.12 },
          { frequency: 220, durationMs: 160, type: 'sawtooth', gain: 0.1, delayMs: 95 },
          { frequency: 165, durationMs: 220, type: 'triangle', gain: 0.1, delayMs: 170 },
        ]);
        break;
      case 'tipReveal':
        this.playNotes([
          { frequency: 520, durationMs: 48, type: 'sine', gain: 0.09 },
          { frequency: 785, durationMs: 72, type: 'triangle', gain: 0.1, delayMs: 38 },
          { frequency: 980, durationMs: 105, type: 'sine', gain: 0.08, delayMs: 90 },
        ]);
        break;
      default:
        break;
    }
  }

  private playNotes(notes: SoundNote[]): void {
    if (!this.context || !this.masterGain || this.muted) {
      return;
    }

    const now = this.context.currentTime;
    notes.forEach((note) => {
      const oscillator = this.context!.createOscillator();
      const gainNode = this.context!.createGain();
      const duration = Math.max(note.durationMs / 1000, 0.012);
      const start = now + (note.delayMs ?? 0) / 1000;
      const attack = Math.min(0.012, duration * 0.35);
      const peak = note.gain ?? 0.1;

      oscillator.type = note.type ?? 'sine';
      oscillator.frequency.value = note.frequency;

      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.linearRampToValueAtTime(peak, start + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain!);

      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  }
}
