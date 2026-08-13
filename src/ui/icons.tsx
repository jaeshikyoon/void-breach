import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'play'
  | 'pause'
  | 'settings'
  | 'shield'
  | 'heart'
  | 'skull'
  | 'crosshair'
  | 'bolt'
  | 'dash'
  | 'refresh'
  | 'home'
  | 'restart'
  | 'volume'
  | 'chevron'
  | 'weapon'
  | 'survival'
  | 'active'
  | 'lock'
  | 'star'
  | 'map'
  | 'check';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const paths: Record<IconName, ReactNode> = {
  play: <path d="m9 6 10 6-10 6V6Z" />,
  pause: <path d="M8 6h3v12H8V6Zm5 0h3v12h-3V6Z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-2v-.09a1.7 1.7 0 0 0-1.08-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.42-1.42.06-.06A1.7 1.7 0 0 0 9.36 15a1.7 1.7 0 0 0-1.56-1.04H7.7v-2h.1a1.7 1.7 0 0 0 1.56-1.08A1.7 1.7 0 0 0 9 9l-.06-.06 1.42-1.42.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56V6.3h2v.1a1.7 1.7 0 0 0 1.08 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.42 1.42-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04H21v2h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </>
  ),
  shield: <path d="M12 3 5 6v5c0 4.7 3 8.2 7 10 4-1.8 7-5.3 7-10V6l-7-3Zm0 3.1 4 1.7v3.1c0 3-1.6 5.5-4 7-2.4-1.5-4-4-4-7V7.8l4-1.7Z" />,
  heart: <path d="M12 20.3 4.7 13A5 5 0 0 1 12 6.2 5 5 0 0 1 19.3 13L12 20.3Z" />,
  skull: <path d="M12 3a7 7 0 0 0-7 7c0 2.3 1 4 2.5 5v3h3v2h3v-2h3v-3A6.6 6.6 0 0 0 19 10a7 7 0 0 0-7-7Zm-2.5 9.5A1.5 1.5 0 1 1 9.5 9a1.5 1.5 0 0 1 0 3.5Zm5 0a1.5 1.5 0 1 1 0-3.5 1.5 1.5 0 0 1 0 3.5Z" />,
  crosshair: <><circle cx="12" cy="12" r="6" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></>,
  bolt: <path d="m13.2 2-8 11h6l-.5 9 8.1-12h-6l.4-8Z" />,
  dash: <path d="M4 13h10.2l-3.1 3.1 1.8 1.8L19 12l-6.1-5.9-1.8 1.8 3.1 3.1H4v2Zm-2-5h5V6H2v2Zm1 10h5v-2H3v2Z" />,
  refresh: <path d="M18.7 7A8 8 0 1 0 20 14h-3a5 5 0 1 1-.6-4.8L13 12h8V4l-2.3 3Z" />,
  home: <path d="m3 11 9-8 9 8-2 2-1-1v8h-5v-5h-2v5H6v-8l-1 1-2-2Z" />,
  restart: <path d="M12 5a7 7 0 1 1-6.7 9H8a4.5 4.5 0 1 0 1.1-4.6L12 12H4V4l2.9 2.9A7 7 0 0 1 12 5Z" />,
  volume: <path d="M4 10v4h4l5 4V6l-5 4H4Zm11.5-.8a4 4 0 0 1 0 5.6l1.5 1.5a6 6 0 0 0 0-8.6l-1.5 1.5Z" />,
  chevron: <path d="m9 5 7 7-7 7-2-2 5-5-5-5 2-2Z" />,
  weapon: <path d="m4 17 9.8-9.8 3 3L7 20H4v-3Zm11-12 1.5-1.5 4 4L19 9l-4-4Z" />,
  survival: <path d="M12 2 4 5v6c0 5.2 3.4 9.1 8 11 4.6-1.9 8-5.8 8-11V5l-8-3Zm-1 14-4-4 2-2 2 2 4-4 2 2-6 6Z" />,
  active: <path d="M14 2 5 14h6l-1 8 9-12h-6l1-8Z" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
  star: <path d="m12 2.7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.3l6.2-.9L12 2.7Z" />,
  map: <path d="m3 5 5-2 8 3 5-2v15l-5 2-8-3-5 2V5Zm5 0v11m8-8v11" />,
  check: <path d="m4 12 5 5L20 6l-2-2-9 9-3-3-2 2Z" />,
};

export function UiIcon({ name, size = 24, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
