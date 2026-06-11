"use client";

// Stateless toggle pills. `selected` holds the active values; `onToggle` fires
// with the clicked value. Multi-select callers append/remove; single-select
// callers replace the array — exclusivity is the caller's concern.

export type ChipOption = { value: string; label: string };

export function Chips({
  options,
  selected,
  onToggle,
  className = "",
}: {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option.value)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              active
                ? "border-ink bg-ink text-cream"
                : "border-line bg-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
