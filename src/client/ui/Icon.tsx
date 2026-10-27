/**
 * Single SVG icon set: 24px grid, 1.75 stroke, round caps. Every icon renders
 * at one of three sizes so icons line up across the app.
 */
export type IconName =
  | 'home'
  | 'search'
  | 'trophy'
  | 'inbox'
  | 'bell'
  | 'heart'
  | 'user'
  | 'login'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'close'
  | 'help'
  | 'send'
  | 'translate'
  | 'sparkles'
  | 'flag'
  | 'edit'
  | 'trash'
  | 'folder'
  | 'eye'
  | 'check';

export const ICON_SIZES = { sm: 16, md: 20, lg: 24 } as const;
export type IconSize = keyof typeof ICON_SIZES;

const PATHS: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9v11h5v-6h4v6h5V9'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-4-4'],
  trophy: [
    'M8 4h8v5a4 4 0 0 1-8 0V4Z',
    'M8 6H5v1a3 3 0 0 0 3 3',
    'M16 6h3v1a3 3 0 0 1-3 3',
    'M12 13v4',
    'M8 20h8',
    'M10 17h4v3h-4z',
  ],
  inbox: ['M4 5h16v14H4z', 'm4 7 8 6 8-6'],
  bell: ['M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z', 'M10 20a2 2 0 0 0 4 0'],
  heart: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5'],
  login: ['M14 4h5v16h-5', 'M10 8l4 4-4 4', 'M3 12h11'],
  chart: ['M4 20V4', 'M4 20h16', 'M8 16v-4', 'M12 16V8', 'M16 16v-6'],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  help: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6',
    'M12 17h.01',
  ],
  send: ['M4 12 20 4l-6 16-3-7-7-1Z', 'M11 13l9-9'],
  translate: [
    'M4 6h9',
    'M8.5 4v2',
    'M6 6c.5 3 2.5 5.5 5 6.5',
    'M11 6c-.5 3-2.5 5.5-5.5 7',
    'M13 20l3.5-8 3.5 8',
    'M14 17.5h5',
  ],
  sparkles: [
    'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z',
    'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z',
  ],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4Z', 'm13.5 6.5 4 4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  folder: ['M3 6h6l2 2h10v11H3V6Z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  check: ['m5 12 5 5 9-10'],
};

export function Icon({
  name,
  size = 'md',
  filled = false,
  className = '',
}: {
  name: IconName;
  size?: IconSize;
  /** Fills closed shapes (e.g. a favourited heart). */
  filled?: boolean;
  className?: string;
}) {
  const px = ICON_SIZES[size];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
