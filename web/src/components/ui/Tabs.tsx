"use client";

export type TabItem = { value: string; label: string; count?: number };

export function Tabs({
  value,
  onChange,
  items,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  items: TabItem[];
  className?: string;
}) {
  // Deliberately NOT role="tablist"/"tab": these are filter pills with no tab
  // panels or arrow-key navigation, so the ARIA tabs pattern would over-promise.
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              active ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={`text-xs ${active ? "text-cream/70" : "text-ink-faint"}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
