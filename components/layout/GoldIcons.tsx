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

export const DoubleCheckIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 14} viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12l5 5L18 6" /><path d="M9 17l3 3L26 6" />
  </svg>
);
