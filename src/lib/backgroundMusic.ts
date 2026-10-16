const MUSIC_BASE_VOLUME = 0.56;
const MUSIC_INTENSITY_VOLUME = 0.12;
const MUSIC_MAX_VOLUME = 0.72;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Controls the gameplay background music track (loop, fade, mute, intensity).
 * Uses a plain HTMLAudioElement for robust autoplay behavior when started from a user gesture.
 */
export class BackgroundMusicController {
  private readonly src: string;
  private audio: HTMLAudioElement | null = null;
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

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') {
      return;
    }

    this.audio = new Audio(this.src);
    this.audio.preload = 'auto';
    this.audio.loop = true;
    this.audio.volume = 0;
    this.audio.addEventListener('error', () => {
      const mediaError = this.audio?.error;
      console.error('[background-music] audio element error', {
        code: mediaError?.code,
        message: mediaError?.message,
        src: this.audio?.currentSrc || this.src,
      });
    });
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
    this.ensureAnimationLoop();
  }

  startFromGesture(): void {
    this.initialize();
    if (!this.audio) {
      return;
    }
    this.isPlayingTarget = true;
    this.targetGain = this.computeTargetGain();
    const playAttempt = this.audio.play();
    playAttempt?.catch((error) => {
      console.error('[background-music] play() failed', {
        error,
        src: this.audio?.currentSrc || this.src,
        muted: this.isMuted,
        targetGain: this.targetGain,
      });
    });
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

    this.audio = null;
    this.initialized = false;
    this.currentGain = 0;
    this.targetGain = 0;
  }

  private computeTargetGain(): number {
    if (!this.isPlayingTarget || this.isMuted) {
      return 0;
    }
    const volume = MUSIC_BASE_VOLUME + this.intensity * MUSIC_INTENSITY_VOLUME;
    return clamp(volume, 0, MUSIC_MAX_VOLUME);
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
    const step = delta * 0.09;
    this.currentGain += Math.abs(step) < 0.00025 ? delta : step;

    const appliedVolume = clamp(this.currentGain, 0, 1);
    this.audio.volume = appliedVolume;

    if (!this.isPlayingTarget && appliedVolume <= 0.001 && !this.audio.paused) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }

    if (Math.abs(this.targetGain - this.currentGain) > 0.001) {
      this.rafId = window.requestAnimationFrame(this.tick);
    }
  };
}
