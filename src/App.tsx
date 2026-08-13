import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas, type GameCanvasHandle } from './game/GameCanvas';
import {
  GameStorage,
  normalizeStageBestDurationSeconds,
  type GameProfile,
} from './game/services';
import type { GameRuntime, RuntimeResult, RuntimeSnapshot } from './game/runtime';
import { GameUi, type GameUiScreen, type RunResult, type UpgradeOption } from './ui';
import { mapRunResult, mapSkillHud, mapStageIntel, mapUpgradeCard } from './game/uiMappers';
import {
  MAX_STAGE,
  TOTAL_AVAILABLE_STAGE_STARS,
  clampStage,
  isStageUnlocked,
  normalizeStageStars,
  totalEarnedStars,
  type StageStarRating,
} from './game/stages';

const storage = new GameStorage();

const initialSnapshot: RuntimeSnapshot = {
  status: 'loading',
  stage: 1,
  vitals: { health: 100, maxHealth: 100, shield: 0, maxShield: 0 },
  progress: {
    deployed: 0,
    totalDeployments: 200,
    alive: 0,
    kills: 0,
    level: 1,
    xp: 0,
    xpToNext: 6,
    elitesAlive: 0,
  },
  skills: [],
  dashCooldownRemaining: 0,
  dashCooldownTotal: 3.5,
  boss: null,
  showBossWarning: false,
  elapsedSeconds: 0,
  build: { activeSkills: {}, passiveLevels: {} },
  upgradeOptions: [],
  rerollsRemaining: 3,
  fps: 60,
};

export function App() {
  const canvasRef = useRef<GameCanvasHandle>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const returningToMenuRef = useRef(false);
  const latestSnapshotRef = useRef<RuntimeSnapshot>(initialSnapshot);
  const profileRef = useRef<GameProfile | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [screen, setScreen] = useState<GameUiScreen>('start');
  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [result, setResult] = useState<RunResult>();
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const [selectedStage, setSelectedStage] = useState(1);
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(orientation: portrait)').matches
      : false,
  );

  useEffect(() => {
    let active = true;
    void storage
      .loadProfile()
      .then((loadedProfile) => {
        if (active) setProfile(loadedProfile);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setProfileLoaded(true);
      });
    return () => {
      active = false;
      storage.close();
    };
  }, []);

  useEffect(() => {
    if (!profileLoaded || !profile) return;
    const unlocked = Array.from({ length: MAX_STAGE }, (_, index) => index + 1)
      .filter((stage) => isStageUnlocked(stage, profile.stageStars));
    const latestUnlocked = unlocked.at(-1) ?? 1;
    setSelectedStage((current) => current === 1 ? latestUnlocked : current);
  }, [profileLoaded]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const orientation = window.matchMedia('(orientation: portrait)');
    const syncOrientation = () => setIsPortrait(orientation.matches);
    syncOrientation();
    orientation.addEventListener('change', syncOrientation);
    return () => orientation.removeEventListener('change', syncOrientation);
  }, []);

  useEffect(() => {
    const releaseVirtualInput = () => {
      runtimeRef.current?.setVirtualMovement({ x: 0, y: 0 });
      runtimeRef.current?.setVirtualAttack(false);
    };
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      releaseVirtualInput();
      if (latestSnapshotRef.current.status === 'playing') {
        runtimeRef.current?.pause();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || (!document.hidden && !isPortrait)) return;
    runtime.setVirtualMovement({ x: 0, y: 0 });
    runtime.setVirtualAttack(false);
    if (snapshot.status === 'playing') runtime.pause();
  }, [isPortrait, snapshot.status]);

  useEffect(() => {
    if (screen === 'playing') return;
    runtimeRef.current?.setVirtualMovement({ x: 0, y: 0 });
    runtimeRef.current?.setVirtualAttack(false);
  }, [screen]);

  const handleSnapshot = useCallback((next: RuntimeSnapshot) => {
    latestSnapshotRef.current = next;
    setSnapshot(next);
    if (next.status === 'levelUp') setScreen('levelup');
    else if (next.status === 'paused' && !returningToMenuRef.current) setScreen('paused');
    else if (next.status === 'playing' || next.status === 'bossWarning') setScreen('playing');
  }, []);

  const finishRun = useCallback((runtimeResult: RuntimeResult) => {
    const current = runtimeRef.current?.getSnapshot() ?? latestSnapshotRef.current;
    const optimisticStars = normalizeStageStars(profileRef.current?.stageStars);
    const optimisticDurations = normalizeStageBestDurationSeconds(
      profileRef.current?.stageBestDurationSeconds,
    );
    const previousBest = optimisticStars[runtimeResult.stage - 1] ?? 0;
    const previousBestDuration = optimisticDurations[runtimeResult.stage - 1] ?? null;
    const validClearDuration =
      runtimeResult.victory &&
      Number.isFinite(runtimeResult.durationSeconds) &&
      runtimeResult.durationSeconds > 0
        ? Math.round(runtimeResult.durationSeconds * 1_000) / 1_000
        : null;
    const optimisticBestDuration = validClearDuration === null
      ? previousBestDuration
      : previousBestDuration === null
        ? validClearDuration
        : Math.min(previousBestDuration, validClearDuration);
    optimisticStars[runtimeResult.stage - 1] = Math.max(
      previousBest,
      runtimeResult.stars,
    ) as StageStarRating;
    optimisticDurations[runtimeResult.stage - 1] = optimisticBestDuration;
    if (profileRef.current) {
      const optimisticProfile = {
        ...profileRef.current,
        stageStars: optimisticStars,
        stageBestDurationSeconds: optimisticDurations,
      };
      profileRef.current = optimisticProfile;
      setProfile(optimisticProfile);
    }
    setResult({
      ...mapRunResult(runtimeResult, current.build),
      stageBestStars: Math.max(previousBest, runtimeResult.stars) as StageStarRating,
      ...(optimisticBestDuration !== null
        ? { stageBestDurationSeconds: optimisticBestDuration }
        : {}),
      isNewStageBest:
        runtimeResult.stars > previousBest ||
        (validClearDuration !== null &&
          (previousBestDuration === null || validClearDuration < previousBestDuration)),
    });
    setScreen(runtimeResult.victory ? 'victory' : 'defeat');
    if (runtimeResult.victory && runtimeResult.stage < MAX_STAGE) {
      setSelectedStage(runtimeResult.stage + 1);
    }
    void (async () => {
      await storage.recordRun({
        kills: runtimeResult.kills,
        level: runtimeResult.finalLevel,
        bossDefeated: runtimeResult.bossDefeated,
        clearTimeMs: runtimeResult.durationSeconds * 1_000,
        skills: runtimeResult.equippedSkills,
      });
      const updated = await storage.recordStageResult({
        stage: runtimeResult.stage,
        victory: runtimeResult.victory,
        hpRatio: runtimeResult.healthRatio,
        clearDurationSeconds: runtimeResult.durationSeconds,
      });
      profileRef.current = updated;
      setProfile(updated);
      setResult((existing) => existing ? {
        ...existing,
        stageBestStars: updated.stageStars[runtimeResult.stage - 1] as StageStarRating,
        ...((updated.stageBestDurationSeconds[runtimeResult.stage - 1] ?? null) !== null
          ? { stageBestDurationSeconds: updated.stageBestDurationSeconds[runtimeResult.stage - 1] as number }
          : {}),
      } : existing);
    })().catch(() => undefined);
  }, []);

  const handleRuntime = useCallback((runtime: GameRuntime) => {
    runtimeRef.current = runtime;
    const savedAudio = profile?.audio;
    if (savedAudio) runtime.setAudioSettings(savedAudio);
    setReady(true);
  }, [profile]);

  const launchStage = useCallback((requestedStage: number) => {
    const stage = clampStage(requestedStage);
    const runtime = runtimeRef.current ?? canvasRef.current?.getRuntime();
    if (!runtime) return;
    returningToMenuRef.current = false;
    void runtime.unlockAudio();
    runtime.startStage(stage);
    setSelectedStage(stage);
    setResult(undefined);
    setScreen('playing');
  }, []);

  const startStage = useCallback((requestedStage: number) => {
    const stage = clampStage(requestedStage);
    if (!isStageUnlocked(stage, profile?.stageStars)) return;
    launchStage(stage);
  }, [launchStage, profile?.stageStars]);

  const start = useCallback(() => startStage(selectedStage), [selectedStage, startStage]);

  const restart = useCallback(() => {
    returningToMenuRef.current = false;
    runtimeRef.current?.restart();
    setResult(undefined);
    setScreen('playing');
  }, []);

  const mainMenu = useCallback(() => {
    returningToMenuRef.current = true;
    runtimeRef.current?.pause();
    setScreen('start');
  }, []);

  const nextStage = useCallback(() => {
    if (!result?.victory || (result.stageNumber ?? selectedStage) >= MAX_STAGE) return;
    // The clear that produced this result is sufficient to unlock the next stage,
    // even if the IndexedDB write is still finishing when the player clicks.
    launchStage((result.stageNumber ?? selectedStage) + 1);
  }, [launchStage, result, selectedStage]);

  const replayStage = useCallback(() => {
    const stage = result?.stageNumber;
    if (stage !== undefined) {
      launchStage(stage);
      return;
    }
    runtimeRef.current?.restart();
    setResult(undefined);
    setScreen('playing');
  }, [launchStage, result?.stageNumber]);

  const selectUpgrade = useCallback((option: UpgradeOption) => {
    runtimeRef.current?.selectUpgrade(option.id);
  }, []);

  const activeSkills = snapshot.skills.map(mapSkillHud);
  const upgradeOptions = snapshot.upgradeOptions.map(mapUpgradeCard);
  const stageStars = normalizeStageStars(profile?.stageStars);
  const stageRecords = Array.from({ length: MAX_STAGE }, (_, index) => {
    const stage = index + 1;
    return {
      stage,
      unlocked: isStageUnlocked(stage, stageStars),
      bestStars: (stageStars[index] ?? 0) as StageStarRating,
      ...((profile?.stageBestDurationSeconds[index] ?? null) !== null
        ? { bestDurationSeconds: profile?.stageBestDurationSeconds[index] as number }
        : {}),
      ...mapStageIntel(stage),
    };
  });
  const unlockedStages = stageRecords.filter((record) => record.unlocked).length;
  const totalStars = totalEarnedStars(stageStars);

  return (
    <div className="game-app">
      {profileLoaded && (
        <GameCanvas
          ref={canvasRef}
          className="game-canvas-host"
          autoStart={false}
          quality={profile?.graphics.quality ?? 'auto'}
          onRuntime={handleRuntime}
          onRuntimeDisposed={() => { runtimeRef.current = null; }}
          onSnapshot={handleSnapshot}
          onVictory={finishRun}
          onDefeat={finishRun}
          onError={(runtimeError) => setError(runtimeError.message)}
        />
      )}

      {(!profileLoaded || !ready) && !error && <div className="game-loading">전투 시스템 초기화 중</div>}
      {error && <div className="game-error">게임을 시작하지 못했습니다.<br />{error}</div>}

      <GameUi
        screen={screen}
        vitals={snapshot.vitals}
        progress={snapshot.progress}
        skills={activeSkills}
        dodgeCooldownRemaining={snapshot.dashCooldownRemaining}
        dodgeCooldownTotal={snapshot.dashCooldownTotal}
        boss={snapshot.boss}
        showBossWarning={snapshot.showBossWarning}
        upgradeOptions={upgradeOptions}
        rerollsRemaining={snapshot.rerollsRemaining}
        {...(result ? { result } : {})}
        currentStage={snapshot.stage || selectedStage}
        stageSelect={{
          stages: stageRecords,
          selectedStage,
          totalStars,
          maxStars: TOTAL_AVAILABLE_STAGE_STARS,
        }}
        startScreen={{
          title: 'VOID//BREACH',
          subtitle: 'DEPLOY. ADAPT. EXTERMINATE.',
          bestKills: profile?.bestKills ?? 0,
          bestLevel: profile?.bestLevel ?? 1,
          bestDurationSeconds: profile?.fastestClearMs ? profile.fastestClearMs / 1_000 : 0,
          stageProgress: {
            currentStage: selectedStage,
            unlockedStages,
            totalStars,
            totalStages: MAX_STAGE,
            maxStars: TOTAL_AVAILABLE_STAGE_STARS,
            stageStars,
            stageBestDurationSeconds: profile?.stageBestDurationSeconds ?? [],
          },
          onStageChange: (stage) => {
            const nextStage = clampStage(stage);
            if (isStageUnlocked(nextStage, stageStars)) setSelectedStage(nextStage);
          },
        }}
        onStart={start}
        onStageDeploy={startStage}
        onStageSelectBack={mainMenu}
        onNextStage={nextStage}
        onPause={() => runtimeRef.current?.pause()}
        onResume={() => runtimeRef.current?.resume()}
        onRestart={screen === 'victory' || screen === 'defeat' ? replayStage : restart}
        onMainMenu={mainMenu}
        onUpgradeSelect={selectUpgrade}
        onReroll={() => runtimeRef.current?.rerollUpgrade()}
        onMove={(vector) => runtimeRef.current?.setVirtualMovement(vector)}
        onMoveEnd={() => runtimeRef.current?.setVirtualMovement({ x: 0, y: 0 })}
        onAttackChange={(pressed) => runtimeRef.current?.setVirtualAttack(pressed)}
        onDodge={() => runtimeRef.current?.triggerDash()}
        onSkill={(skillId) => runtimeRef.current?.triggerSkill(skillId)}
      />
    </div>
  );
}
