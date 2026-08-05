// Minimal outline-style SVG icons in the CRM's gold accent color, replacing
// raw emoji glyphs (rendered inconsistently by the OS font, clashing with
// the gold/black theme) in the OF Inbox Beta's icon rail and notifications.
const stroke = "#C9A86A";

function Icon({ children, size = 22 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const HomeIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" /></Icon>
);

export const BellIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Icon>
);

export const ChatIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></Icon>
);

export const FolderIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></Icon>
);

export const ImageIcon = (p: { size?: number }) => (
  <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Icon>
);

export const CalendarIcon = (p: { size?: number }) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Icon>
);

export const ChartIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M3 3v18h18" /><path d="M7 16v-4M12 16V8M17 16v-7" /></Icon>
);

export const ReceiptIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z" /><path d="M9 8h6M9 12h6" /></Icon>
);

export const NewBadgeIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 2l2.4 5.5L20 8.3l-4 4 1 5.7-5-2.9-5 2.9 1-5.7-4-4 5.6-.8L12 2Z" /></Icon>
);

export const PriceTagIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 2 2 12l10 10 10-10L12 2Z" /><circle cx="12" cy="9" r="1.5" /></Icon>
);

export const TipIcon = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2-3 2-3 .8-3 2.3 1.3 2.7 3 2.7 3-1 3-2.4" /></Icon>
);

export const CartIcon = (p: { size?: number }) => (
  <Icon {...p}><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 3h2l2.6 12.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6" /></Icon>
);

export const SearchIcon = (p: { size?: number }) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
);

export const StarIcon = (p: { size?: number; filled?: boolean }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill={p.filled ? stroke : "none"} stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 2 2.9 6.3 6.9.8-5.1 4.8 1.4 6.9L12 17.4 5.9 20.8l1.4-6.9-5.1-4.8 6.9-.8L12 2Z" />
  </svg>
);

export const PinIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 17v5" /><path d="M9 3h6l1 6 3 3v2H5v-2l3-3 1-6Z" /></Icon>
);

export const CheckIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ListIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></Icon>
);

export const MuteIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m22 9-6 6M16 9l6 6" /></Icon>
);

export const ScriptIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M8 3h8l4 4v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M16 3v4h4M9 12h6M9 16h6M9 8h2" /></Icon>
);

export const ArrowLeftIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Icon>
);

export const BookmarkIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1Z" /></Icon>
);

export const HeartIcon = (p: { size?: number; filled?: boolean }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill={p.filled ? stroke : "none"} stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7.5-4.7-10-9.3C.4 8.4 2 4.5 5.6 4c2-.3 3.8.6 4.9 2.2C11.6 4.6 13.4 3.7 15.4 4c3.6.5 5.2 4.4 3.6 7.7C16.5 16.3 12 21 12 21Z" />
  </svg>
);

export const CloseIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>
);

export const DoubleCheckIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 14} viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12l5 5L18 6" /><path d="M9 17l3 3L26 6" />
  </svg>
);

// Added for the 2026 sidebar/topbar reskin - replaces the emoji nav icons
// (🏠📊🔮📡🎬⏱️💰⚙️📨📅🧾🔗📜📤🔔🚪) with the same stroke-only style as
// the rest of this file.
export const SettingsIcon = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></Icon>
);

export const MailIcon = (p: { size?: number }) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></Icon>
);

export const LinkIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M9 15 15 9" /><path d="M11 6.5 12.6 5a4 4 0 1 1 5.7 5.7L16.5 12" /><path d="M13 17.5 11.4 19a4 4 0 1 1-5.7-5.7L7.5 12" /></Icon>
);

export const ClockIcon = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Icon>
);

export const CoinIcon = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9.5c0-1.1 1.3-2 3-2s3 .9 3 2-1.3 1.6-3 1.6-3 .8-3 2 1.3 2 3 2 3-.9 3-2" /></Icon>
);

export const FilmIcon = (p: { size?: number }) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></Icon>
);

export const SatelliteIcon = (p: { size?: number }) => (
  <Icon {...p}><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><path d="m5 5 2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></Icon>
);

export const SparkleIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m12 7 1.8 3.2L17 12l-3.2 1.8L12 17l-1.8-3.2L7 12l3.2-1.8L12 7Z" /></Icon>
);

export const UploadIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Icon>
);

export const LogoutIcon = (p: { size?: number }) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icon>
);
