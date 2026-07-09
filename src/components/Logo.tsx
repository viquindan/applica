/**
 * Brand mark: a minimal "A" apex - reads as the initial of Applica and as
 * forward momentum (the swipe-to-apply gesture). Replaces the generic
 * briefcase/sparkle icons that had drifted inconsistent across pages.
 */
export function LogoMark({ size = 20, stroke = 'currentColor', strokeWidth = 2.2 }: { size?: number; stroke?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 18.5 12 5.5l8 13" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.4 13.2h7.2" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function LogoBadge({ size = 36, radius = 'var(--radius-md)', bg = 'var(--gold)', stroke = 'var(--petrol)' }: { size?: number; radius?: string; bg?: string; stroke?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <LogoMark size={Math.round(size * 0.52)} stroke={stroke} />
    </div>
  );
}
