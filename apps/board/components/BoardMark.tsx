import Image from "next/image";

export function BoardMark({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      src="/brand/pgpz-primary-on-light.png"
      alt=""
      width={compact ? 104 : 124}
      height={compact ? 47 : 56}
      className={compact ? "h-[2.35rem] w-auto" : "h-12 w-auto"}
    />
  );
}
