export function Eyebrow({ index, children }: { index?: string; children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
      {index ? `${index} — ` : ""}
      {children}
    </p>
  );
}
