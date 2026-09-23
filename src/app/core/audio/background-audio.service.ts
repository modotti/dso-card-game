import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

type TrackName = 'home' | 'ingame' | 'conclusion';
type EffectName = 'click' | 'win' | 'lose';
interface AudioTrack {
  readonly audio: HTMLAudioElement;
  readonly gain: GainNode;
}

const MUSIC_VOLUME = 0.2;
const SFX_VOLUME = 0.55;
const FADE_DURATION_SECONDS = 1.5;
const FADE_CURVE_SAMPLES = 128;
const MUTE_STORAGE_KEY = 'dsd-music-muted';
const TRACK_LEVEL: Readonly<Record<TrackName, number>> = {
  home: 1.16,
  ingame: 0.85,
  conclusion: 1,
};

@Injectable({ providedIn: 'root' })
export class BackgroundAudioService {
  readonly muted = signal(false);

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly tracks = new Map<TrackName, AudioTrack>();
  private audioContext?: AudioContext;
  private masterGain?: GainNode;
  private effectsGain?: GainNode;
  private readonly effectBuffers = new Map<EffectName, AudioBuffer>();
  private readonly effectLoads = new Map<EffectName, Promise<AudioBuffer | undefined>>();
  private readonly playedRoundEffects = new Set<string>();
  private currentTrack?: TrackName;
  private interactionHandler?: () => void;
  private clickHandler?: (event: MouseEvent) => void;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.muted.set(localStorage.getItem(MUTE_STORAGE_KEY) === 'true');
    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.muted() ? 0 : MUSIC_VOLUME;
    this.masterGain.connect(this.audioContext.destination);
    this.effectsGain = this.audioContext.createGain();
    this.effectsGain.gain.value = this.muted() ? 0 : SFX_VOLUME;
    this.effectsGain.connect(this.audioContext.destination);
    this.tracks.set('home', this.createTrack('/assets/audio/home.mp3', true));
    this.tracks.set('ingame', this.createTrack('/assets/audio/ingame.mp3', true));
    this.tracks.set('conclusion', this.createTrack('/assets/audio/conclusion.mp3', false));
    this.preloadEffect('click', '/assets/audio/click.wav');
    this.preloadEffect('win', '/assets/audio/win.wav');
    this.preloadEffect('lose', '/assets/audio/lose.wav');

    this.selectTrack(this.trackForUrl(this.router.url));
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.selectTrack(this.trackForUrl(event.urlAfterRedirects)));

    this.interactionHandler = () => this.resumeAfterInteraction();
    document.addEventListener('pointerdown', this.interactionHandler, { capture: true, once: true });
    document.addEventListener('keydown', this.interactionHandler, { capture: true, once: true });
    this.clickHandler = (event) => this.handleClick(event);
    document.addEventListener('click', this.clickHandler, true);

    this.destroyRef.onDestroy(() => this.destroy());
  }

  toggleMute(): void {
    const muted = !this.muted();
    this.muted.set(muted);
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));

    const context = this.audioContext;
    const masterGain = this.masterGain;
    const effectsGain = this.effectsGain;
    if (context && masterGain && effectsGain) {
      const now = context.currentTime;
      masterGain.gain.cancelAndHoldAtTime(now);
      masterGain.gain.linearRampToValueAtTime(muted ? 0 : MUSIC_VOLUME, now + 0.08);
      effectsGain.gain.cancelAndHoldAtTime(now);
      effectsGain.gain.linearRampToValueAtTime(muted ? 0 : SFX_VOLUME, now + 0.08);
    }
    if (!muted) this.unlockTracksAndResume();
  }

  setGameFinished(finished: boolean): void {
    if (!this.router.url.split(/[?#]/, 1)[0].startsWith('/game/')) return;
    this.selectTrack(finished ? 'conclusion' : 'ingame');
  }

  playRoundResult(result: 'win' | 'loss' | 'tie' | 'cancelled', roundIdentity: string): void {
    if (this.playedRoundEffects.has(roundIdentity)) return;
    this.playedRoundEffects.add(roundIdentity);
    if (result === 'win') this.playEffect('win');
    if (result === 'loss') this.playEffect('lose');
  }

  private createTrack(source: string, loop: boolean): AudioTrack {
    if (!this.audioContext || !this.masterGain) throw new Error('Audio context is not initialized.');
    const audio = new Audio(source);
    audio.loop = loop;
    audio.preload = 'auto';
    const sourceNode = this.audioContext.createMediaElementSource(audio);
    const gain = this.audioContext.createGain();
    gain.gain.value = 0;
    sourceNode.connect(gain);
    gain.connect(this.masterGain);
    return { audio, gain };
  }

  private trackForUrl(url: string): TrackName {
    return url.split(/[?#]/, 1)[0].startsWith('/game/') ? 'ingame' : 'home';
  }

  private selectTrack(trackName: TrackName): void {
    if (this.currentTrack === trackName) return;
    this.currentTrack = trackName;
    const incoming = this.tracks.get(trackName);
    if (incoming) incoming.audio.currentTime = 0;
    this.fadeTo(trackName);
  }

  private fadeTo(trackName: TrackName): void {
    const incoming = this.tracks.get(trackName);
    const context = this.audioContext;
    if (!incoming || !context) return;

    void incoming.audio.play().catch(() => {
      // Browsers may block autoplay until the first user interaction.
    });

    const now = context.currentTime;
    const fadeStartsAt = now + 0.005;
    for (const [name, track] of this.tracks) {
      const gain = track.gain.gain;
      gain.cancelAndHoldAtTime(now);
      const startValue = gain.value;
      const targetValue = name === trackName ? TRACK_LEVEL[name] : 0;
      gain.setValueAtTime(startValue, fadeStartsAt);
      gain.setValueCurveAtTime(this.equalPowerCurve(startValue, targetValue), fadeStartsAt, FADE_DURATION_SECONDS);
    }
  }

  private equalPowerCurve(startValue: number, targetValue: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(FADE_CURVE_SAMPLES);
    const fadingIn = targetValue > startValue;
    for (let index = 0; index < curve.length; index++) {
      const progress = index / (curve.length - 1);
      const shapedProgress = fadingIn ? Math.sin((progress * Math.PI) / 2) : 1 - Math.cos((progress * Math.PI) / 2);
      curve[index] = startValue + (targetValue - startValue) * shapedProgress;
    }
    curve[0] = startValue;
    curve[curve.length - 1] = targetValue;
    return curve;
  }

  private async loadEffect(source: string): Promise<AudioBuffer | undefined> {
    try {
      const response = await fetch(source);
      if (!response.ok) return undefined;
      return await this.audioContext?.decodeAudioData(await response.arrayBuffer());
    } catch {
      return undefined;
    }
  }

  private preloadEffect(name: EffectName, source: string): void {
    const load = this.loadEffect(source);
    this.effectLoads.set(name, load);
    void load.then((buffer) => {
      if (buffer) this.effectBuffers.set(name, buffer);
    });
  }

  private handleClick(event: MouseEvent): void {
    if (event.defaultPrevented || this.muted()) return;
    const target = event.target instanceof Element ? event.target.closest('button, [role="button"]') : null;
    if (!target || target.getAttribute('aria-disabled') === 'true') return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    this.playEffect('click');
  }

  private playEffect(name: EffectName): void {
    const context = this.audioContext;
    const effectsGain = this.effectsGain;
    const buffer = this.effectBuffers.get(name);
    if (this.muted() || !context || !effectsGain) return;
    if (!buffer) {
      void this.effectLoads.get(name)?.then((loadedBuffer) => {
        if (loadedBuffer) this.playEffect(name);
      });
      return;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(effectsGain);
    source.start();
  }

  private resumeAfterInteraction(): void {
    if (this.interactionHandler) {
      document.removeEventListener('pointerdown', this.interactionHandler, true);
      document.removeEventListener('keydown', this.interactionHandler, true);
    }
    this.unlockTracksAndResume();
  }

  private unlockTracksAndResume(): void {
    void this.audioContext?.resume();
    for (const track of this.tracks.values()) {
      void track.audio.play().catch(() => {
        // A later interaction (including the unmute button) retries playback.
      });
    }
    if (!this.muted() && this.currentTrack) this.fadeTo(this.currentTrack);
  }

  private destroy(): void {
    if (this.interactionHandler) {
      document.removeEventListener('pointerdown', this.interactionHandler, true);
      document.removeEventListener('keydown', this.interactionHandler, true);
    }
    if (this.clickHandler) document.removeEventListener('click', this.clickHandler, true);
    for (const track of this.tracks.values()) track.audio.pause();
    void this.audioContext?.close();
  }
}
