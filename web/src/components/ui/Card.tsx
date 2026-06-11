export function Card({
  title,
  action,
  flush = false,
  className = "",
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  /** Omit the default padding - for edge-to-edge content like tables. */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-paper ${flush ? "" : "p-5"} ${className}`}
    >
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${flush ? "px-5 pt-5" : "mb-4"}`}>
          {title && <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
