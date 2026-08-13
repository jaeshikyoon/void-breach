export type PauseReason = 'hidden' | 'blurred' | 'portrait' | 'manual';
export type ScreenOrientationKind = 'landscape' | 'portrait';

export interface LifecycleState {
  paused: boolean;
  reasons: ReadonlySet<PauseReason>;
  hidden: boolean;
  focused: boolean;
  orientation: ScreenOrientationKind;
  landscapeRequired: boolean;
}

export interface BrowserLifecycleOptions {
  requireLandscape?: boolean;
  pauseWhenHidden?: boolean;
  pauseWhenBlurred?: boolean;
}

export type LifecycleListener = (state: LifecycleState) => void;

interface LockableOrientation extends ScreenOrientation {
  lock?(orientation: 'landscape'): Promise<void>;
}

/** Combines visibility, focus, orientation, and explicit pause into one signal. */
export class BrowserLifecycle {
  private readonly requireLandscape: boolean;
  private readonly pauseWhenHidden: boolean;
  private readonly pauseWhenBlurred: boolean;
  private readonly listeners = new Set<LifecycleListener>();
  private readonly disposers: Array<() => void> = [];
  private manuallyPaused = false;
  private disposed = false;
  private lastSignature = '';

  constructor(options: BrowserLifecycleOptions = {}) {
    this.requireLandscape = options.requireLandscape ?? true;
    this.pauseWhenHidden = options.pauseWhenHidden ?? true;
    this.pauseWhenBlurred = options.pauseWhenBlurred ?? false;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.listen(document, 'visibilitychange', this.onChange);
      this.listen(window, 'resize', this.onChange);
      this.listen(window, 'orientationchange', this.onChange);
      this.listen(window, 'focus', this.onChange);
      this.listen(window, 'blur', this.onChange);
      this.lastSignature = this.signature(this.current);
    }
  }

  get current(): LifecycleState {
    const hidden = typeof document !== 'undefined' ? document.hidden : false;
    const focused = typeof document !== 'undefined' ? document.hasFocus() : true;
    const orientation = this.readOrientation();
    const reasons = new Set<PauseReason>();
    if (this.manuallyPaused) reasons.add('manual');
    if (this.pauseWhenHidden && hidden) reasons.add('hidden');
    if (this.pauseWhenBlurred && !focused) reasons.add('blurred');
    if (this.requireLandscape && orientation === 'portrait') reasons.add('portrait');
    return {
      paused: reasons.size > 0,
      reasons,
      hidden,
      focused,
      orientation,
      landscapeRequired: this.requireLandscape && orientation === 'portrait',
    };
  }

  setManualPaused(paused: boolean): void {
    if (this.manuallyPaused === paused) return;
    this.manuallyPaused = paused;
    this.emit();
  }

  subscribe(listener: LifecycleListener, emitImmediately = true): () => void {
    this.listeners.add(listener);
    if (emitImmediately) listener(this.current);
    return () => this.listeners.delete(listener);
  }

  /** Best-effort helper; browsers generally require this from a user gesture. */
  async requestLandscapeLock(): Promise<boolean> {
    if (typeof screen === 'undefined' || !screen.orientation) return false;
    const orientation = screen.orientation as LockableOrientation;
    if (!orientation.lock) return false;
    try {
      await orientation.lock('landscape');
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.disposers.splice(0)) dispose();
    this.listeners.clear();
  }

  private readonly onChange = (): void => this.emit();

  private emit(): void {
    if (this.disposed) return;
    const state = this.current;
    const signature = this.signature(state);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    for (const listener of this.listeners) listener(state);
  }

  private signature(state: LifecycleState): string {
    return [
      state.paused,
      state.hidden,
      state.focused,
      state.orientation,
      [...state.reasons].sort().join(','),
    ].join('|');
  }

  private readOrientation(): ScreenOrientationKind {
    if (typeof window === 'undefined') return 'landscape';
    return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  }

  private listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.disposers.push(() => target.removeEventListener(type, listener));
  }
}

export { BrowserLifecycle as PauseController };

