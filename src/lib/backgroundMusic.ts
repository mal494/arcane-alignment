const MUSIC_BASE_GAIN = 0.08;
const MUSIC_INTENSITY_GAIN = 0.06;
const MUSIC_MIN_FILTER_HZ = 1400;
const MUSIC_MAX_FILTER_HZ = 5000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Controls the gameplay background music track (loop, fade, mute, intensity).
 * Uses MediaElement + Web Audio so we can keep volume under SFX and apply subtle filtering.
 */
export class BackgroundMusicController {
  private readonly src: string;
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private rafId: number | null = null;

  private initialized = false;
  private isMuted = false;
  private isPlayingTarget = false;
  private intensity = 0;
  private currentGain = 0;
  private targetGain = 0;

  constructor(src: string) {
    this.src = src;
  }

  async initialize(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') {
      return;
    }

    this.audio = new Audio(this.src);
    this.audio.preload = 'auto';
    this.audio.loop = true;
    this.audio.volume = 0;
    this.audio.load();

    this.initialized = true;
  }

  setMuted(nextMuted: boolean): void {
    this.isMuted = nextMuted;
    this.targetGain = this.computeTargetGain();
    this.ensureAnimationLoop();
  }

  setIntensity(level: number): void {
    this.intensity = clamp(level, 0, 1);
    this.targetGain = this.computeTargetGain();
    this.applyFilterTarget();
    this.ensureAnimationLoop();
  }

  async startFromGesture(): Promise<void> {
    await this.initialize();
    this.ensureAudioGraph();
    if (!this.audio) {
      return;
    }

    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }

    this.isPlayingTarget = true;
    this.targetGain = this.computeTargetGain();
    this.applyFilterTarget();

    try {
      await this.audio.play();
    } catch {
      // Autoplay can still fail on some browsers if no trusted user gesture is active.
    }

    this.ensureAnimationLoop();
  }

  stopWithFade(): void {
    this.isPlayingTarget = false;
    this.targetGain = 0;
    this.ensureAnimationLoop();
  }

  dispose(): void {
    this.stopWithFade();
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.load();
    }

    this.musicGain?.disconnect();
    this.musicFilter?.disconnect();
    this.sourceNode?.disconnect();
    this.context?.close().catch(() => undefined);

    this.audio = null;
    this.musicGain = null;
    this.musicFilter = null;
    this.sourceNode = null;
    this.context = null;
    this.initialized = false;
    this.currentGain = 0;
    this.targetGain = 0;
  }

  private computeTargetGain(): number {
    if (!this.isPlayingTarget || this.isMuted) {
      return 0;
    }
    return MUSIC_BASE_GAIN + this.intensity * MUSIC_INTENSITY_GAIN;
  }

  private applyFilterTarget(): void {
    if (!this.context || !this.musicFilter) {
      return;
    }
    const now = this.context.currentTime;
    const nextCutoff =
      MUSIC_MIN_FILTER_HZ + (MUSIC_MAX_FILTER_HZ - MUSIC_MIN_FILTER_HZ) * this.intensity;
    this.musicFilter.frequency.cancelScheduledValues(now);
    this.musicFilter.frequency.setTargetAtTime(nextCutoff, now, 0.45);
  }

  private ensureAnimationLoop(): void {
    if (this.rafId !== null) {
      return;
    }
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  private readonly tick = () => {
    this.rafId = null;
    if (!this.audio) {
      return;
    }

    const delta = this.targetGain - this.currentGain;
    const step = delta * 0.08;
    this.currentGain += Math.abs(step) < 0.0003 ? delta : step;

    const appliedGain = clamp(this.currentGain, 0, 1);
    if (this.musicGain && this.context) {
      this.musicGain.gain.setValueAtTime(appliedGain, this.context.currentTime);
    } else {
      this.audio.volume = appliedGain;
    }

    if (!this.isPlayingTarget && appliedGain <= 0.001 && !this.audio.paused) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }

    if (Math.abs(this.targetGain - this.currentGain) > 0.001 || (this.isPlayingTarget && this.audio.paused)) {
      if (this.isPlayingTarget && this.audio.paused) {
        void this.audio.play().catch(() => undefined);
      }
      this.rafId = window.requestAnimationFrame(this.tick);
    }
  };

  private ensureAudioGraph(): void {
    if (!this.audio || this.context) {
      return;
    }
    const Ctx =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return;
    }

    this.context = new Ctx();
    this.sourceNode = this.context.createMediaElementSource(this.audio);
    this.musicGain = this.context.createGain();
    this.musicFilter = this.context.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = MUSIC_MIN_FILTER_HZ;
    this.musicFilter.Q.value = 0.6;
    this.musicGain.gain.value = 0;

    this.sourceNode.connect(this.musicFilter);
    this.musicFilter.connect(this.musicGain);
    this.musicGain.connect(this.context.destination);
  }
}
