import { Eyebrow } from "./Eyebrow";

export function StatNumeral({
  value,
  label,
  className = "",
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="font-serif text-[40px] leading-none text-ink">{value}</p>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}
