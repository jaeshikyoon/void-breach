import { describe, expect, it } from 'vitest';
import {
  GameStateMachine,
  InvalidGameTransitionError,
} from '../src/game/core/stateMachine';

describe('GameStateMachine', () => {
  it('pauses simulation for menus, level-up cards, and boss warning', () => {
    const game = new GameStateMachine();
    expect(game.simulationPaused).toBe(true);
    game.dispatch('READY');
    game.dispatch('START');
    expect(game.phase).toBe('playing');
    expect(game.simulationPaused).toBe(false);
    game.dispatch('LEVEL_UP');
    expect(game.phase).toBe('levelUp');
    expect(game.simulationPaused).toBe(true);
    game.dispatch('CARD_SELECTED');
    expect(game.phase).toBe('playing');
    game.dispatch('BOSS_DEPLOYED');
    expect(game.phase).toBe('bossWarning');
    expect(game.simulationPaused).toBe(true);
    game.dispatch('WARNING_COMPLETE');
    expect(game.phase).toBe('bossFight');
    expect(game.simulationPaused).toBe(false);
  });

  it('returns from pause to the phase it interrupted', () => {
    const game = new GameStateMachine('bossFight');
    game.dispatch('PAUSE');
    game.dispatch('RESUME');
    expect(game.phase).toBe('bossFight');
  });

  it('rejects impossible transitions', () => {
    const game = new GameStateMachine('menu');
    expect(() => game.dispatch('BOSS_DIED')).toThrow(InvalidGameTransitionError);
  });
});
