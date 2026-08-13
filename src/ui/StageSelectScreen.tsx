import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { UiIcon } from './icons';
import type { StageRecord, StageSelectScreenProps, StageStars } from './types';

const STAGE_COUNT = 20;
const STARS_PER_STAGE = 3;
const SWIPE_THRESHOLD = 44;
const MAX_VISIBLE_THREATS = 8;

function clampStage(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(STAGE_COUNT, Math.round(value)));
}

function asStars(value: number): StageStars {
  return Math.max(0, Math.min(STARS_PER_STAGE, Math.round(value))) as StageStars;
}

function normalizeStages(stages: readonly StageRecord[]): StageRecord[] {
  const provided = new Map(
    stages
      .filter((record) => Number.isInteger(record.stage) && record.stage >= 1 && record.stage <= STAGE_COUNT)
      .map((record) => [record.stage, record]),
  );

  return Array.from({ length: STAGE_COUNT }, (_, index) => {
    const stage = index + 1;
    const record = provided.get(stage);
    if (!record) return { stage, unlocked: stage === 1, bestStars: 0 };
    return { ...record, stage, bestStars: asStars(record.bestStars) };
  });
}

function StageRating({ stars }: { stars: StageStars }) {
  return (
    <span className="ui-stage-preview__stars" aria-label={`최고 기록 별 ${stars}개`}>
      {[1, 2, 3].map((star) => (
        <UiIcon key={star} name="star" size={24} className={star <= stars ? 'is-earned' : ''} />
      ))}
    </span>
  );
}

interface SwipeOrigin {
  pointerId: number;
  x: number;
  y: number;
}

export function StageSelectScreen({
  stages,
  selectedStage,
  totalStars,
  maxStars = STAGE_COUNT * STARS_PER_STAGE,
  onSelectStage,
  onPreviewStage,
  onDeploy,
  onBack,
}: StageSelectScreenProps) {
  const records = normalizeStages(stages);
  const initialStage = clampStage(
    selectedStage ?? records.find((record) => record.unlocked)?.stage ?? 1,
  );
  const [previewStage, setPreviewStage] = useState(initialStage);
  const swipeOrigin = useRef<SwipeOrigin | null>(null);
  const calculatedStars = records.reduce((sum, record) => sum + record.bestStars, 0);
  const earnedStars = Math.max(0, Math.min(maxStars, totalStars ?? calculatedStars));
  const unlockedCount = records.filter((record) => record.unlocked).length;
  const previewRecord = records[previewStage - 1] ?? records[0]!;
  const threats = previewRecord.threatRoster?.filter((name) => name.trim().length > 0) ?? [];
  const deploy = onDeploy ?? onSelectStage;

  useEffect(() => {
    if (selectedStage === undefined) return;
    setPreviewStage(clampStage(selectedStage));
  }, [selectedStage]);

  const preview = useCallback((requestedStage: number) => {
    const nextStage = clampStage(requestedStage);
    if (nextStage === previewStage) return;
    setPreviewStage(nextStage);
    onPreviewStage?.(nextStage);
  }, [onPreviewStage, previewStage]);

  const handlePreviewKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      preview(previewStage - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      preview(previewStage + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      preview(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      preview(STAGE_COUNT);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    swipeOrigin.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = swipeOrigin.current;
    swipeOrigin.current = null;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - origin.x;
    const deltaY = event.clientY - origin.y;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    preview(previewStage + (deltaX < 0 ? 1 : -1));
  };

  const currentLabel = [
    `스테이지 ${previewStage}`,
    previewRecord.unlocked ? '출격 가능' : '잠김',
    previewRecord.frontName ? `전선 ${previewRecord.frontName}` : '',
    previewRecord.bossName ? `보스 ${previewRecord.bossName}` : '',
    threats.length > 0 ? `출현 위협 ${threats.join(', ')}` : '',
  ].filter(Boolean).join(', ');
  const rangeProgress = ((previewStage - 1) / (STAGE_COUNT - 1)) * 100;

  return (
    <main
      className="ui-screen ui-stage-select"
      aria-labelledby="stage-select-title"
      data-testid="stage-select-screen"
    >
      <div className="ui-stage-select__backdrop" aria-hidden="true" />
      <div className="ui-stage-select__grid-bg" aria-hidden="true" />

      <header className="ui-stage-select__header">
        <button
          className="ui-secondary-button ui-stage-select__back"
          type="button"
          onClick={onBack}
          aria-label="메인 화면으로 돌아가기"
          data-testid="stage-select-back"
        >
          <span className="ui-stage-select__back-arrow" aria-hidden="true">‹</span>
          뒤로
        </button>
        <div className="ui-stage-select__heading">
          <p className="ui-eyebrow"><span className="ui-live-dot" aria-hidden="true" />ARES CAMPAIGN NETWORK</p>
          <h1 id="stage-select-title">STAGE SELECT</h1>
          <p>작전 정보를 확인한 뒤 출격하세요. 잠긴 구역도 미리 볼 수 있습니다.</p>
        </div>
        <div className="ui-stage-select__summary" aria-label={`별 ${earnedStars}개, 총 ${maxStars}개`}>
          <UiIcon name="star" size={22} />
          <span>TOTAL STARS<strong>{earnedStars} <small>/ {maxStars}</small></strong></span>
        </div>
      </header>

      <section className="ui-stage-select__body" aria-label="캠페인 스테이지 미리보기">
        <div className="ui-stage-select__meta">
          <span><strong>{unlockedCount}</strong> / {STAGE_COUNT} SECTORS UNLOCKED</span>
          <span>ARROW KEYS OR SWIPE TO NAVIGATE</span>
        </div>

        <div className="ui-stage-carousel">
          <button
            className="ui-stage-carousel__arrow ui-stage-carousel__arrow--prev"
            type="button"
            onClick={() => preview(previewStage - 1)}
            disabled={previewStage <= 1}
            aria-label="이전 스테이지"
            data-testid="stage-prev"
          >
            <span aria-hidden="true">‹</span>
          </button>

          <article
            className={`ui-stage-preview ${previewRecord.unlocked ? 'is-unlocked' : 'is-locked'}`}
            tabIndex={0}
            role="group"
            aria-label={currentLabel}
            aria-live="polite"
            onKeyDown={handlePreviewKeyDown}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { swipeOrigin.current = null; }}
            data-testid="stage-current"
            data-stage={previewStage}
            data-stage-state={previewRecord.unlocked ? 'unlocked' : 'locked'}
            data-stage-stars={previewRecord.bestStars}
            data-front-name={previewRecord.frontName}
            data-boss-name={previewRecord.bossName}
            data-threat-count={threats.length}
          >
            <span className="ui-stage-preview__scan" aria-hidden="true" />
            <div className="ui-stage-preview__designation">
              <span className="ui-stage-preview__state">
                <UiIcon name={previewRecord.unlocked ? 'check' : 'lock'} size={13} />
                {previewRecord.unlocked
                  ? previewRecord.bestStars > 0 ? 'SECTOR CLEARED' : 'DEPLOYMENT READY'
                  : 'SECTOR LOCKED'}
              </span>
              <div className="ui-stage-preview__number">
                <small>STAGE</small>
                <strong>{String(previewStage).padStart(2, '0')}</strong>
                <span>/ {STAGE_COUNT}</span>
              </div>
              <StageRating stars={previewRecord.bestStars} />
            </div>

            <div className="ui-stage-preview__intel">
              <div className="ui-stage-preview__front" data-testid="stage-current-front">
                <small>OPERATION FRONT</small>
                <strong>{previewRecord.frontName ?? `UNMAPPED SECTOR ${String(previewStage).padStart(2, '0')}`}</strong>
              </div>
              <div className="ui-stage-preview__boss" data-testid="stage-current-boss">
                <UiIcon name="skull" size={24} />
                <span><small>FINAL THREAT</small><strong>{previewRecord.bossName ?? '미확인 최종 위협'}</strong></span>
              </div>
              <div
                className="ui-stage-preview__roster"
                data-testid="stage-current-roster"
                aria-label={threats.length > 0 ? `출현 위협 ${threats.join(', ')}` : '출현 위협 정보 없음'}
              >
                <small>THREAT ROSTER <b>{threats.length}</b></small>
                <div>
                  {threats.slice(0, MAX_VISIBLE_THREATS).map((threat, index) => (
                    <span key={`${threat}-${index}`}>{threat}</span>
                  ))}
                  {threats.length > MAX_VISIBLE_THREATS && (
                    <span className="ui-stage-preview__more">+{threats.length - MAX_VISIBLE_THREATS}</span>
                  )}
                  {threats.length === 0 && <em>NO INTEL AVAILABLE</em>}
                </div>
              </div>
            </div>
          </article>

          <button
            className="ui-stage-carousel__arrow ui-stage-carousel__arrow--next"
            type="button"
            onClick={() => preview(previewStage + 1)}
            disabled={previewStage >= STAGE_COUNT}
            aria-label="다음 스테이지"
            data-testid="stage-next"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div className="ui-stage-scrubber">
          <label htmlFor="stage-range">
            <span>CAMPAIGN ROUTE</span>
            <strong>{String(previewStage).padStart(2, '0')} / {STAGE_COUNT}</strong>
          </label>
          <input
            id="stage-range"
            type="range"
            min={1}
            max={STAGE_COUNT}
            step={1}
            value={previewStage}
            onChange={(event) => preview(Number(event.currentTarget.value))}
            aria-label="미리 볼 스테이지"
            aria-valuetext={`스테이지 ${previewStage}, ${previewRecord.unlocked ? '출격 가능' : '잠김'}`}
            data-testid="stage-range"
            style={{ '--ui-stage-progress': `${rangeProgress}%` } as CSSProperties}
          />
          <ol className="ui-stage-rail" role="list" aria-label="20개 스테이지 경로" data-testid="stage-grid">
            {records.map((record) => (
              <li key={record.stage}>
                <button
                  className={`ui-stage-rail__dot ${record.stage === previewStage ? 'is-active' : ''} ${record.bestStars > 0 ? 'is-cleared' : ''} ${record.unlocked ? '' : 'is-locked'}`}
                  type="button"
                  onClick={() => preview(record.stage)}
                  aria-label={`스테이지 ${record.stage}, ${record.unlocked ? `별 ${record.bestStars}개` : '잠김'}`}
                  aria-current={record.stage === previewStage ? 'step' : undefined}
                  data-testid={`stage-card-${record.stage}`}
                  data-stage-state={record.unlocked ? 'unlocked' : 'locked'}
                  data-stage-stars={record.bestStars}
                  data-front-name={record.frontName}
                  data-boss-name={record.bossName}
                >
                  <span data-testid={`stage-dot-${record.stage}`} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="ui-stage-select__action">
          <p>
            {previewRecord.unlocked
              ? <>SELECTED <strong>STAGE {String(previewStage).padStart(2, '0')}</strong></>
              : <><UiIcon name="lock" size={13} /> 이전 구역을 클리어하면 출격할 수 있습니다.</>}
          </p>
          <button
            className="ui-primary-button ui-stage-select__deploy"
            type="button"
            onClick={() => deploy?.(previewStage)}
            disabled={!previewRecord.unlocked || !deploy}
            aria-label={previewRecord.unlocked
              ? `스테이지 ${previewStage} 출격`
              : `스테이지 ${previewStage} 잠김, 출격 불가`}
            data-testid="stage-deploy"
            data-stage={previewStage}
            data-stage-state={previewRecord.unlocked ? 'unlocked' : 'locked'}
          >
            <UiIcon name={previewRecord.unlocked ? 'play' : 'lock'} size={20} />
            {previewRecord.unlocked ? <>DEPLOY <strong>STAGE {String(previewStage).padStart(2, '0')}</strong></> : 'SECTOR LOCKED'}
          </button>
        </div>
      </section>

      <footer className="ui-stage-select__footer">
        <span>PREVIEW ANY SECTOR // DEPLOYMENT REQUIRES ACCESS</span>
        <span>CAMPAIGN PROGRESS SAVED LOCALLY</span>
      </footer>
    </main>
  );
}
