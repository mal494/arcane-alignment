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

const MASTER_VOLUME = 0.3;

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
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientDroneGains: Array<{ node: GainNode; baseGain: number }> = [];
  private ambientOscillators: OscillatorNode[] = [];
  private ambientLfos: OscillatorNode[] = [];
  private ambientIntervalId: number | null = null;
  private ambientStep = 0;
  private ambientActive = false;
  private ambientIntensityTarget = 0.15;
  private ambientIntensityCurrent = 0.15;

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

  startAmbient(): void {
    if (!this.context || !this.masterGain || this.ambientActive) {
      return;
    }

    this.ambientActive = true;
    this.ambientStep = 0;

    const ambientGain = this.context.createGain();
    ambientGain.gain.value = 0.0001;
    const ambientFilter = this.context.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.value = 1900;
    ambientFilter.Q.value = 0.8;

    ambientGain.connect(ambientFilter);
    ambientFilter.connect(this.masterGain);
    this.ambientGain = ambientGain;
    this.ambientFilter = ambientFilter;

    const now = this.context.currentTime;
    ambientGain.gain.cancelScheduledValues(now);
    ambientGain.gain.setValueAtTime(0.0001, now);
    ambientGain.gain.exponentialRampToValueAtTime(0.54, now + 1.1);

    this.createAmbientDrone(98, 'sawtooth', 0.12, 0.12, 4.2);
    this.createAmbientDrone(147, 'triangle', 0.092, -0.09, 3.1);
    this.createAmbientDrone(220, 'sine', 0.054, 0.07, 2.4);

    this.ambientIntervalId = window.setInterval(() => {
      this.scheduleAmbientStep();
    }, 370);
    this.setAmbientIntensity(this.ambientIntensityTarget);
    this.scheduleAmbientStep();
  }

  stopAmbient(): void {
    if (!this.context) {
      this.ambientActive = false;
      return;
    }

    if (this.ambientIntervalId !== null) {
      window.clearInterval(this.ambientIntervalId);
      this.ambientIntervalId = null;
    }

    this.ambientActive = false;
    const now = this.context.currentTime;
    const gain = this.ambientGain;
    if (gain) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.12);
    }

    const toStop = [...this.ambientOscillators, ...this.ambientLfos];
    const filter = this.ambientFilter;
    const ambientGain = this.ambientGain;

    this.ambientOscillators = [];
    this.ambientLfos = [];
    this.ambientDroneGains = [];
    this.ambientFilter = null;
    this.ambientGain = null;
    this.ambientStep = 0;
    this.ambientIntensityCurrent = 0.15;
    this.ambientIntensityTarget = 0.15;

    window.setTimeout(() => {
      toStop.forEach((node) => {
        try {
          node.stop();
        } catch {
          // No-op: node may already be stopped.
        }
        node.disconnect();
      });
      filter?.disconnect();
      ambientGain?.disconnect();
    }, 700);
  }

  setAmbientIntensity(level: number): void {
    const normalized = clamp(level, 0, 1);
    this.ambientIntensityTarget = normalized;
    if (!this.context || !this.ambientActive || !this.ambientGain || !this.ambientFilter) {
      return;
    }

    const now = this.context.currentTime;
    const volume = 0.46 + normalized * 0.24;
    const cutoffHz = 1700 + normalized * 2600;

    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(volume, now, 0.35);

    this.ambientFilter.frequency.cancelScheduledValues(now);
    this.ambientFilter.frequency.setTargetAtTime(cutoffHz, now, 0.45);

    this.ambientDroneGains.forEach(({ node, baseGain }) => {
      const nextGain = baseGain * (0.86 + normalized * 0.92);
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(nextGain, now, 0.35);
    });
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

  private createAmbientDrone(
    frequency: number,
    wave: OscillatorType,
    gainAmount: number,
    detuneOffset: number,
    lfoHz: number,
  ): void {
    if (!this.context || !this.ambientGain) {
      return;
    }

    const osc = this.context.createOscillator();
    osc.type = wave;
    osc.frequency.value = frequency;
    osc.detune.value = detuneOffset * 100;

    const voiceGain = this.context.createGain();
    voiceGain.gain.value = gainAmount;
    const voiceFilter = this.context.createBiquadFilter();
    voiceFilter.type = 'lowpass';
    voiceFilter.frequency.value = 1200;
    voiceFilter.Q.value = 0.9;

    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.frequency.value = lfoHz;
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);

    osc.connect(voiceFilter);
    voiceFilter.connect(voiceGain);
    voiceGain.connect(this.ambientGain);
    if (this.delayInput) {
      const shimmerSend = this.context.createGain();
      shimmerSend.gain.value = 0.04;
      voiceGain.connect(shimmerSend);
      shimmerSend.connect(this.delayInput);
    }

    osc.start();
    lfo.start();
    this.ambientDroneGains.push({ node: voiceGain, baseGain: gainAmount });
    this.ambientOscillators.push(osc);
    this.ambientLfos.push(lfo);
  }

  private scheduleAmbientStep(): void {
    if (!this.context || !this.ambientGain || !this.ambientActive) {
      return;
    }

    this.ambientIntensityCurrent +=
      (this.ambientIntensityTarget - this.ambientIntensityCurrent) * 0.22;
    const intensity = this.ambientIntensityCurrent;

    const rootHz = 164.81; // E3
    const pattern = [0, 3, 7, 10, 7, 5, 8, 2];
    const harmonyPattern = [12, 14, 15, 17, 19, 17, 15, 14];
    const step = this.ambientStep % pattern.length;
    const now = this.context.currentTime + 0.06;
    const leadFreq = rootHz * 2 ** (pattern[step] / 12);
    const harmonyFreq = rootHz * 2 ** (harmonyPattern[step] / 12);
    const density = 0.042 + ((step % 4) * 0.005) + intensity * 0.028;
    const pulseDuration = 0.21 + intensity * 0.16;
    const shimmer = 0.22 + intensity * 0.24;

    this.playAmbientPulse({
      frequency: leadFreq,
      start: now,
      duration: pulseDuration,
      gain: density,
      type: step % 2 === 0 ? 'triangle' : 'sine',
      shimmerSend: shimmer,
    });

    this.playAmbientPulse({
      frequency: harmonyFreq,
      start: now + 0.08,
      duration: Math.max(0.16, pulseDuration - 0.04),
      gain: density * 0.66,
      type: 'sine',
      shimmerSend: shimmer * 0.84,
    });

    if (step % 4 === 0 || intensity > 0.62) {
      this.playAmbientPulse({
        frequency: leadFreq * (1.9 + intensity * 0.2),
        start: now + 0.16,
        duration: 0.11 + intensity * 0.08,
        gain: density * (0.5 + intensity * 0.35),
        type: 'square',
        shimmerSend: 0.12 + intensity * 0.12,
      });
    }

    if (step % 2 === 1) {
      this.playAmbientPulse({
        frequency: leadFreq * 2.5,
        start: now + 0.04,
        duration: 0.07 + intensity * 0.05,
        gain: density * (0.32 + intensity * 0.28),
        type: 'square',
        shimmerSend: 0.08 + intensity * 0.08,
      });
    }

    if (step === 0 || step === 4) {
      this.playNoiseBurst({
        durationMs: 190 + intensity * 180,
        gain: 0.007 + intensity * 0.007,
        delayMs: 0,
        startFreq: 1200 + intensity * 1100,
        endFreq: 420 + intensity * 300,
      });
    }

    this.ambientStep++;
  }

  private playAmbientPulse({
    frequency,
    start,
    duration,
    gain,
    type,
    shimmerSend,
  }: {
    frequency: number;
    start: number;
    duration: number;
    gain: number;
    type: OscillatorType;
    shimmerSend: number;
  }): void {
    if (!this.context || !this.ambientGain) {
      return;
    }

    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = (Math.random() - 0.5) * 6;

    const env = this.context.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.045);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.min(2400, frequency * 2.3);
    filter.Q.value = 0.85;

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.ambientGain);
    let send: GainNode | null = null;
    if (this.delayInput) {
      send = this.context.createGain();
      send.gain.value = shimmerSend;
      env.connect(send);
      send.connect(this.delayInput);
    }

    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      env.disconnect();
      send?.disconnect();
    };

    osc.start(start);
    osc.stop(start + duration + 0.04);
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
