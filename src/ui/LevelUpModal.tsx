import { useEffect } from 'react';
import { UiIcon } from './icons';
import type { LevelUpModalProps, UpgradeOption } from './types';

const categoryCopy: Record<UpgradeOption['category'], string> = {
  active: 'ACTIVE PROTOCOL',
  weapon: 'WEAPON MOD',
  survival: 'SURVIVAL CORE',
  recovery: 'FIELD RECOVERY',
};

function UpgradeCard({ option, index, onSelect }: {
  option: UpgradeOption;
  index: number;
  onSelect: (option: UpgradeOption) => void;
}) {
  const categoryIcon = option.category === 'active'
    ? 'active'
    : option.category === 'recovery'
      ? 'heart'
      : option.category;

  return (
    <button
      className={`ui-upgrade-card ui-upgrade-card--${option.rarity}`}
      type="button"
      autoFocus={index === 0}
      onClick={() => onSelect(option)}
      aria-label={`${option.title}, ${option.nextEffect} 선택`}
      data-testid={`upgrade-card-${index}`}
      data-option-id={option.id}
      data-upgrade-category={option.category}
      data-is-new={option.isNew ? 'true' : 'false'}
    >
      <span className="ui-upgrade-card__corner ui-upgrade-card__corner--tl" aria-hidden="true" />
      <span className="ui-upgrade-card__corner ui-upgrade-card__corner--br" aria-hidden="true" />
      <header className="ui-upgrade-card__header">
        <span className="ui-upgrade-card__category"><UiIcon name={categoryIcon} size={14} />{categoryCopy[option.category]}</span>
        <kbd>{index + 1}</kbd>
      </header>
      <div className="ui-upgrade-card__art" data-testid={`upgrade-card-art-${index}`}>
        {option.iconSrc ? (
          <img src={option.iconSrc} alt="" draggable={false} />
        ) : (
          <div className="ui-upgrade-card__fallback-icon"><UiIcon name={categoryIcon} size={50} /></div>
        )}
        <span className="ui-upgrade-card__rarity">{option.rarity}</span>
        {option.isNew && <span className="ui-upgrade-card__new">NEW</span>}
      </div>
      <div className="ui-upgrade-card__body">
        <h3 data-testid={`upgrade-card-title-${index}`}>{option.title}</h3>
        <div className="ui-upgrade-card__level">
          {option.category === 'recovery' ? (
            <><span>ONE-SHOT</span><UiIcon name="chevron" size={13} /><strong>INSTANT</strong></>
          ) : option.isNew ? (
            <><span>LOCKED</span><UiIcon name="chevron" size={13} /><strong>LV.1</strong></>
          ) : (
            <><span>LV.{option.currentLevel}</span><UiIcon name="chevron" size={13} /><strong>LV.{option.nextLevel}</strong></>
          )}
        </div>
        <p className={`ui-upgrade-card__description${option.isNew && option.category === 'active' ? ' is-mobile-essential' : ''}`}>
          {option.description}
        </p>
        {option.currentEffect && (
          <div className="ui-upgrade-card__current"><span>CURRENT</span>{option.currentEffect}</div>
        )}
        <div className="ui-upgrade-card__effect" data-testid={`upgrade-card-effect-${index}`}><span>UPGRADE EFFECT</span>{option.nextEffect}</div>
      </div>
      <span className="ui-upgrade-card__select" data-testid={`upgrade-card-select-${index}`}>SELECT PROTOCOL <UiIcon name="chevron" size={14} /></span>
    </button>
  );
}

export function LevelUpModal({ level, options, rerollsRemaining, onSelect, onReroll }: LevelUpModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const index = Number(event.key) - 1;
      const option = options[index];
      if (index >= 0 && index < 3 && option) onSelect(option);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelect, options]);

  return (
    <div
      className="ui-overlay ui-overlay--levelup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-up-title"
      aria-describedby="level-up-description"
      data-testid="levelup-modal"
    >
      <div className="ui-overlay__scanlines" aria-hidden="true" />
      <section className="ui-levelup">
        <header className="ui-levelup__header">
          <span className="ui-levelup__level">LEVEL <strong>{String(level).padStart(2, '0')}</strong></span>
          <div>
            <p className="ui-eyebrow">NEURAL LINK STABILIZED</p>
            <h2 id="level-up-title">전투 프로토콜 선택</h2>
            <p id="level-up-description">하나의 강화를 설치하고 전장으로 복귀합니다.</p>
          </div>
          <span className="ui-levelup__status"><i aria-hidden="true" /> TIME DILATION ACTIVE</span>
        </header>

        <div className="ui-levelup__cards">
          {options.slice(0, 3).map((option, index) => (
            <UpgradeCard key={option.id} option={option} index={index} onSelect={onSelect} />
          ))}
        </div>

        <footer className="ui-levelup__footer">
          <button
            className="ui-secondary-button ui-reroll-button"
            type="button"
            onClick={onReroll}
            disabled={rerollsRemaining <= 0}
            data-testid="levelup-reroll"
          >
            <UiIcon name="refresh" size={18} />
            후보 재탐색
            <span>{rerollsRemaining} / 3</span>
          </button>
          <p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 빠른 선택</p>
        </footer>
      </section>
    </div>
  );
}
