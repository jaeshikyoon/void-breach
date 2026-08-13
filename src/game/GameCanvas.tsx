import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from 'react';
import { GameRuntime, type GameRuntimeOptions } from './runtime';

export interface GameCanvasProps extends Omit<GameRuntimeOptions, 'host'> {
  className?: string;
  style?: CSSProperties;
  onRuntime?: (runtime: GameRuntime) => void;
  onRuntimeDisposed?: () => void;
}

export interface GameCanvasHandle {
  getRuntime(): GameRuntime | null;
}

/**
 * Thin React owner for the imperative Pixi runtime. Keep HUD/modal state in React and
 * pass mobile-control events to the exposed GameRuntime instance.
 */
export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
  props,
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const initialProps = useRef(props);

  useImperativeHandle(
    forwardedRef,
    () => ({ getRuntime: () => runtimeRef.current }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    const {
      className: _className,
      style: _style,
      onRuntime,
      onRuntimeDisposed: _onRuntimeDisposed,
      ...runtimeOptions
    } = initialProps.current;

    const runtime = new GameRuntime({ ...runtimeOptions, host });
    runtimeRef.current = runtime;
    void runtime
      .init()
      .then(() => {
        if (!active) {
          void runtime.destroy();
          return;
        }
        onRuntime?.(runtime);
      })
      .catch(() => {
        // GameRuntime forwards initialization failures through onError.
      });

    return () => {
      active = false;
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      void runtime.destroy();
      initialProps.current.onRuntimeDisposed?.();
    };
  }, []);

  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    ...props.style,
  };
  return <div ref={hostRef} className={props.className} style={style} />;
});

GameCanvas.displayName = 'GameCanvas';
