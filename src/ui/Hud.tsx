import { UiIcon } from './icons';
import type { BossState, CombatProgress, HudProps, PlayerVitals, SkillHudItem } from './types';
import { formatNumber, ratio } from './utils';

interface MeterProps {
  label: string;
  value: number;
  max: number;
  tone: 'health' | 'shield' | 'xp';
  icon?: 'heart' | 'shield';
}

function Meter({ label, value, max, tone, icon }: MeterProps) {
  const amount = ratio(value, max);

  return (
    <div className={`ui-meter ui-meter--${tone}`}>
      <div className="ui-meter__meta">
        <span className="ui-meter__label">
          {icon && <UiIcon name={icon} size={13} />}
          {label}
        </span>
        <strong>{formatNumber(value)} <small>/ {formatNumber(max)}</small></strong>
      </div>
      <div
        className="ui-meter__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.max(0, Math.min(value, max))}
      >
        <span className="ui-meter__fill" style={{ transform: `scaleX(${amount})` }} />
        <span className="ui-meter__shine" aria-hidden="true" />
      </div>
    </div>
  );
}

export function VitalCluster({ vitals }: { vitals: PlayerVitals }) {
  return (
    <section className="ui-vitals" aria-label="플레이어 상태">
      <Meter label="ARMOR" value={vitals.health} max={vitals.maxHealth} tone="health" icon="heart" />
      <Meter label="AEGIS" value={vitals.shield} max={vitals.maxShield} tone="shield" icon="shield" />
    </section>
  );
}

export function DeploymentCounter({
  progress,
  currentStage = 1,
  frontName,
}: {
  progress: CombatProgress;
  currentStage?: number;
  frontName?: string;
}) {
  const deploymentRatio = ratio(progress.deployed, progress.totalDeployments);
  const danger = deploymentRatio >= 0.85;

  return (
    <section className={`ui-deployment ${danger ? 'ui-deployment--danger' : ''}`} aria-label="전투 진행 상황">
      <div className="ui-deployment__header">
        <span>MONSTERS DEPLOYED</span>
        <span className="ui-deployment__sector">
          {frontName ?? `STAGE ${String(currentStage).padStart(2, '0')}`}
        </span>
      </div>
      <div className="ui-deployment__numbers">
        <strong>{formatNumber(progress.deployed)}</strong>
        <span>/ {formatNumber(progress.totalDeployments)}</span>
      </div>
      <div
        className="ui-deployment__track"
        role="progressbar"
        aria-label="몬스터 투입 수"
        aria-valuemin={0}
        aria-valuemax={progress.totalDeployments}
        aria-valuenow={progress.deployed}
      >
        <span style={{ transform: `scaleX(${deploymentRatio})` }} />
      </div>
      <div className="ui-deployment__footer">
        <span><i className="ui-alive-pulse" aria-hidden="true" />ALIVE <strong>{progress.alive}</strong></span>
        <span>KILLS <strong>{progress.kills}</strong></span>
        {!!progress.elitesAlive && <span className="ui-deployment__elite">ELITE <strong>{progress.elitesAlive}</strong></span>}
      </div>
    </section>
  );
}

export function XpBar({ progress }: { progress: CombatProgress }) {
  return (
    <section className="ui-xp" aria-label={`레벨 ${progress.level}`}>
      <div className="ui-level-badge">
        <small>LV</small>
        <strong>{progress.level}</strong>
      </div>
      <div className="ui-xp__body">
        <div className="ui-xp__labels">
          <span>NEURAL SYNC</span>
          <strong>{progress.xp} <small>/ {progress.xpToNext} XP</small></strong>
        </div>
        <div
          className="ui-xp__track"
          role="progressbar"
          aria-label="경험치"
          aria-valuemin={0}
          aria-valuemax={progress.xpToNext}
          aria-valuenow={progress.xp}
        >
          <span style={{ transform: `scaleX(${ratio(progress.xp, progress.xpToNext)})` }} />
        </div>
      </div>
    </section>
  );
}

export function BossHealthBar({ boss }: { boss: BossState }) {
  const vulnerabilityMultiplier = boss.vulnerabilityDamageMultiplier ?? 1.5;
  const breakSeconds = Math.max(0, boss.breakRemaining ?? 0);
  return (
    <section
      className={`ui-boss-bar ${boss.vulnerable ? 'is-vulnerable' : ''}`}
      aria-label={`${boss.name} 보스 체력${boss.vulnerable ? `, 브레이크 피해 ${vulnerabilityMultiplier}배` : ''}`}
      data-testid="boss-health-bar"
      data-vulnerable={boss.vulnerable ? 'true' : 'false'}
    >
      <div className="ui-boss-bar__identity">
        <span>FINAL THREAT</span>
        <strong data-testid="boss-health-name">{boss.name}</strong>
      </div>
      <div className="ui-boss-bar__phase">
        {boss.vulnerable ? (
          <em data-testid="boss-break-state" role="status">
            BREAK {breakSeconds.toFixed(1)}s · DAMAGE x{vulnerabilityMultiplier.toFixed(1)}
          </em>
        ) : (
          <>PHASE <strong>0{boss.phase}</strong></>
        )}
      </div>
      <div
        className="ui-boss-bar__track"
        role="progressbar"
        aria-label={`${boss.name} 체력`}
        aria-valuemin={0}
        aria-valuemax={boss.maxHealth}
        aria-valuenow={boss.health}
      >
        <span style={{ transform: `scaleX(${ratio(boss.health, boss.maxHealth)})` }} />
        <i aria-hidden="true" />
      </div>
      <div className="ui-boss-bar__numbers">{formatNumber(boss.health)} / {formatNumber(boss.maxHealth)}</div>
    </section>
  );
}

export function BossWarning({ bossName = 'FINAL BOSS' }: { bossName?: string }) {
  return (
    <div
      className="ui-boss-warning"
      role="alert"
      aria-live="assertive"
      aria-label={`${bossName} 출현 경고`}
      data-testid="boss-warning"
    >
      <div className="ui-boss-warning__line" aria-hidden="true" />
      <UiIcon name="skull" size={38} />
      <div>
        <span>CRITICAL THREAT DETECTED</span>
        <strong data-testid="boss-warning-name">{bossName}</strong>
        <small>FINAL THREAT INCOMING</small>
      </div>
      <UiIcon name="skull" size={38} />
      <div className="ui-boss-warning__line" aria-hidden="true" />
    </div>
  );
}

const DESKTOP_SKILL_KEYS = ['Q', 'E', 'R'] as const;

export function SkillButton({ skill, hotkey }: { skill?: SkillHudItem; hotkey: string }) {
  if (!skill) {
    return (
      <div
        className="ui-skill ui-skill--empty"
        role="listitem"
        aria-label={`${hotkey} 스킬 슬롯, 미장착, 레벨업에서 획득`}
        data-testid={`desktop-skill-slot-${hotkey.toLowerCase()}`}
        data-skill-state="empty"
      >
        <div className="ui-skill__icon ui-skill__icon--empty" aria-hidden="true">
          <UiIcon name="active" size={27} />
          <kbd>{hotkey}</kbd>
        </div>
        <div className="ui-skill__details">
          <div className="ui-skill__heading">
            <strong>미장착</strong>
            <span>EMPTY</span>
          </div>
          <p>레벨업에서 획득</p>
          <div className="ui-skill__empty-track" aria-hidden="true"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  const cooldownRatio = ratio(skill.cooldownRemaining, skill.cooldownTotal);
  const cooldownProgress = 1 - cooldownRatio;
  const ready = skill.cooldownRemaining <= 0;
  const cooldownLabel = ready ? '사용 가능' : `재사용 대기 ${skill.cooldownRemaining.toFixed(1)}초`;

  return (
    <div
      className={`ui-skill ui-skill--${skill.tone ?? 'cyan'} ${ready ? 'ui-skill--ready' : 'ui-skill--cooldown'}`}
      role="listitem"
      aria-label={`${hotkey} 스킬, ${skill.name}, 레벨 ${skill.level}, ${cooldownLabel}`}
      data-testid={`desktop-skill-slot-${hotkey.toLowerCase()}`}
      data-skill-state={ready ? 'ready' : 'cooldown'}
    >
      <div className="ui-skill__icon">
        {skill.iconSrc ? (
          <img src={skill.iconSrc} alt="" draggable={false} />
        ) : (
          <UiIcon name="bolt" size={31} />
        )}
        {!ready && (
          <span
            className="ui-skill__cooldown-mask"
            style={{ transform: `scaleY(${cooldownRatio})` }}
            aria-hidden="true"
          />
        )}
        {!ready && <strong className="ui-skill__cooldown">{skill.cooldownRemaining.toFixed(1)}</strong>}
        <kbd>{hotkey}</kbd>
      </div>
      <div className="ui-skill__details">
        <div className="ui-skill__heading">
          <strong>{skill.name}</strong>
          <span>LV.{skill.level}</span>
        </div>
        <p>{cooldownLabel}</p>
        <div
          className="ui-skill__cooldown-track"
          role="progressbar"
          aria-label={`${skill.name} 재사용 준비도`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(cooldownProgress * 100)}
        >
          <span style={{ transform: `scaleX(${cooldownProgress})` }} />
        </div>
      </div>
    </div>
  );
}

export function SkillTray({ skills }: { skills: SkillHudItem[] }) {
  return (
    <section
      className="ui-skill-tray"
      aria-label="액티브 스킬 슬롯"
      data-testid="desktop-skill-tray"
    >
      <span className="ui-skill-tray__label" aria-hidden="true">ACTIVE PROTOCOLS</span>
      <div className="ui-skill-tray__slots" role="list" aria-label="Q E R 액티브 스킬">
        {DESKTOP_SKILL_KEYS.map((hotkey, index) => (
          <SkillButton
            key={hotkey}
            hotkey={hotkey}
            {...(skills[index] ? { skill: skills[index] } : {})}
          />
        ))}
      </div>
    </section>
  );
}

export function GameHud({
  vitals,
  progress,
  skills,
  boss,
  showBossWarning,
  currentStage = 1,
  currentFrontName,
  currentBossName,
  currentThreatRoster,
  bossWarningName,
  onPause,
}: HudProps) {
  const warningName = bossWarningName ?? currentBossName ?? boss?.name ?? 'FINAL BOSS';

  return (
    <div className="ui-hud" aria-label="게임 HUD">
      <div className="ui-hud__top-left"><VitalCluster vitals={vitals} /></div>
      <div className="ui-hud__top-center">
        <DeploymentCounter
          progress={progress}
          currentStage={currentStage}
          {...(currentFrontName ? { frontName: currentFrontName } : {})}
        />
      </div>
      <div className="ui-hud__top-right">
        <div
          className="ui-current-stage"
          aria-label={`현재 스테이지 ${currentStage}`}
          data-testid="current-stage"
          data-front-name={currentFrontName}
          data-boss-name={currentBossName}
        >
          <span>STAGE</span><strong>{String(currentStage).padStart(2, '0')}</strong>
        </div>
        {(currentFrontName || currentBossName) && (
          <div
            className="ui-encounter-info"
            data-testid="encounter-info"
            data-front-name={currentFrontName}
            data-boss-name={currentBossName}
            data-threat-count={currentThreatRoster?.length ?? 0}
            aria-label={[
              currentFrontName ? `전선 ${currentFrontName}` : '',
              currentBossName ? `보스 ${currentBossName}` : '',
              currentThreatRoster?.length ? `위협 ${currentThreatRoster.join(', ')}` : '',
            ].filter(Boolean).join(', ')}
          >
            {currentFrontName && <span>{currentFrontName}</span>}
            {currentBossName && <strong><UiIcon name="skull" size={10} />{currentBossName}</strong>}
          </div>
        )}
        <div className="ui-threat-chip"><UiIcon name="crosshair" size={16} /> THREAT <strong>{Math.min(5, Math.max(1, Math.ceil(progress.deployed / 40)))}</strong></div>
        <button className="ui-icon-button ui-icon-button--pause" type="button" aria-label="일시정지" onClick={onPause}>
          <UiIcon name="pause" />
        </button>
      </div>
      <div className="ui-hud__xp"><XpBar progress={progress} /></div>
      {boss && <div className="ui-hud__boss"><BossHealthBar boss={boss} /></div>}
      {showBossWarning && <div className="ui-hud__warning"><BossWarning bossName={warningName} /></div>}
      <div className="ui-hud__skills"><SkillTray skills={skills} /></div>
      <div className="ui-hud__desktop-help" aria-hidden="true">
        <span><kbd>WASD</kbd> MOVE</span>
        <span><kbd>LMB</kbd> FIRE</span>
        <span><kbd>SPACE</kbd> DASH</span>
      </div>
    </div>
  );
}
