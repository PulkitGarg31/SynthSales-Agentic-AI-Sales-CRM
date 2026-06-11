import { Eyebrow } from "./Eyebrow";

export function StatNumeral({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="space-y-1.5">
      <p className="font-serif text-[40px] leading-none text-ink">{value}</p>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}
