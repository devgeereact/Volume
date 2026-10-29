import { cn } from "../../lib/cn";

/* The approved design gives each profile its own soft tint (a wash with its matching ink), picked from the
   profile id so a profile keeps its colour on every screen. The initials carry the meaning; the tint only helps
   tell cards apart. */
const tints = ["bg-blue-wash text-blue", "bg-good-wash text-good", "bg-red-wash text-red", "bg-amber-wash text-amber", "bg-mint-wash text-mint-ink"];

function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return tints[h % tints.length] ?? "bg-avatar text-on-avatar";
}

const sizes = {
  md: "size-11 text-[14px]",
  xl: "size-14 text-[19px]",
};

/** Initials in a tinted circle: 44 px (md) or 56 px (xl, the profile cards). Decorative; the name sits beside it. */
export function ProfileAvatar({
  initials,
  id,
  size = "md",
  className,
}: {
  initials: string;
  id?: string | undefined;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full leading-none font-bold tracking-[-0.01em]",
        id ? tintFor(id) : "bg-avatar text-on-avatar",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
