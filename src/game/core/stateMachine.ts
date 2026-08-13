export type GamePhase =
  | 'boot'
  | 'menu'
  | 'playing'
  | 'paused'
  | 'levelUp'
  | 'bossWarning'
  | 'bossFight'
  | 'victory'
  | 'defeat';

export type GameEvent =
  | 'READY'
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'LEVEL_UP'
  | 'CARD_SELECTED'
  | 'BOSS_DEPLOYED'
  | 'WARNING_COMPLETE'
  | 'PLAYER_DIED'
  | 'BOSS_DIED'
  | 'RESTART'
  | 'RETURN_TO_MENU';

const transitions: Readonly<Partial<Record<GamePhase, Partial<Record<GameEvent, GamePhase>>>>> = {
  boot: { READY: 'menu' },
  menu: { START: 'playing' },
  playing: {
    PAUSE: 'paused',
    LEVEL_UP: 'levelUp',
    BOSS_DEPLOYED: 'bossWarning',
    PLAYER_DIED: 'defeat',
  },
  paused: {
    RESUME: 'playing',
    RETURN_TO_MENU: 'menu',
  },
  levelUp: {
    CARD_SELECTED: 'playing',
    PLAYER_DIED: 'defeat',
  },
  bossWarning: {
    WARNING_COMPLETE: 'bossFight',
    PLAYER_DIED: 'defeat',
  },
  bossFight: {
    PAUSE: 'paused',
    LEVEL_UP: 'levelUp',
    PLAYER_DIED: 'defeat',
    BOSS_DIED: 'victory',
  },
  victory: {
    RESTART: 'playing',
    RETURN_TO_MENU: 'menu',
  },
  defeat: {
    RESTART: 'playing',
    RETURN_TO_MENU: 'menu',
  },
};

const simulationPausedPhases = new Set<GamePhase>([
  'boot',
  'menu',
  'paused',
  'levelUp',
  'bossWarning',
  'victory',
  'defeat',
]);

export class InvalidGameTransitionError extends Error {
  constructor(
    readonly phase: GamePhase,
    readonly event: GameEvent,
  ) {
    super(`Game event ${event} is invalid while in phase ${phase}.`);
    this.name = 'InvalidGameTransitionError';
  }
}

export class GameStateMachine {
  private currentPhase: GamePhase;
  private phaseBeforePause: 'playing' | 'bossFight' = 'playing';
  private phaseBeforeLevelUp: 'playing' | 'bossFight' = 'playing';

  constructor(initialPhase: GamePhase = 'boot') {
    this.currentPhase = initialPhase;
  }

  get phase(): GamePhase {
    return this.currentPhase;
  }

  get simulationPaused(): boolean {
    return simulationPausedPhases.has(this.currentPhase);
  }

  can(event: GameEvent): boolean {
    if (event === 'RESUME' && this.currentPhase === 'paused') return true;
    if (event === 'CARD_SELECTED' && this.currentPhase === 'levelUp') return true;
    return transitions[this.currentPhase]?.[event] !== undefined;
  }

  dispatch(event: GameEvent): GamePhase {
    if (event === 'RESUME' && this.currentPhase === 'paused') {
      this.currentPhase = this.phaseBeforePause;
      return this.currentPhase;
    }

    if (event === 'CARD_SELECTED' && this.currentPhase === 'levelUp') {
      this.currentPhase = this.phaseBeforeLevelUp;
      return this.currentPhase;
    }

    const next = transitions[this.currentPhase]?.[event];
    if (next === undefined) {
      throw new InvalidGameTransitionError(this.currentPhase, event);
    }

    if (next === 'paused' && (this.currentPhase === 'playing' || this.currentPhase === 'bossFight')) {
      this.phaseBeforePause = this.currentPhase;
    }
    if (next === 'levelUp' && (this.currentPhase === 'playing' || this.currentPhase === 'bossFight')) {
      this.phaseBeforeLevelUp = this.currentPhase;
    }

    this.currentPhase = next;
    return next;
  }

  reset(phase: GamePhase = 'boot'): void {
    this.currentPhase = phase;
    this.phaseBeforePause = 'playing';
    this.phaseBeforeLevelUp = 'playing';
  }
}
