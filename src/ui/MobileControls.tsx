import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveSkillId } from '../game/core/types';
import { UiIcon } from './icons';
import type { MobileControlsProps, MoveVector, SkillHudItem } from './types';
import { clamp01 } from './utils';

const STICK_RADIUS = 42;

export function MobileJoystick({ onMove, onMoveEnd }: Pick<MobileControlsProps, 'onMove' | 'onMoveEnd'>) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [vector, setVector] = useState<MoveVector>({ x: 0, y: 0 });

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = clientX - (rect.left + rect.width / 2);
    const rawY = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > STICK_RADIUS ? STICK_RADIUS / distance : 1;
    const next = { x: (rawX * scale) / STICK_RADIUS, y: (rawY * scale) / STICK_RADIUS };
    setVector(next);
    onMove(next);
  }, [onMove]);

  const release = useCallback((pointerId: number) => {
    if (pointerRef.current !== pointerId) return;
    pointerRef.current = null;
    setVector({ x: 0, y: 0 });
    onMoveEnd();
  }, [onMoveEnd]);

  return (
    <div
      ref={zoneRef}
      className="ui-joystick"
      role="application"
      aria-label="이동 조이스틱"
      onPointerDown={(event) => {
        pointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePosition(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current === event.pointerId) updatePosition(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
    >
      <div className="ui-joystick__arrows" aria-hidden="true"><i /><i /><i /><i /></div>
      <div
        className="ui-joystick__knob"
        style={{ transform: `translate(${vector.x * STICK_RADIUS}px, ${vector.y * STICK_RADIUS}px)` }}
        aria-hidden="true"
      ><span /></div>
    </div>
  );
}

function MobileSkillButton({ skill, onSkill }: { skill: SkillHudItem; onSkill: (id: ActiveSkillId) => void }) {
  const cooldown = clamp01(skill.cooldownRemaining / Math.max(skill.cooldownTotal, 0.001));
  const disabled = skill.cooldownRemaining > 0;
  return (
    <button
      className={`ui-touch-skill ui-touch-skill--${skill.tone ?? 'cyan'}`}
      type="button"
      aria-label={`${skill.name}, 레벨 ${skill.level}${disabled ? `, 재사용 대기 ${skill.cooldownRemaining.toFixed(1)}초` : ''}`}
      disabled={disabled}
      onPointerDown={(event) => { event.preventDefault(); if (!disabled) onSkill(skill.id); }}
    >
      {skill.iconSrc ? <img src={skill.iconSrc} alt="" draggable={false} /> : <UiIcon name="bolt" size={23} />}
      {disabled && <span className="ui-touch-skill__mask" style={{ transform: `scaleY(${cooldown})` }} />}
      {disabled && <strong>{skill.cooldownRemaining.toFixed(1)}</strong>}
      <small>LV.{skill.level}</small>
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
  onDodge,
  onSkill,
}: MobileControlsProps) {
  const dodgeCoolingDown = dodgeCooldownRemaining > 0;
  const dodgeRatio = clamp01(dodgeCooldownRemaining / Math.max(dodgeCooldownTotal, 0.001));
  const releaseCallbacksRef = useRef({ onMoveEnd, onAttackChange });
  releaseCallbacksRef.current = { onMoveEnd, onAttackChange };

  useEffect(() => () => {
    releaseCallbacksRef.current.onMoveEnd();
    releaseCallbacksRef.current.onAttackChange(false);
  }, []);

  return (
    <div className="ui-mobile-controls" aria-label="모바일 조작">
      <div className="ui-mobile-controls__left"><MobileJoystick onMove={onMove} onMoveEnd={onMoveEnd} /></div>
      <div className="ui-mobile-controls__right">
        <div className="ui-touch-skills">
          {skills.slice(0, 3).map((skill) => <MobileSkillButton key={skill.id} skill={skill} onSkill={onSkill} />)}
        </div>
        <button
          className="ui-touch-dodge"
          type="button"
          aria-label={dodgeCoolingDown ? `회피 재사용 대기 ${dodgeCooldownRemaining.toFixed(1)}초` : '회피'}
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
          aria-label="기본 공격. 길게 눌러 연속 사격"
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onAttackChange(true); }}
          onPointerUp={() => onAttackChange(false)}
          onPointerCancel={() => onAttackChange(false)}
          onLostPointerCapture={() => onAttackChange(false)}
        >
          <UiIcon name="crosshair" size={33} />
          <span>FIRE</span>
        </button>
      </div>
    </div>
  );
}

export function OrientationOverlay() {
  return (
    <div className="ui-orientation" role="alert" aria-live="polite">
      <div className="ui-orientation__device" aria-hidden="true"><span /></div>
      <h2>기기를 가로로 돌려주세요</h2>
      <p>최상의 전투 경험을 위해 가로 화면이 필요합니다.</p>
      <span className="ui-orientation__label">LANDSCAPE MODE REQUIRED</span>
    </div>
  );
}
