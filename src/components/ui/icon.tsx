/** Small stroke icons drawn for this interface. Decorative unless a label is supplied. */
export type IconName =
  | 'home' | 'plus' | 'list' | 'draft' | 'gauge' | 'team' | 'search' | 'crew' | 'check' | 'settings'
  | 'building' | 'support' | 'sliders' | 'shield' | 'chart' | 'pin' | 'calendar' | 'alert' | 'user' | 'chevron' | 'back' | 'refresh' | 'flag' | 'file' | 'clock' | 'help' | 'close';

const paths: Record<IconName, string> = {
  home: 'M3 11l9-8 9 8M5 10v11h5v-7h4v7h5V10',
  plus: 'M12 5v14M5 12h14',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  draft: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h4',
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-6M8 18h8',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c1.8.8 3 2.6 3 4.7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  crew: 'M4 15a8 8 0 0 1 16 0M2.5 15h19M10 7V4.5h4V7M6 19h12',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  settings: 'M9.5 3h5l.5 2.5 2 1.2 2.4-.8 2.5 4.2-1.9 1.7v2.4l1.9 1.7-2.5 4.2-2.4-.8-2 1.2-.5 2.5h-5L9 19.5l-2-1.2-2.4.8-2.5-4.2L4 13.2v-2.4L2.1 9.1l2.5-4.2 2.4.8 2-1.2zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5',
  building: 'M4 21V3h11v18M15 9h5v12M2 21h20M8 7h3M8 11h3M8 15h3M8 21v-3h3v3',
  support: 'M4 13v-2a8 8 0 0 1 16 0v2M4 12H2v6h4v-6zM20 12h2v6h-4v-6zM20 18v2l-8 1',
  shield: 'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6zM8 12l3 3 5-6',
  chart: 'M4 3v17h17M8 16v-4M13 16V8M18 16V5',
  pin: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  alert: 'M12 3 2 20h20zM12 10v4M12 17.5h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 4.4 1.6c-1.1.7-1.9 1.2-1.9 2.4M12 16.5h.01',
  close: 'M6 6l12 12M18 6 6 18',
};

export function Icon({ name, size = 18, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
