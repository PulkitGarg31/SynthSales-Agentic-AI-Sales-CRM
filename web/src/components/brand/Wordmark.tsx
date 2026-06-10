import Image from "next/image";

export function Wordmark({ withEmblem = false, size = "md" }: { withEmblem?: boolean; size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : "text-xl";
  return (
    <span className="inline-flex items-center gap-2.5">
      {withEmblem && (
        <Image src="/brand/emblem.png" alt="" width={size === "lg" ? 44 : 32} height={size === "lg" ? 44 : 32} />
      )}
      <span className={`${text} font-semibold tracking-tight text-ink`}>
        sellari<em className="font-serif italic font-normal"> ai</em>
        <span className="text-terracotta">.</span>
      </span>
    </span>
  );
}
