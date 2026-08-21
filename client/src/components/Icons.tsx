/** Inline SVGs rather than an icon package: nothing here needs 900 glyphs, and the app
 *  has to work offline (§2). All icons share a 24px grid and inherit currentColor. */

type Props = { className?: string };

const base = 'h-[1.15rem] w-[1.15rem]';

function Svg({ children, className }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? base}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: Props) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.8V20h14V9.8" />
  </Svg>
);

export const IconCompass = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.2 8.8-2 4.4-4.4 2 2-4.4z" />
  </Svg>
);

export const IconCalendar = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const IconTag = (p: Props) => (
  <Svg {...p}>
    <path d="M3 12.5V4h8.5L21 13.5 13.5 21z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </Svg>
);

export const IconMessage = (p: Props) => (
  <Svg {...p}>
    <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
  </Svg>
);

export const IconBook = (p: Props) => (
  <Svg {...p}>
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z" />
    <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" />
  </Svg>
);

export const IconUsers = (p: Props) => (
  <Svg {...p}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7" r="3.2" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.85" />
    <path d="M16 4.15a4 4 0 0 1 0 7.7" />
  </Svg>
);

export const IconBell = (p: Props) => (
  <Svg {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </Svg>
);

export const IconSearch = (p: Props) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.9-4.9" />
  </Svg>
);

export const IconHash = (p: Props) => (
  <Svg {...p}>
    <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />
  </Svg>
);

export const IconMegaphone = (p: Props) => (
  <Svg {...p}>
    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M15.5 8.5a4 4 0 0 1 0 7M18.5 6a7.5 7.5 0 0 1 0 12" />
  </Svg>
);

export const IconIncognito = (p: Props) => (
  <Svg {...p}>
    <path d="M4 12h16" />
    <path d="M6.5 12 8 6.5h8L17.5 12" />
    <circle cx="7.5" cy="16" r="2.6" />
    <circle cx="16.5" cy="16" r="2.6" />
    <path d="M10.1 15.6a3 3 0 0 1 3.8 0" />
  </Svg>
);

export const IconFolder = (p: Props) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);

export const IconHelp = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
    <path d="M12 17h.01" />
  </Svg>
);

export const IconSpeaker = (p: Props) => (
  <Svg {...p}>
    <path d="M4 9.5v5a1 1 0 0 0 1 1h2.6l4 3.2V5.3l-4 3.2H5a1 1 0 0 0-1 1z" />
    <path d="M16 9.8a3.5 3.5 0 0 1 0 4.4" />
  </Svg>
);

export const IconWave = (p: Props) => (
  <Svg {...p}>
    <path d="M11 3.5a1.3 1.3 0 0 1 2.6 0v5.2" />
    <path d="M13.6 8V2.9a1.3 1.3 0 1 1 2.6 0V9" />
    <path d="M16.2 9.2V5.5a1.3 1.3 0 1 1 2.6 0v7.9a7 7 0 0 1-7 7 6 6 0 0 1-4.7-2.2L4 14.4a1.4 1.4 0 0 1 2-2l2.4 2.2V6.6a1.3 1.3 0 1 1 2.6 0" />
  </Svg>
);

export const IconSun = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: Props) => (
  <Svg {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z" />
  </Svg>
);

export const IconPlus = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconImage = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m3 15 6-6 5 5 7-7" />
  </Svg>
);

export const IconClose = (p: Props) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const IconSend = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 12 20 4.5 15.5 20l-4-6.5z" />
    <path d="m11.5 13.5 8.5-9" />
  </Svg>
);

export const IconReply = (p: Props) => (
  <Svg {...p}>
    <path d="M9 7 4 12l5 5" />
    <path d="M4 12h9a6 6 0 0 1 6 6v1" />
  </Svg>
);

export const IconThread = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6h16M4 11h10" />
    <path d="M8 16h9a3 3 0 0 0 3-3v-2" />
    <path d="m10 14-2 2 2 2" />
  </Svg>
);

export const IconPin = (p: Props) => (
  <Svg {...p}>
    <path d="m14.5 3.5 6 6-3 1-4 4-.5 4-6-6 4-4z" />
    <path d="m7 17-4 4" />
  </Svg>
);

export const IconChevron = (p: Props) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const IconSparkle = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="m6.3 6.3 2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5" />
  </Svg>
);

export const IconCheck = (p: Props) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const IconMapPin = (p: Props) => (
  <Svg {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);

// ── Voice, administration and space management ─────────────────────────────

export const IconMic = (p: Props) => (
  <Svg {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3.5" />
  </Svg>
);

export const IconMicOff = (p: Props) => (
  <Svg {...p}>
    <path d="M9 5.5a3 3 0 0 1 6 0v5" />
    <path d="M15 13.4A3 3 0 0 1 9 12V9" />
    <path d="M5 11a7 7 0 0 0 11.3 5.5" />
    <path d="M19 11v.6" />
    <path d="M12 18v3.5" />
    <path d="m3.5 3.5 17 17" />
  </Svg>
);

export const IconHeadphones = (p: Props) => (
  <Svg {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="2.5" y="13.5" width="4.5" height="7" rx="2" />
    <rect x="17" y="13.5" width="4.5" height="7" rx="2" />
  </Svg>
);

export const IconPhoneOff = (p: Props) => (
  <Svg {...p}>
    <path d="M10.7 5.3a13.5 13.5 0 0 0-6.1 2.4c-1.3 1-1.5 2-.9 2.9l1.1 1.6c.5.8 1.4 1 2.3.6l2-.9" />
    <path d="M14.9 12.6c.4.8 1.3 1.1 2.2.8l2.2-.7c1-.3 1.6-1.1 1.2-2.3a6.3 6.3 0 0 0-1.3-2.2" />
    <path d="m3.5 3.5 17 17" />
  </Svg>
);

export const IconShield = (p: Props) => (
  <Svg {...p}>
    <path d="M12 2.8 20 6v6c0 4.6-3.3 8-8 9.2C8 20 4.7 16.6 4.7 12V6z" />
  </Svg>
);

export const IconGauge = (p: Props) => (
  <Svg {...p}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="m12 14 4-4" />
  </Svg>
);

export const IconList = (p: Props) => (
  <Svg {...p}>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
    <path d="M3.8 6.5h.01M3.8 12h.01M3.8 17.5h.01" />
  </Svg>
);

export const IconSettings = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </Svg>
);

export const IconBuilding = (p: Props) => (
  <Svg {...p}>
    <path d="M4 21V5.5L12 3v18" />
    <path d="M12 9h8v12" />
    <path d="M7.5 8h1M7.5 12h1M7.5 16h1M15.5 13h1M15.5 17h1" />
  </Svg>
);

export const IconTrash = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 20a1.3 1.3 0 0 0 1.3 1.2h6.6a1.3 1.3 0 0 0 1.3-1.2l.9-13.5" />
  </Svg>
);

export const IconEdit = (p: Props) => (
  <Svg {...p}>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="m14.5 6.5 3 3" />
  </Svg>
);

export const IconKey = (p: Props) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 8-8" />
    <path d="m16.5 6.5 2 2" />
    <path d="m14 9 2 2" />
  </Svg>
);

export const IconMenu = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconLogout = (p: Props) => (
  <Svg {...p}>
    <path d="M9.5 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3.5" />
    <path d="M15 8.5 19 12l-4 3.5" />
    <path d="M19 12H9.5" />
  </Svg>
);

export const IconSpinner = (p: Props) => (
  <Svg {...p} className={p.className ?? `${base} animate-spin`}>
    <circle cx="12" cy="12" r="9" fill="none" strokeDasharray="56" strokeDashoffset="0" />
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      strokeDasharray="14"
      strokeDashoffset="0"
      opacity="0.4"
    />{' '}
  </Svg>
);
