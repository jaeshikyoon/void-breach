import { GameHud } from './Hud';
import { LevelUpModal } from './LevelUpModal';
import { MobileControls, OrientationOverlay } from './MobileControls';
import { PauseModal } from './PauseModal';
import { ResultScreen } from './ResultScreen';
import { StageSelectScreen } from './StageSelectScreen';
import { StartScreen } from './StartScreen';
import type { GameUiProps, StageRecord } from './types';

const DEFAULT_STAGES: readonly StageRecord[] = Array.from({ length: 20 }, (_, index) => ({
  stage: index + 1,
  unlocked: index === 0,
  bestStars: 0,
}));

export function GameUi(props: GameUiProps) {
  const {
    screen,
    vitals,
    progress,
    skills,
    dodgeCooldownRemaining,
    dodgeCooldownTotal,
    boss,
    showBossWarning,
    upgradeOptions = [],
    rerollsRemaining = 0,
    result,
  } = props;
  const modalOpen = screen === 'paused' || screen === 'levelup';
  const activeStageNumber = props.currentStage ?? props.stageSelect?.selectedStage;
  const activeStageIntel = activeStageNumber === undefined
    ? undefined
    : props.stageSelect?.stages.find((record) => record.stage === activeStageNumber);

  if (screen === 'start') {
    return (
      <>
        <StartScreen
          {...props.startScreen}
          onStart={props.onStart}
          {...(props.onOpenStageSelect ? { onStageSelect: props.onOpenStageSelect } : {})}
          {...(props.onSettings ? { onSettings: props.onSettings } : {})}
        />
        <OrientationOverlay />
      </>
    );
  }

  if (screen === 'stageSelect') {
    return (
      <>
        <StageSelectScreen
          stages={props.stageSelect?.stages ?? DEFAULT_STAGES}
          {...(props.stageSelect?.selectedStage !== undefined
            ? { selectedStage: props.stageSelect.selectedStage }
            : props.currentStage !== undefined
              ? { selectedStage: props.currentStage }
              : {})}
          {...(props.stageSelect?.totalStars !== undefined
            ? { totalStars: props.stageSelect.totalStars }
            : {})}
          {...(props.stageSelect?.maxStars !== undefined
            ? { maxStars: props.stageSelect.maxStars }
            : {})}
          {...(props.onStagePreviewed ? { onPreviewStage: props.onStagePreviewed } : {})}
          {...(props.onStageDeploy
            ? { onDeploy: props.onStageDeploy }
            : props.onStageSelected
              ? { onDeploy: props.onStageSelected }
              : {})}
          onBack={props.onStageSelectBack ?? props.onMainMenu}
        />
        <OrientationOverlay />
      </>
    );
  }

  if ((screen === 'victory' || screen === 'defeat') && result) {
    return (
      <>
        <ResultScreen
          result={result}
          onRestart={props.onRestart}
          onMainMenu={props.onMainMenu}
          {...(props.onNextStage ? { onNextStage: props.onNextStage } : {})}
          {...(props.onOpenStageSelect ? { onStageSelect: props.onOpenStageSelect } : {})}
        />
        <OrientationOverlay />
      </>
    );
  }

  return (
    <div className="ui-game-layer">
      <div
        className="ui-game-layer__hud"
        {...(modalOpen ? { inert: true, 'aria-hidden': true } : {})}
      >
        <GameHud
          vitals={vitals}
          progress={progress}
          skills={skills}
          dodgeCooldownRemaining={dodgeCooldownRemaining}
          dodgeCooldownTotal={dodgeCooldownTotal}
          {...(boss !== undefined ? { boss } : {})}
          {...(showBossWarning !== undefined ? { showBossWarning } : {})}
          {...(props.currentStage !== undefined ? { currentStage: props.currentStage } : {})}
          {...(activeStageIntel?.frontName ? { currentFrontName: activeStageIntel.frontName } : {})}
          {...(activeStageIntel?.bossName ? { currentBossName: activeStageIntel.bossName } : {})}
          {...(activeStageIntel?.threatRoster
            ? { currentThreatRoster: activeStageIntel.threatRoster }
            : {})}
          {...(props.bossWarningName
            ? { bossWarningName: props.bossWarningName }
            : activeStageIntel?.bossName
              ? { bossWarningName: activeStageIntel.bossName }
              : {})}
          onPause={props.onPause}
        />
      </div>
      {screen === 'playing' && (
        <MobileControls
          skills={skills}
          dodgeCooldownRemaining={dodgeCooldownRemaining}
          dodgeCooldownTotal={dodgeCooldownTotal}
          onMove={props.onMove}
          onMoveEnd={props.onMoveEnd}
          onAttackChange={props.onAttackChange}
          onDodge={props.onDodge}
          onSkill={props.onSkill}
        />
      )}
      {screen === 'levelup' && (
        <LevelUpModal
          level={progress.level}
          options={upgradeOptions}
          rerollsRemaining={rerollsRemaining}
          onSelect={props.onUpgradeSelect}
          onReroll={props.onReroll}
        />
      )}
      {screen === 'paused' && (
        <PauseModal
          onResume={props.onResume}
          onRestart={props.onRestart}
          onMainMenu={props.onMainMenu}
          {...(props.onSettings ? { onSettings: props.onSettings } : {})}
        />
      )}
      <OrientationOverlay />
    </div>
  );
}
