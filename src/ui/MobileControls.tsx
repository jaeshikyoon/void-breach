import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ActiveSkillId } from '../game/core/types';
import { UiIcon } from './icons';
import type { MobileControlsProps, MoveVector, SkillHudItem } from './types';
import { clamp01 } from './utils';

export const ATTACK_AIM_DRAG_THRESHOLD = 14;
export const SKILL_AIM_DRAG_THRESHOLD = 8;

export interface PointerOrigin {
  x: number;
  y: number;
}

/**
 * Resolves a pointer drag into a unit aim direction. The initial contact point
 * is the anchor, so pressing anywhere on the pad remains automatic targeting
 * until the finger deliberately moves beyond the activation threshold.
 */
export function resolveAttackDragAim(
  clientX: number,
  clientY: number,
  origin: PointerOrigin,
  threshold = ATTACK_AIM_DRAG_THRESHOLD,
): MoveVector | null {
  if (
    !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(origin.x)
    || !Number.isFinite(origin.y)
    || !Number.isFinite(threshold)
    || threshold < 0
  ) return null;

  const deltaX = clientX - origin.x;
  const deltaY = clientY - origin.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < threshold || distance === 0) return null;
  return { x: deltaX / distance, y: deltaY / distance };
}

export function MobileJoystick({ onMove, onMoveEnd }: Pick<MobileControlsProps, 'onMove' | 'onMoveEnd'>) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [vector, setVector] = useState<MoveVector>({ x: 0, y: 0 });
  const [knobOffset, setKnobOffset] = useState<MoveVector>({ x: 0, y: 0 });

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = clientX - (rect.left + rect.width / 2);
    const rawY = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const knobRect = knobRef.current?.getBoundingClientRect();
    const knobRadius = Math.min(knobRect?.width ?? 62, knobRect?.height ?? 62) / 2;
    const travel = Math.max(24, Math.min(rect.width, rect.height) / 2 - knobRadius - 4);
    const scale = distance > travel ? travel / distance : 1;
    const offset = { x: rawX * scale, y: rawY * scale };
    const next = { x: offset.x / travel, y: offset.y / travel };
    setVector(next);
    setKnobOffset(offset);
    onMove(next);
  }, [onMove]);

  const release = useCallback((pointerId: number) => {
    if (pointerRef.current !== pointerId) return;
    pointerRef.current = null;
    setVector({ x: 0, y: 0 });
    setKnobOffset({ x: 0, y: 0 });
    onMoveEnd();
  }, [onMoveEnd]);

  return (
    <div
      ref={zoneRef}
      className="ui-joystick"
      role="application"
      aria-label="이동 조이스틱"
      data-testid="mobile-joystick"
      onPointerDown={(event) => {
        if (pointerRef.current !== null) return;
        pointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePosition(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current === event.pointerId) updatePosition(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
      onLostPointerCapture={(event) => release(event.pointerId)}
    >
      <div className="ui-joystick__arrows" aria-hidden="true"><i /><i /><i /><i /></div>
      <div
        ref={knobRef}
        className="ui-joystick__knob"
        style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }}
        aria-hidden="true"
      ><span /></div>
    </div>
  );
}

interface MobileSkillButtonProps {
  index: number;
  skill?: SkillHudItem;
  onSkill: (id: ActiveSkillId) => void;
  onSkillAim: (id: ActiveSkillId, vector: MoveVector | null) => void;
}

function MobileSkillButton({ index, skill, onSkill, onSkillAim }: MobileSkillButtonProps) {
  if (!skill) {
    return (
      <div
        className="ui-touch-skill ui-touch-skill--empty"
        role="listitem"
        aria-label={`스킬 슬롯 ${index + 1}, 미장착`}
        data-testid={`mobile-skill-slot-${index}`}
        data-slot={index}
        data-skill-state="empty"
      >
        <span className="ui-touch-skill__icon" aria-hidden="true"><UiIcon name="bolt" size={19} /></span>
        <small>EMPTY</small>
      </div>
    );
  }

  const cooldown = clamp01(skill.cooldownRemaining / Math.max(skill.cooldownTotal, 0.001));
  const disabled = skill.cooldownRemaining > 0;
  const state = disabled ? 'cooldown' : 'ready';
  const pointerRef = useRef<number | null>(null);
  const originRef = useRef<PointerOrigin | null>(null);
  const [aiming, setAiming] = useState(false);
  const resolveSkillAim = (event: React.PointerEvent<HTMLButtonElement>) => {
    const origin = originRef.current;
    if (!origin) return null;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const length = Math.hypot(dx, dy);
    if (length < SKILL_AIM_DRAG_THRESHOLD) return null;
    return { x: dx / length, y: dy / length };
  };
  const finish = (pointerId: number, event?: PointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current !== pointerId) return;
    const vector = event ? resolveSkillAim(event) : null;
    pointerRef.current = null;
    originRef.current = null;
    setAiming(false);
    if (!disabled) {
      onSkillAim(skill.id, vector);
      onSkill(skill.id);
    }
    onSkillAim(skill.id, null);
  };
  return (
    <button
      className={`ui-touch-skill ui-touch-skill--${skill.tone ?? 'cyan'} is-${state}${aiming ? ' is-aiming' : ''}`}
      type="button"
      aria-label={`${skill.name}, 레벨 ${skill.level}${disabled ? `, 재사용 대기 ${skill.cooldownRemaining.toFixed(1)}초` : ', 사용 가능'}`}
      disabled={disabled}
      data-testid={`mobile-skill-slot-${index}`}
      data-slot={index}
      data-skill-state={state}
      data-aiming={aiming}
      data-cooldown={skill.cooldownRemaining.toFixed(1)}
      onPointerDown={(event) => {
        event.preventDefault();
        if (disabled || pointerRef.current !== null) return;
        pointerRef.current = event.pointerId;
        originRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        onSkillAim(skill.id, null);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current !== event.pointerId) return;
        event.preventDefault();
        const vector = resolveSkillAim(event);
        const nextAiming = vector !== null;
        setAiming(nextAiming);
        onSkillAim(skill.id, vector);
      }}
      onPointerUp={(event) => finish(event.pointerId, event)}
      onPointerCancel={(event) => finish(event.pointerId)}
      onLostPointerCapture={(event) => finish(event.pointerId)}
    >
      <span className="ui-touch-skill__icon" aria-hidden="true">
        {skill.iconSrc ? <img src={skill.iconSrc} alt="" draggable={false} /> : <UiIcon name="bolt" size={23} />}
      </span>
      {disabled && (
        <svg className="ui-touch-skill__cooldown-ring" viewBox="0 0 42 42" aria-hidden="true">
          <circle cx="21" cy="21" r="19" pathLength="1" style={{ strokeDashoffset: 1 - cooldown }} />
        </svg>
      )}
      <span className="ui-touch-skill__level" aria-hidden="true">LV.{skill.level}</span>
      {disabled && <strong aria-hidden="true">{skill.cooldownRemaining.toFixed(1)}</strong>}
    </button>
  );
}

export function MobileControls({
  skills,
  dodgeCooldownRemaining,
  dodgeCooldownTotal,
  onMove,
  onMoveEnd,
  onAttackChange,
  onAttackAim,
  onDodge,
  onSkill,
  onSkillAim,
}: MobileControlsProps) {
  const dodgeCoolingDown = dodgeCooldownRemaining > 0;
  const dodgeRatio = clamp01(dodgeCooldownRemaining / Math.max(dodgeCooldownTotal, 0.001));
  const attackPointerRef = useRef<number | null>(null);
  const attackOriginRef = useRef<PointerOrigin | null>(null);
  const [attackAiming, setAttackAiming] = useState(false);
  const [skillAim, setSkillAim] = useState<{ skillId: ActiveSkillId; vector: MoveVector } | null>(null);
  const handleSkillAim = useCallback((skillId: ActiveSkillId, vector: MoveVector | null) => {
    setSkillAim(vector ? { skillId, vector } : null);
    onSkillAim(skillId, vector);
  }, [onSkillAim]);
  const releaseCallbacksRef = useRef({ onMoveEnd, onAttackChange, onAttackAim });
  releaseCallbacksRef.current = { onMoveEnd, onAttackChange, onAttackAim };

  const updateAttackAim = useCallback((clientX: number, clientY: number) => {
    const origin = attackOriginRef.current;
    if (!origin) return;
    const vector = resolveAttackDragAim(clientX, clientY, origin);
    setAttackAiming(vector !== null);
    onAttackAim(vector);
  }, [onAttackAim]);

  const releaseAttack = useCallback((pointerId: number) => {
    if (attackPointerRef.current !== pointerId) return;
    attackPointerRef.current = null;
    attackOriginRef.current = null;
    setAttackAiming(false);
    onAttackAim(null);
    onAttackChange(false);
  }, [onAttackAim, onAttackChange]);

  useEffect(() => () => {
    releaseCallbacksRef.current.onMoveEnd();
    releaseCallbacksRef.current.onAttackAim(null);
    releaseCallbacksRef.current.onAttackChange(false);
  }, []);

  return (
    <div className="ui-mobile-controls" aria-label="모바일 조작" data-testid="mobile-controls">
      <div className="ui-mobile-controls__left"><MobileJoystick onMove={onMove} onMoveEnd={onMoveEnd} /></div>
      <div className="ui-mobile-controls__right">
        <div className="ui-touch-skills" role="list" aria-label="장착 스킬" data-testid="mobile-skill-fan">
          {Array.from({ length: 3 }, (_, index) => {
            const skill = skills[index];
            return (
              <MobileSkillButton
                key={skill?.id ?? `empty-${index}`}
                index={index}
                {...(skill ? { skill } : {})}
                onSkill={onSkill}
                onSkillAim={handleSkillAim}
              />
            );
          })}
        </div>
        <button
          className="ui-touch-dodge"
          type="button"
          aria-label={dodgeCoolingDown ? `회피 재사용 대기 ${dodgeCooldownRemaining.toFixed(1)}초` : '회피'}
          data-testid="mobile-dodge"
          disabled={dodgeCoolingDown}
          onPointerDown={(event) => { event.preventDefault(); onDodge(); }}
        >
          <UiIcon name="dash" size={25} />
          {dodgeCoolingDown && <span className="ui-touch-button__mask" style={{ transform: `scaleY(${dodgeRatio})` }} />}
          {dodgeCoolingDown && <strong>{dodgeCooldownRemaining.toFixed(1)}</strong>}
        </button>
        <button
          className="ui-touch-attack"
          type="button"
          aria-label="기본 공격. 누르면 연속 공격, 바깥 방향으로 드래그하면 조준"
          data-testid="mobile-attack"
          data-aiming={attackAiming}
          onPointerDown={(event) => {
            event.preventDefault();
            if (attackPointerRef.current !== null) return;
            attackPointerRef.current = event.pointerId;
            attackOriginRef.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
            onAttackChange(true);
            setAttackAiming(false);
            onAttackAim(null);
          }}
          onPointerMove={(event) => {
            if (attackPointerRef.current !== event.pointerId) return;
            event.preventDefault();
            updateAttackAim(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => releaseAttack(event.pointerId)}
          onPointerCancel={(event) => releaseAttack(event.pointerId)}
          onLostPointerCapture={(event) => releaseAttack(event.pointerId)}
        >
          <UiIcon name="crosshair" size={33} />
          <span>FIRE</span>
        </button>
      </div>
      <div
        className={`ui-skill-aim-preview${skillAim ? ' is-visible' : ''}`}
        data-testid="mobile-skill-aim-preview"
        data-skill-id={skillAim?.skillId ?? ''}
        aria-hidden="true"
        style={skillAim ? { transform: `rotate(${Math.atan2(skillAim.vector.y, skillAim.vector.x)}rad)` } : undefined}
      ><span /></div>
    </div>
  );
}

type OrientationActionState = 'idle' | 'working' | 'success' | 'manual' | 'error';
type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

export function OrientationOverlay() {
  const [state, setState] = useState<OrientationActionState>('idle');
  const [message, setMessage] = useState('버튼을 누르면 전체 화면과 가로 모드를 한 번에 시도합니다.');

  const requestLandscape = useCallback(async () => {
    setState('working');
    setMessage('전체 화면과 가로 모드를 요청하고 있습니다…');

    let fullscreenReady = Boolean(document.fullscreenElement);
    let fullscreenError: unknown;
    if (!fullscreenReady) {
      if (typeof document.documentElement.requestFullscreen === 'function') {
        try {
          await document.documentElement.requestFullscreen();
          fullscreenReady = true;
        } catch (error) {
          fullscreenError = error;
        }
      } else {
        fullscreenError = new Error('Fullscreen API unsupported');
      }
    }

    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
    if (orientation && typeof orientation.lock === 'function') {
      try {
        await orientation.lock('landscape');
        setState('success');
        setMessage(fullscreenReady
          ? '전체 화면 가로 모드로 전환했습니다.'
          : '가로 모드로 전환했습니다. 전체 화면이 허용되지 않아 현재 화면으로 계속합니다.');
        return;
      } catch (error) {
        const reason = error instanceof DOMException && error.name === 'NotAllowedError'
          ? '브라우저가 자동 회전을 허용하지 않았습니다.'
          : '이 기기에서는 자동 가로 전환을 완료할 수 없습니다.';
        setState(fullscreenError ? 'error' : 'manual');
        setMessage(`${reason} 기기를 직접 가로로 돌려 주세요.`);
        return;
      }
    }

    setState(fullscreenError ? 'error' : 'manual');
    setMessage(fullscreenReady
      ? '전체 화면은 켜졌지만 자동 회전을 지원하지 않습니다. 기기를 직접 가로로 돌려 주세요.'
      : '이 브라우저는 전체 화면 또는 자동 회전을 지원하지 않습니다. 기기를 직접 가로로 돌려 주세요.');
  }, []);

  return (
    <div
      className="ui-orientation"
      role="dialog"
      aria-modal="true"
      aria-labelledby="orientation-title"
      aria-describedby="orientation-status"
      data-testid="orientation-overlay"
    >
      <div className="ui-orientation__device" aria-hidden="true"><span /></div>
      <h2 id="orientation-title">기기를 가로로 돌려 주세요</h2>
      <p
        id="orientation-status"
        className="ui-orientation__status"
        role="status"
        aria-live="polite"
        data-testid="orientation-status"
        data-state={state}
      >{message}</p>
      <button
        className="ui-orientation__action"
        type="button"
        aria-label="전체 화면으로 전환하고 가로 모드 시도"
        data-testid="orientation-action"
        disabled={state === 'working'}
        aria-busy={state === 'working'}
        onClick={() => { void requestLandscape(); }}
      >
        <UiIcon name="play" size={16} />
        <span>{state === 'working' ? '전환 중…' : state === 'idle' ? '가로 모드 시작' : '다시 시도'}</span>
      </button>
      <span className="ui-orientation__label">LANDSCAPE MODE REQUIRED</span>
    </div>
  );
}
