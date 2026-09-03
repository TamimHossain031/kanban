'use client';

import { cn } from '@/lib/cn';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic hue from the name so an avatar keeps its color.
function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({
  name,
  size = 24,
  className,
  title,
}: {
  name: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium text-white ring-2 ring-surface',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `hsl(${hue(name)} 55% 45%)`,
      }}
      title={title ?? name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatar stack with a "+N" chip past `max`. */
export function AvatarStack({
  names,
  max = 3,
}: {
  names: string[];
  max?: number;
}) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar name={n} />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{ marginLeft: -6 }}
          className="inline-flex h-6 items-center justify-center rounded-full bg-canvas px-1.5 text-[11px] font-medium text-ink-muted ring-2 ring-surface tabular"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
