import { UiIcon } from './icons';
import type { PauseModalProps } from './types';

export function PauseModal({ onResume, onRestart, onMainMenu, onSettings }: PauseModalProps) {
  return (
    <div
      className="ui-overlay ui-overlay--pause"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      aria-describedby="pause-description"
    >
      <section className="ui-pause-panel">
        <header>
          <span className="ui-pause-panel__signal"><i aria-hidden="true" /> SIMULATION SUSPENDED</span>
          <h2 id="pause-title">PAUSED</h2>
          <p id="pause-description">전장 동기화가 일시 중단되었습니다.</p>
        </header>
        <nav className="ui-pause-panel__actions" aria-label="일시정지 메뉴">
          <button className="ui-primary-button" type="button" autoFocus onClick={onResume}>
            <UiIcon name="play" size={18} /><span>전투 복귀<small>RESUME OPERATION</small></span><kbd>ESC</kbd>
          </button>
          {onSettings && (
            <button className="ui-menu-button" type="button" onClick={onSettings}>
              <UiIcon name="settings" size={18} /><span>설정<small>GRAPHICS · AUDIO · CONTROLS</small></span><UiIcon name="chevron" size={15} />
            </button>
          )}
          <button className="ui-menu-button" type="button" onClick={onRestart}>
            <UiIcon name="restart" size={18} /><span>다시 시작<small>RESET CURRENT OPERATION</small></span><UiIcon name="chevron" size={15} />
          </button>
          <button className="ui-menu-button ui-menu-button--danger" type="button" onClick={onMainMenu}>
            <UiIcon name="home" size={18} /><span>작전 포기<small>RETURN TO MAIN MENU</small></span><UiIcon name="chevron" size={15} />
          </button>
        </nav>
        <footer><span>LOCAL INSTANCE</span><strong>STATE SECURED</strong></footer>
      </section>
    </div>
  );
}
