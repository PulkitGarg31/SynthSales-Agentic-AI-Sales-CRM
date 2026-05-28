export function Logo({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const text = variant === "light" ? "text-white" : "text-ink";
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
        <span className="font-display text-lg leading-none text-ink">R</span>
      </span>
      <span className={`font-display text-xl leading-none ${text}`}>
        Reach<span className="text-brand">ly</span>
      </span>
    </span>
  );
}
