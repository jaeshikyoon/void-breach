export type InputAction =
  | 'attack'
  | 'dash'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'pause'
  | 'select1'
  | 'select2'
  | 'select3';

export interface Vector2 {
  x: number;
  y: number;
}

export interface ActionState {
  /** True only until endFrame() is called. */
  pressed: boolean;
  /** True while at least one keyboard, mouse, or virtual source is active. */
  held: boolean;
  /** True only until endFrame() is called. */
  released: boolean;
}

export type PointerPhase = 'down' | 'move' | 'up' | 'cancel';

export interface GamePointer {
  id: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
  buttons: number;
  client: Vector2;
  local: Vector2;
  start: Vector2;
  delta: Vector2;
  ageMs: number;
}

export interface GamePointerEvent extends GamePointer {
  phase: PointerPhase;
  timeStamp: number;
}

export interface InputSnapshot {
  movement: Vector2;
  pointer: Vector2;
  actions: Readonly<Record<InputAction, ActionState>>;
  pointers: readonly GamePointer[];
}

export interface InputSystemOptions {
  target?: HTMLElement | Window;
  preventDefault?: boolean;
  capturePointer?: boolean;
  keyBindings?: Partial<Record<InputAction, readonly string[]>>;
}

const ACTIONS: readonly InputAction[] = [
  'attack',
  'dash',
  'skill1',
  'skill2',
  'skill3',
  'pause',
  'select1',
  'select2',
  'select3',
];

const DEFAULT_BINDINGS: Record<InputAction, readonly string[]> = {
  attack: ['Mouse0'],
  dash: ['Space', 'Mouse2'],
  skill1: ['KeyQ'],
  skill2: ['KeyE'],
  skill3: ['KeyR'],
  pause: ['Escape'],
  select1: ['Digit1', 'Numpad1'],
  select2: ['Digit2', 'Numpad2'],
  select3: ['Digit3', 'Numpad3'],
};

const MOVEMENT_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

interface MutableActionState extends ActionState {
  sources: Set<string>;
}

interface MutablePointer extends GamePointer {
  startedAt: number;
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 1) return vector;
  return { x: vector.x / length, y: vector.y / length };
}

function copyPointer(pointer: MutablePointer): GamePointer {
  return {
    id: pointer.id,
    pointerType: pointer.pointerType,
    isPrimary: pointer.isPrimary,
    button: pointer.button,
    buttons: pointer.buttons,
    client: { ...pointer.client },
    local: { ...pointer.local },
    start: { ...pointer.start },
    delta: { ...pointer.delta },
    ageMs: pointer.ageMs,
  };
}

/**
 * Browser input collector for a fixed-timestep game loop.
 *
 * Keyboard/mouse input and touch-friendly virtual controls share the same
 * action state. Call `endFrame()` after the game consumes edge states.
 */
export class InputSystem {
  private readonly target: HTMLElement | Window;
  private readonly preventDefault: boolean;
  private readonly capturePointer: boolean;
  private readonly bindings: Record<InputAction, readonly string[]>;
  private readonly actions = {} as Record<InputAction, MutableActionState>;
  private readonly pressedCodes = new Set<string>();
  private readonly pointers = new Map<number, MutablePointer>();
  private readonly pointerEvents: GamePointerEvent[] = [];
  private readonly disposers: Array<() => void> = [];
  private pointerPosition: Vector2 = { x: 0, y: 0 };
  private virtualMovement: Vector2 = { x: 0, y: 0 };
  private disposed = false;

  constructor(options: InputSystemOptions = {}) {
    const browserWindow = typeof window === 'undefined' ? null : window;
    if (!browserWindow && !options.target) {
      throw new Error('InputSystem requires a browser Window or an explicit event target.');
    }

    this.target = options.target ?? browserWindow!;
    this.preventDefault = options.preventDefault ?? true;
    this.capturePointer = options.capturePointer ?? true;
    this.bindings = { ...DEFAULT_BINDINGS, ...options.keyBindings };

    for (const action of ACTIONS) {
      this.actions[action] = {
        held: false,
        pressed: false,
        released: false,
        sources: new Set(),
      };
    }

    const keyboardTarget = browserWindow ?? this.target;
    this.listen(keyboardTarget, 'keydown', this.onKeyDown as EventListener, { passive: false });
    this.listen(keyboardTarget, 'keyup', this.onKeyUp as EventListener, { passive: false });
    this.listen(keyboardTarget, 'blur', this.onBlur as EventListener);
    this.listen(this.target, 'pointerdown', this.onPointerDown as EventListener, {
      passive: false,
    });
    this.listen(this.target, 'pointermove', this.onPointerMove as EventListener, {
      passive: false,
    });
    this.listen(this.target, 'pointerup', this.onPointerUp as EventListener, {
      passive: false,
    });
    this.listen(this.target, 'pointercancel', this.onPointerCancel as EventListener, {
      passive: false,
    });
    this.listen(this.target, 'contextmenu', this.onContextMenu as EventListener, {
      passive: false,
    });
  }

  get movement(): Vector2 {
    let x = this.virtualMovement.x;
    let y = this.virtualMovement.y;
    if (this.pressedCodes.has('KeyA') || this.pressedCodes.has('ArrowLeft')) x -= 1;
    if (this.pressedCodes.has('KeyD') || this.pressedCodes.has('ArrowRight')) x += 1;
    if (this.pressedCodes.has('KeyW') || this.pressedCodes.has('ArrowUp')) y -= 1;
    if (this.pressedCodes.has('KeyS') || this.pressedCodes.has('ArrowDown')) y += 1;
    return normalize({ x, y });
  }

  get pointer(): Vector2 {
    return { ...this.pointerPosition };
  }

  isHeld(action: InputAction): boolean {
    return this.actions[action].held;
  }

  wasPressed(action: InputAction): boolean {
    return this.actions[action].pressed;
  }

  wasReleased(action: InputAction): boolean {
    return this.actions[action].released;
  }

  getAction(action: InputAction): ActionState {
    const state = this.actions[action];
    return { held: state.held, pressed: state.pressed, released: state.released };
  }

  getPointers(): readonly GamePointer[] {
    const now = performance.now();
    return [...this.pointers.values()].map((pointer) => {
      pointer.ageMs = now - pointer.startedAt;
      return copyPointer(pointer);
    });
  }

  /** Returns accumulated pointer transitions and removes them from the queue. */
  consumePointerEvents(): GamePointerEvent[] {
    return this.pointerEvents.splice(0, this.pointerEvents.length);
  }

  snapshot(): InputSnapshot {
    const actions = {} as Record<InputAction, ActionState>;
    for (const action of ACTIONS) actions[action] = this.getAction(action);
    return {
      movement: this.movement,
      pointer: this.pointer,
      actions,
      pointers: this.getPointers(),
    };
  }

  /** Supplies an analog vector from an on-screen joystick. */
  setVirtualMovement(vector: Vector2): void {
    this.virtualMovement = normalize({
      x: Number.isFinite(vector.x) ? vector.x : 0,
      y: Number.isFinite(vector.y) ? vector.y : 0,
    });
  }

  /** Connects React/Pixi touch buttons to the same state queried by the loop. */
  setVirtualAction(action: InputAction, active: boolean, source = 'virtual'): void {
    this.setSource(action, `virtual:${source}`, active);
  }

  /** Clears pressed/released edges. Held state remains intact. */
  endFrame(): void {
    for (const action of ACTIONS) {
      this.actions[action].pressed = false;
      this.actions[action].released = false;
    }
    for (const pointer of this.pointers.values()) {
      pointer.delta = { x: 0, y: 0 };
    }
  }

  reset(): void {
    this.pressedCodes.clear();
    this.pointers.clear();
    this.pointerEvents.length = 0;
    this.virtualMovement = { x: 0, y: 0 };
    for (const action of ACTIONS) {
      const state = this.actions[action];
      if (state.held) state.released = true;
      state.sources.clear();
      state.held = false;
      state.pressed = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.disposers.splice(0)) dispose();
    this.reset();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed) return;
    this.pressedCodes.add(event.code);
    this.applyCode(event.code, true, `key:${event.code}`);
    if (this.preventDefault && (MOVEMENT_CODES.has(event.code) || this.isBoundCode(event.code))) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedCodes.delete(event.code);
    this.applyCode(event.code, false, `key:${event.code}`);
    if (this.preventDefault && (MOVEMENT_CODES.has(event.code) || this.isBoundCode(event.code))) {
      event.preventDefault();
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.preventDefault) event.preventDefault();
    const local = this.toLocal(event);
    const pointer: MutablePointer = {
      id: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      client: { x: event.clientX, y: event.clientY },
      local,
      start: { ...local },
      delta: { x: 0, y: 0 },
      ageMs: 0,
      startedAt: performance.now(),
    };
    this.pointerPosition = { ...local };
    this.pointers.set(event.pointerId, pointer);
    this.pushPointerEvent(pointer, 'down', event.timeStamp);
    if (event.pointerType === 'mouse') {
      this.applyCode(`Mouse${event.button}`, true, `pointer:${event.pointerId}:${event.button}`);
    }
    if (
      this.capturePointer &&
      typeof HTMLElement !== 'undefined' &&
      this.target instanceof HTMLElement
    ) {
      try {
        this.target.setPointerCapture(event.pointerId);
      } catch {
        // Safari can throw when a pointer ends before capture is assigned.
      }
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const local = this.toLocal(event);
    this.pointerPosition = { ...local };
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.delta.x += local.x - pointer.local.x;
    pointer.delta.y += local.y - pointer.local.y;
    pointer.local = local;
    pointer.client = { x: event.clientX, y: event.clientY };
    pointer.buttons = event.buttons;
    pointer.ageMs = performance.now() - pointer.startedAt;
    this.pushPointerEvent(pointer, 'move', event.timeStamp);
    if (this.preventDefault) event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.finishPointer(event, 'up');
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.finishPointer(event, 'cancel');
  };

  private readonly onContextMenu = (event: Event): void => {
    if (this.preventDefault) event.preventDefault();
  };

  private readonly onBlur = (): void => this.reset();

  private finishPointer(event: PointerEvent, phase: 'up' | 'cancel'): void {
    if (this.preventDefault) event.preventDefault();
    const pointer = this.pointers.get(event.pointerId);
    if (pointer) {
      const local = this.toLocal(event);
      pointer.delta.x += local.x - pointer.local.x;
      pointer.delta.y += local.y - pointer.local.y;
      pointer.local = local;
      pointer.client = { x: event.clientX, y: event.clientY };
      pointer.buttons = event.buttons;
      pointer.ageMs = performance.now() - pointer.startedAt;
      this.pushPointerEvent(pointer, phase, event.timeStamp);
      this.pointers.delete(event.pointerId);
    }
    if (event.pointerType === 'mouse') {
      this.applyCode(`Mouse${event.button}`, false, `pointer:${event.pointerId}:${event.button}`);
    }
    if (
      this.capturePointer &&
      typeof HTMLElement !== 'undefined' &&
      this.target instanceof HTMLElement
    ) {
      try {
        if (this.target.hasPointerCapture(event.pointerId)) {
          this.target.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
  }

  private pushPointerEvent(
    pointer: MutablePointer,
    phase: PointerPhase,
    timeStamp: number,
  ): void {
    this.pointerEvents.push({ ...copyPointer(pointer), phase, timeStamp });
  }

  private applyCode(code: string, active: boolean, source: string): void {
    for (const action of ACTIONS) {
      if (this.bindings[action].includes(code)) this.setSource(action, source, active);
    }
  }

  private isBoundCode(code: string): boolean {
    return ACTIONS.some((action) => this.bindings[action].includes(code));
  }

  private setSource(action: InputAction, source: string, active: boolean): void {
    const state = this.actions[action];
    const wasHeld = state.sources.size > 0;
    if (active) state.sources.add(source);
    else state.sources.delete(source);
    state.held = state.sources.size > 0;
    if (!wasHeld && state.held) state.pressed = true;
    if (wasHeld && !state.held) state.released = true;
  }

  private toLocal(event: PointerEvent): Vector2 {
    if (typeof HTMLElement === 'undefined' || !(this.target instanceof HTMLElement)) {
      return { x: event.clientX, y: event.clientY };
    }
    const rect = this.target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.disposers.push(() => target.removeEventListener(type, listener, options));
  }
}
