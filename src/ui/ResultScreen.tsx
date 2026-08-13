import { UiIcon } from './icons';
import type { ResultScreenProps } from './types';
import { formatNumber, formatTime } from './utils';

export function ResultScreen({
  result,
  onRestart,
  onMainMenu,
  onNextStage,
  onStageSelect,
  totalStages = 20,
}: ResultScreenProps) {
  const outcome = result.victory ? 'VICTORY' : 'K.I.A.';
  const stageNumber = Math.max(1, Math.min(totalStages, result.stageNumber ?? 1));
  const starsEarned = Math.max(0, Math.min(3, result.starsEarned ?? (result.victory ? 3 : 0)));
  const bestStars = Math.max(starsEarned, Math.min(3, result.stageBestStars ?? starsEarned));
  const bestKills = result.stageBestKills ?? result.kills;
  const bestDuration = result.stageBestDurationSeconds;
  // Never round 49.x% up to a displayed 50%, which would contradict the
  // two-star threshold used by the runtime.
  const healthPercent = Math.floor(Math.max(0, Math.min(1, result.healthRatio ?? 0)) * 100 + 1e-9);
  const campaignComplete = result.victory && stageNumber >= totalStages;

  return (
    <main className={`ui-screen ui-result ui-result--${result.victory ? 'victory' : 'defeat'}`} aria-labelledby="result-title">
      <div className="ui-result__backdrop" aria-hidden="true" />
      <section className="ui-result__panel">
        <header className="ui-result__header">
          <span className="ui-result__kicker">OPERATION REPORT // STAGE {String(stageNumber).padStart(2, '0')}</span>
          <div className="ui-result__emblem"><UiIcon name={result.victory ? 'shield' : 'skull'} size={48} /></div>
          <h1 id="result-title">{outcome}</h1>
          <p>{result.victory ? '차원 균열이 폐쇄되었습니다.' : '방어선이 붕괴되었습니다.'}</p>
        </header>

        <section className="ui-result__stage-report" aria-label={`스테이지 ${stageNumber} 평가`}>
          <div className="ui-result__stage-number" data-testid="result-stage">
            <small>STAGE</small><strong>{String(stageNumber).padStart(2, '0')}</strong>
          </div>
          <div
            className="ui-result__stars"
            data-testid="result-stars"
            data-stars-earned={starsEarned}
            aria-label={`획득한 별 ${starsEarned}개`}
          >
            <span>MISSION RATING</span>
            <div>
              {[1, 2, 3].map((star) => (
                <UiIcon
                  key={star}
                  name="star"
                  size={48}
                  className={`ui-result-star ${star <= starsEarned ? 'is-earned' : ''}`}
                />
              ))}
            </div>
          </div>
          <div className="ui-result__best" aria-label="스테이지 최고 기록">
            <span>STAGE BEST {result.isNewStageBest && <em>NEW</em>}</span>
            <strong><UiIcon name="star" size={14} /> {bestStars} / 3</strong>
            <small>{formatNumber(bestKills)} KILLS · BEST CLEAR {bestDuration ? formatTime(bestDuration) : '—'}</small>
            <small className="ui-result__health">HP {healthPercent}%</small>
          </div>
        </section>

        <p className="ui-result__star-guide" aria-label="별 평가 기준">
          <span>RATING</span> 100% HP ★★★ <i>/</i> 50%+ HP ★★ <i>/</i> CLEAR ★
        </p>

        <div className="ui-result__stats">
          <div><span>DEPLOYED</span><strong>{formatNumber(result.deployed)}</strong><small>/ 200</small></div>
          <div><span>ELIMINATIONS</span><strong>{formatNumber(result.kills)}</strong></div>
          <div><span>FINAL LEVEL</span><strong>{String(result.finalLevel).padStart(2, '0')}</strong></div>
          <div><span>COMBAT TIME</span><strong>{formatTime(result.durationSeconds)}</strong></div>
        </div>

        <div className="ui-result__loadout">
          <section>
            <h2>FINAL LOADOUT</h2>
            <div className="ui-result__skills">
              {result.equippedSkills.map((skill) => (
                <div key={skill.id} className="ui-result-skill">
                  <div>{skill.iconSrc ? <img src={skill.iconSrc} alt="" /> : <UiIcon name="active" />}</div>
                  <span>{skill.name}</span><strong>LV.{skill.level}</strong>
                </div>
              ))}
              {result.equippedSkills.length === 0 && <p className="ui-empty-copy">장착된 액티브 프로토콜 없음</p>}
            </div>
          </section>
          <section>
            <h2>INSTALLED MODS</h2>
            <ul>
              {result.upgrades.slice(0, 5).map((upgrade) => <li key={upgrade}><UiIcon name="chevron" size={12} />{upgrade}</li>)}
              {result.upgrades.length === 0 && <li className="ui-empty-copy">설치된 강화 없음</li>}
            </ul>
          </section>
        </div>

        <div className={`ui-result__boss-status ${result.bossDefeated ? 'is-cleared' : ''}`}>
          <UiIcon name="skull" size={20} />
          <div className="ui-result__boss-identity">
            <span>FINAL THREAT</span>
            <strong data-testid="result-boss-name">{result.bossName ?? 'UNKNOWN THREAT'}</strong>
          </div>
          <strong className="ui-result__boss-state">
            {result.bossDefeated ? 'NEUTRALIZED' : 'ACTIVE'}
          </strong>
        </div>

        <footer className="ui-result__actions">
          <button className="ui-secondary-button" type="button" onClick={onRestart} data-testid="result-replay"><UiIcon name="restart" size={18} />다시 도전</button>
          {result.victory && !campaignComplete && (
            <button
              className="ui-primary-button"
              type="button"
              onClick={() => onNextStage?.()}
              disabled={!onNextStage}
              data-testid="result-next-stage"
            >
              <UiIcon name="play" size={18} />NEXT STAGE {String(stageNumber + 1).padStart(2, '0')}
            </button>
          )}
          {campaignComplete && (
            <div className="ui-result__complete" data-testid="campaign-complete" role="status">
              <UiIcon name="check" size={18} /> ALL STAGES COMPLETE
            </div>
          )}
          <button
            className="ui-secondary-button"
            type="button"
            onClick={onStageSelect ?? onMainMenu}
            data-testid="result-stage-select"
          >
            <UiIcon name="map" size={18} />스테이지 선택
          </button>
          <button className="ui-menu-button ui-result__home" type="button" onClick={onMainMenu}><UiIcon name="home" size={16} />메인 화면</button>
        </footer>
      </section>
    </main>
  );
}
