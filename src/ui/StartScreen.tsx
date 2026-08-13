import { UiIcon } from './icons';
import type { StartScreenProps } from './types';
import { formatNumber, formatTime } from './utils';

export function StartScreen({
  onStart,
  onStageChange,
  onSettings,
  title = 'VOID//BREACH',
  subtitle = 'Hold the line. Break the swarm.',
  bestKills = 0,
  bestLevel = 0,
  bestDurationSeconds = 0,
  stageProgress,
}: StartScreenProps) {
  const totalStages = stageProgress?.totalStages ?? 20;
  const maxStars = stageProgress?.maxStars ?? totalStages * 3;
  const unlockedStages = Math.max(1, Math.min(totalStages, stageProgress?.unlockedStages ?? 1));
  const currentStage = Math.max(1, Math.min(unlockedStages, stageProgress?.currentStage ?? 1));
  const currentStars = Math.max(0, Math.min(3, stageProgress?.stageStars?.[currentStage - 1] ?? 0));
  const recordedBestClear = stageProgress?.stageBestDurationSeconds?.[currentStage - 1];
  const currentBestClearSeconds = typeof recordedBestClear === 'number' && Number.isFinite(recordedBestClear) && recordedBestClear > 0
    ? recordedBestClear
    : null;
  const selectStage = (stage: number) => {
    if (!onStageChange) return;
    onStageChange(Math.max(1, Math.min(unlockedStages, stage)));
  };

  return (
    <main className="ui-screen ui-start-screen" aria-labelledby="game-title">
      <div className="ui-start-screen__backdrop" aria-hidden="true" />
      <div className="ui-start-screen__grid" aria-hidden="true" />
      <div className="ui-start-screen__vignette" aria-hidden="true" />

      <header className="ui-start-screen__topbar">
        <div className="ui-micro-brand">
          <span className="ui-micro-brand__mark" aria-hidden="true">V</span>
          <span>ARES DEFENSE NETWORK</span>
        </div>
        {onSettings && (
          <button
            className="ui-icon-button"
            type="button"
            aria-label="설정 열기"
            onClick={onSettings}
          >
            <UiIcon name="settings" />
          </button>
        )}
      </header>

      <section className="ui-start-screen__content">
        <div className="ui-start-screen__copy">
          <p className="ui-eyebrow">
            <span className="ui-live-dot" aria-hidden="true" />
            SECTOR 07 · BREACH DETECTED
          </p>
          <h1 id="game-title" className="ui-game-title">
            <span>{title.split('//')[0]}</span>
            <span className="ui-game-title__accent">
              {title.includes('//') ? `//${title.split('//').slice(1).join('//')}` : ''}
            </span>
          </h1>
          <p className="ui-start-screen__subtitle">{subtitle}</p>
          <p className="ui-start-screen__description">
            마지막 방어선을 사수하고, 200체의 침공 개체를 돌파해<br />
            차원의 문을 연 최종 지휘체를 제거하십시오.
          </p>

          <div className="ui-start-screen__actions">
            <div className="ui-start-screen__button-stack">
              {stageProgress && (
                <div
                  className="ui-start-stage-picker"
                  role="group"
                  aria-label="출격 스테이지 선택"
                  data-testid="start-stage-selector"
                  data-stage={currentStage}
                  data-stage-stars={currentStars}
                  data-unlocked-stages={unlockedStages}
                  data-stage-best-seconds={currentBestClearSeconds ?? undefined}
                >
                  <button
                    className="ui-start-stage-picker__arrow"
                    type="button"
                    onClick={() => selectStage(currentStage - 1)}
                    disabled={!onStageChange || currentStage <= 1}
                    aria-label="이전 해금 스테이지"
                    data-testid="start-stage-prev"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <div
                    className="ui-start-stage-picker__current"
                    aria-live="polite"
                    data-testid="start-stage-current"
                  >
                    <small>SELECTED OPERATION</small>
                    <div>
                      <span>STAGE</span>
                      <strong>{String(currentStage).padStart(2, '0')}</strong>
                      <i>/ {totalStages}</i>
                      <em data-testid="start-stage-best-time">
                        BEST CLEAR {currentBestClearSeconds === null ? '—' : formatTime(currentBestClearSeconds)}
                      </em>
                    </div>
                    <span className="ui-start-stage-picker__stars" aria-label={`최고 기록 별 ${currentStars}개`}>
                      {[1, 2, 3].map((star) => (
                        <UiIcon key={star} name="star" size={12} className={star <= currentStars ? 'is-earned' : ''} />
                      ))}
                      <b>{stageProgress.totalStars} / {maxStars}</b>
                    </span>
                  </div>
                  <button
                    className="ui-start-stage-picker__arrow"
                    type="button"
                    onClick={() => selectStage(currentStage + 1)}
                    disabled={!onStageChange || currentStage >= unlockedStages}
                    aria-label="다음 해금 스테이지"
                    data-testid="start-stage-next"
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              )}
              <button
                className="ui-primary-button ui-primary-button--hero"
                type="button"
                onClick={onStart}
                aria-label={`스테이지 ${currentStage} 전투 시작`}
                data-testid="start-game"
                data-stage={currentStage}
              >
                <span className="ui-primary-button__glow" aria-hidden="true" />
                <UiIcon name="play" size={22} />
                <span>
                  <small>OPERATION</small>
                  전투 시작
                </span>
                <UiIcon className="ui-primary-button__chevron" name="chevron" size={18} />
              </button>
            </div>
            <div className="ui-start-screen__controls-hint" aria-label="PC 조작법">
              <span><kbd>WASD</kbd> 이동</span>
              <span><kbd>Q E R</kbd> 스킬</span>
              <span><kbd>SPACE</kbd> 회피</span>
            </div>
          </div>
        </div>

        <div className="ui-operator-visual" aria-hidden="true">
          <div className="ui-operator-visual__halo" />
          <div className="ui-operator-visual__scanline" />
          <div className="ui-operator-visual__tag">
            <span>FIELD UNIT</span>
            <strong>ARES-09</strong>
          </div>
        </div>
      </section>

      <footer className="ui-start-screen__footer">
        <div className="ui-record-strip" aria-label="최고 기록">
          <span className="ui-record-strip__label">BEST RUN</span>
          <span><small>KILLS</small><strong>{formatNumber(bestKills)}</strong></span>
          <span><small>LEVEL</small><strong>{bestLevel || '—'}</strong></span>
          <span><small>FASTEST</small><strong>{bestDurationSeconds ? formatTime(bestDurationSeconds) : '—'}</strong></span>
        </div>
        <span className="ui-build-label">PROTOCOL 2.0 · LOCAL SIMULATION</span>
      </footer>
    </main>
  );
}
