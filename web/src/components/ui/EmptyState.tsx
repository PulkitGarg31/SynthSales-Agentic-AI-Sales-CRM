import Image from "next/image";

export function EmptyState({
  title,
  line,
  action,
}: {
  title: string;
  line: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-paper px-6 py-12 text-center">
      <Image
        src="/brand/emblem.png"
        alt=""
        width={742}
        height={894}
        sizes="34px"
        className="h-10 w-auto opacity-80"
      />
      <p className="display text-lg">{title}</p>
      <p className="font-serif italic text-ink-soft">{line}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
