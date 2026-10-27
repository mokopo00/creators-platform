import { motion } from 'framer-motion';
import { useId, type KeyboardEvent } from 'react';

export type TabItem<T extends string> = { value: T; label: string };

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const layoutId = useId();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : items.length - 1;
    const next = items[(idx + step) % items.length]!;
    onChange(next.value);
    document.getElementById(`${layoutId}-${next.value}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="glass inline-flex flex-wrap gap-1 !rounded-full p-1"
    >
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            id={`${layoutId}-${it.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(it.value)}
            className={`relative rounded-full px-4 py-1.5 text-sm font-medium ${active ? 'text-white' : 'text-ink-soft hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
