import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../src/game/core/types';
import { GameRuntime } from '../src/game/runtime/GameRuntime';
import {
  ATTACK_AIM_DRAG_THRESHOLD,
  resolveAttackDragAim,
} from '../src/ui/MobileControls';

interface VirtualAimHarness {
  virtualAimDirection: Vec2 | null;
  lastAimDirection: Vec2;
  player: { facing: number } | null;
}

describe('mobile attack aim runtime contract', () => {
  it('keeps a press in auto-aim until the finger deliberately drags', () => {
    const origin = { x: 92, y: 47 };

    expect(resolveAttackDragAim(origin.x, origin.y, origin)).toBeNull();
    expect(resolveAttackDragAim(origin.x + 10, origin.y, origin)).toBeNull();
    expect(resolveAttackDragAim(origin.x + 20, origin.y, origin)).toEqual({ x: 1, y: 0 });
    expect(resolveAttackDragAim(origin.x + ATTACK_AIM_DRAG_THRESHOLD - 0.001, origin.y, origin)).toBeNull();
    expect(resolveAttackDragAim(origin.x + ATTACK_AIM_DRAG_THRESHOLD, origin.y, origin)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it('returns a unit direction for a directional drag independent of drag distance', () => {
    const origin = { x: 50, y: 50 };
    const aim = resolveAttackDragAim(80, 10, origin);

    expect(aim?.x).toBeCloseTo(0.6, 10);
    expect(aim?.y).toBeCloseTo(-0.8, 10);
    expect(Math.hypot(aim?.x ?? 0, aim?.y ?? 0)).toBeCloseTo(1, 10);
  });

  it('falls back to auto-aim for invalid pointer coordinates or bounds', () => {
    const origin = { x: 50, y: 50 };
    expect(resolveAttackDragAim(Number.NaN, 50, origin)).toBeNull();
    expect(resolveAttackDragAim(80, 50, { x: Number.NaN, y: 50 })).toBeNull();
    expect(resolveAttackDragAim(80, 50, origin, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('normalizes a directional attack-pad vector and rotates the player', () => {
    const runtime = new GameRuntime({ host: {} as HTMLElement, seed: 'mobile-aim' });
    const harness = runtime as unknown as VirtualAimHarness;
    harness.player = { facing: 0 };

    runtime.setVirtualAimDirection({ x: 3, y: 4 });

    expect(harness.virtualAimDirection?.x).toBeCloseTo(0.6, 10);
    expect(harness.virtualAimDirection?.y).toBeCloseTo(0.8, 10);
    expect(harness.lastAimDirection).toEqual(harness.virtualAimDirection);
    expect(harness.player.facing).toBeCloseTo(Math.atan2(4, 3), 10);
  });

  it('clears manual aim for null, invalid, or deadzone-sized vectors', () => {
    const runtime = new GameRuntime({ host: {} as HTMLElement, seed: 'mobile-aim-clear' });
    const harness = runtime as unknown as VirtualAimHarness;

    for (const direction of [
      null,
      { x: 0.05, y: 0.05 },
      { x: Number.NaN, y: 1 },
      { x: 1, y: Number.POSITIVE_INFINITY },
    ]) {
      runtime.setVirtualAimDirection({ x: 1, y: 0 });
      runtime.setVirtualAimDirection(direction);
      expect(harness.virtualAimDirection).toBeNull();
    }
  });
});
