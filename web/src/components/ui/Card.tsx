export function Card({
  title,
  action,
  className = "",
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-paper p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
