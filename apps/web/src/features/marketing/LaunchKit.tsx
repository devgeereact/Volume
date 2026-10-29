import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Archive, Bookmark, Heart, Mail, Megaphone, MessageCircle, Music2, Send, ShieldCheck, Smartphone, Square } from "lucide-react";
import { Cover, tabId, tabPanelId } from "../../components/ui";
import type { Book } from "../../demo";
import { cn } from "../../lib/cn";
import type { ItemKind, MarketingItem } from "./marketingExtras";

/* The launch kit in the approved design (v6 "marketing launch kit"): a hero in the book's own cover
   colours, a channel picker, a gallery of post previews and the chosen post in full. The previews are
   plain mock-ups: no platform logos, and no likes, views or other counts, because none of them exist. */

export type Channel = ItemKind | "archive";

/** The book's cover colours as CSS custom properties. Server books without a drawn design use the theme's navy. */
export function kitColours(book: Book): CSSProperties {
  const p = book.cover?.palette;
  const vars: Record<string, string> = p
    ? { "--kit-bg": p.background, "--kit-fg": p.title, "--kit-sub": p.subtitle, "--kit-ac": p.motif, "--kit-alt": p.motifAlt || p.subtitle }
    : {
        "--kit-bg": "var(--vol-btn)",
        "--kit-fg": "var(--vol-on-btn)",
        "--kit-sub": "color-mix(in srgb, var(--vol-on-btn) 78%, transparent)",
        "--kit-ac": "var(--vol-mint)",
        "--kit-alt": "var(--vol-blue)",
      };
  vars["--kit-bg2"] = "color-mix(in srgb, var(--kit-bg) 65%, black)";
  return vars;
}

/** The five swatches shown on the hero, from the cover. */
function swatches(book: Book): string[] {
  const p = book.cover?.palette;
  return p ? [p.background, "var(--kit-bg2)", p.title, p.motif, p.motifAlt || p.subtitle] : [];
}

/** A handle for the mock-ups, from the pen name ("@harnimuharami"). */
export function handleOf(author: string): string {
  return "@" + (author.toLowerCase().replace(/[^a-z0-9]+/g, "") || "author");
}

interface HeroProps {
  book: Book;
  author: string;
  live: boolean;
  counts: { tiktok: number; instagram: number; email: number; hashtags: number };
}

/** The launch kit hero (.mk-hero): cover, title, author, what the kit holds and the cover colours. */
export function LaunchHero({ book, author, live, counts }: HeroProps) {
  const sw = swatches(book);
  const stats: [number, string][] = [
    [counts.tiktok, counts.tiktok === 1 ? "TikTok script" : "TikTok scripts"],
    [counts.instagram, counts.instagram === 1 ? "Instagram post" : "Instagram posts"],
    [counts.email, counts.email === 1 ? "Launch email" : "Launch emails"],
  ];
  if (live) stats.push([counts.hashtags, counts.hashtags === 1 ? "Hashtag" : "Hashtags"]);
  return (
    <section
      aria-label="Launch kit"
      style={kitColours(book)}
      className="relative grid grid-cols-[132px_minmax(0,1fr)_auto] items-center gap-[26px] overflow-hidden rounded-[24px] bg-[linear-gradient(125deg,var(--kit-bg)_0%,var(--kit-bg2)_100%)] px-7 py-[26px] text-(--kit-fg) shadow-glass max-[1024px]:grid-cols-[100px_minmax(0,1fr)] max-[560px]:grid-cols-[76px_minmax(0,1fr)] max-[560px]:gap-4 max-[560px]:p-[18px]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[40%] -right-[10%] aspect-square w-3/5 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--kit-ac)_55%,transparent),transparent_65%)] opacity-55"
      />
      <div className="relative -rotate-3 leading-none">
        <Cover
          title={book.title}
          subtitle={book.subtitle}
          author={author}
          design={book.cover}
          image={book.coverImage?.src ?? null}
          className="w-full"
          decorative
        />
      </div>
      <div className="relative min-w-0">
        <p className="inline-block rounded-pill bg-[color-mix(in_srgb,var(--kit-fg)_14%,transparent)] px-2.5 py-1 text-[11px] leading-none font-bold tracking-[0.1em] uppercase">
          {live ? "Launch kit" : "Launch kit, not written yet"}
        </p>
        <h2 className="mt-2.5 mb-1.5 font-book text-[clamp(22px,2.4vw,32px)] leading-[1.1] font-semibold">{book.title}</h2>
        <p className="text-[14px] text-(--kit-sub)">
          {book.subtitle ? `${book.subtitle} ` : ""}
          <span className="opacity-85">by {author}</span>
        </p>
        <dl className="mt-[18px] flex flex-wrap gap-2.5">
          {stats.map(([n, label]) => (
            <div
              key={label}
              className="grid min-w-24 rounded-[14px] border border-[color-mix(in_srgb,var(--kit-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--kit-fg)_10%,transparent)] px-3.5 py-2.5 max-[560px]:min-w-0 max-[560px]:flex-[1_1_40%]"
            >
              <dt className="order-2 text-[11.5px] text-(--kit-sub)">{label}</dt>
              <dd className="num order-1 text-[22px] leading-[1.1] font-bold">{n}</dd>
            </div>
          ))}
        </dl>
      </div>
      {sw.length > 0 && (
        <div className="relative grid grid-cols-[repeat(5,22px)] content-center justify-items-center gap-1.5 max-[1024px]:col-span-full max-[1024px]:grid-cols-[repeat(5,22px)_auto] max-[1024px]:justify-start">
          {sw.map((c, i) => (
            <i
              key={i}
              aria-hidden
              className="size-[22px] rounded-full border-2 border-[color-mix(in_srgb,var(--kit-fg)_40%,transparent)]"
              style={{ background: c }}
            />
          ))}
          <small className="col-span-full mt-0.5 text-[10.5px] text-(--kit-sub) max-[1024px]:col-span-1 max-[1024px]:mt-0 max-[1024px]:ml-1.5">
            Cover colours
          </small>
        </div>
      )}
    </section>
  );
}

const channelMeta: Record<Channel, { label: string; hint: string; icon: typeof Mail }> = {
  tiktok: { label: "TikTok", hint: "Vertical video, 9 by 16", icon: Smartphone },
  instagram: { label: "Instagram", hint: "Square post, 1 by 1", icon: Square },
  email: { label: "Email", hint: "Launch email to readers", icon: Mail },
  archive: { label: "Archive", hint: "Replaced and archived", icon: Archive },
};

/** The channel picker (.mk-ch): one tab per channel with its count. Arrow keys move between them. */
export function ChannelTabs({ value, onChange, counts }: { value: Channel; onChange: (c: Channel) => void; counts: Record<Channel, number> }) {
  const order: Channel[] = ["tiktok", "instagram", "email", "archive"];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = order.indexOf(value);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % order.length
        : e.key === "ArrowLeft"
          ? (i - 1 + order.length) % order.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? order.length - 1
              : -1;
    const c = order[next];
    if (!c) return;
    e.preventDefault();
    onChange(c);
    refs.current[next]?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label="Content type"
      onKeyDown={onKey}
      className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-2.5 max-[760px]:grid-cols-2 max-[560px]:grid-cols-4 max-[560px]:gap-1.5"
    >
      {order.map((c, i) => {
        const m = channelMeta[c];
        const on = c === value;
        const Icon = m.icon;
        const small = c === "archive";
        return (
          <button
            key={c}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId("mk", c)}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={tabPanelId("mk", c)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(c)}
            className={cn(
              "grid min-w-0 items-center gap-3 rounded-[16px] border bg-panel px-3.5 py-3 text-left text-ink transition-[border-color,box-shadow,transform] duration-(--vol-dur-fast) hover:-translate-y-px hover:shadow-glass motion-reduce:hover:translate-y-0",
              small ? "grid-cols-[auto_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]",
              on ? "border-ink shadow-[inset_0_0_0_1px_var(--vol-ink)]" : "border-line",
              "max-[560px]:grid-cols-1 max-[560px]:justify-items-center max-[560px]:gap-1.5 max-[560px]:px-1.5 max-[560px]:py-2.5 max-[560px]:text-center",
            )}
          >
            <span aria-hidden className={cn("grid size-[38px] place-items-center rounded-[12px]", on ? "bg-btn text-on-btn" : "bg-mint-wash text-ink")}>
              <Icon size={18} strokeWidth={1.8} />
            </span>
            {small ? (
              <span className="num text-[13px] font-semibold max-[560px]:text-[12.5px]">
                {m.label} <span className="font-normal text-ink-3 max-[560px]:hidden">{counts[c]}</span>
              </span>
            ) : (
              <>
                <span className="min-w-0">
                  <b className="block text-[14.5px] max-[560px]:text-[13px]">{m.label}</b>
                  <small className="block truncate text-[12px] text-ink-3 max-[560px]:hidden">{m.hint}</small>
                </span>
                <em className="num grid h-[26px] min-w-[26px] place-items-center rounded-pill border border-line bg-soft px-1 text-[13px] font-bold not-italic max-[560px]:hidden">
                  {counts[c]}
                </em>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The first sentence of a caption, for the quote on the Instagram mock-up. */
function firstSentence(text: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(text);
  return (m ? m[0] : text).trim();
}

/** A post preview (.mkp): a vertical phone for TikTok, a square post for Instagram, an inbox card for email. */
export function PostPreview({ book, author, item }: { book: Book; author: string; item: MarketingItem }) {
  const handle = handleOf(author);
  const initial = (author.trim()[0] ?? "V").toUpperCase();
  const cover = (
    <Cover
      title={book.title}
      subtitle={book.subtitle}
      author={author}
      design={book.cover}
      image={book.coverImage?.src ?? null}
      className="w-full"
      decorative
      hideSubtitle
    />
  );
  if (item.kind === "tiktok") {
    const d = item.data;
    return (
      <div className="relative flex aspect-[9/16] flex-col overflow-hidden rounded-[22px] border-[5px] border-[color-mix(in_srgb,var(--kit-bg)_25%,black)] bg-[radial-gradient(120%_70%_at_80%_10%,color-mix(in_srgb,var(--kit-ac)_45%,transparent),transparent_60%),linear-gradient(170deg,var(--kit-bg),var(--kit-bg2))] text-(--kit-fg) shadow-cover">
        <div className="flex flex-1 flex-col justify-center gap-2 pr-[46px] pl-4 max-[560px]:px-2.5 max-[560px]:pt-6">
          <b className="text-[19px] leading-[1.12] font-extrabold tracking-[-0.01em] text-balance max-[560px]:text-[14px]">{d.hook}</b>
          {d.onScreenText.map((t) => (
            <span key={t} className="self-start rounded-[7px] bg-(--kit-ac) px-2 py-1 text-[11px] font-bold text-(--kit-bg)">
              {t}
            </span>
          ))}
        </div>
        <div aria-hidden className="absolute right-2 bottom-[74px] grid justify-items-center gap-3 max-[560px]:hidden">
          <span className="grid size-[30px] place-items-center rounded-full border-2 border-(--kit-ac) bg-(--kit-fg) text-[13px] font-extrabold text-(--kit-bg)">
            {initial}
          </span>
          <Heart size={22} strokeWidth={1.8} />
          <MessageCircle size={22} strokeWidth={1.8} />
          <Bookmark size={22} strokeWidth={1.8} />
          <Send size={22} strokeWidth={1.8} />
        </div>
        <div className="grid gap-[3px] pr-[46px] pb-4 pl-3.5 text-[11px] leading-[1.35] max-[560px]:px-2.5 max-[560px]:pb-3">
          <b className="text-[12px]">{handle}</b>
          <span className="line-clamp-2 opacity-90">{d.caption}</span>
          <small className="flex items-center gap-1 overflow-hidden text-[10.5px] whitespace-nowrap opacity-85">
            <Music2 size={12} aria-hidden className="shrink-0" /> Original sound, {author}
          </small>
        </div>
        <span className="num absolute top-2.5 right-2.5 rounded-pill bg-[color-mix(in_srgb,var(--kit-bg)_55%,black)] px-[7px] py-0.5 text-[10px] font-bold text-(--kit-fg)">
          {d.lengthSeconds} s
        </span>
      </div>
    );
  }
  if (item.kind === "instagram") {
    const d = item.data;
    return (
      <div className="overflow-hidden rounded-[18px] border border-line bg-panel text-ink shadow-glass">
        <div className="flex items-center gap-2 px-3 py-2.5 text-[12.5px]">
          <span
            aria-hidden
            className="grid size-[26px] place-items-center rounded-full bg-[linear-gradient(135deg,var(--kit-bg),var(--kit-ac))] text-[12px] font-extrabold text-(--kit-fg) shadow-[0_0_0_2px_var(--vol-panel),0_0_0_3.5px_var(--kit-ac)]"
          >
            {initial}
          </span>
          <b className="truncate">{handle.slice(1)}</b>
        </div>
        <div className="relative flex aspect-square flex-col justify-center gap-2.5 bg-[radial-gradient(90%_70%_at_100%_0%,color-mix(in_srgb,var(--kit-ac)_40%,transparent),transparent_60%),linear-gradient(150deg,var(--kit-bg),var(--kit-bg2))] px-[18px] pt-[18px] pb-4 text-(--kit-fg)">
          <span aria-hidden className="absolute top-1 left-3 font-book text-[64px] leading-none text-(--kit-ac) opacity-90">
            &ldquo;
          </span>
          <span className="relative block max-w-[88%] font-book text-[17px] leading-[1.28] text-pretty max-[560px]:text-[13px]">
            {firstSentence(d.caption)}
          </span>
          <span className="text-[10.5px] font-bold tracking-[0.08em] text-(--kit-sub) uppercase">{book.title}</span>
          <span className="absolute right-3 bottom-3 w-11 rotate-[4deg] leading-none shadow-cover">{cover}</span>
        </div>
        <div aria-hidden className="flex gap-3 px-3 pt-2.5 pb-1 text-ink">
          <Heart size={20} strokeWidth={1.8} />
          <MessageCircle size={20} strokeWidth={1.8} />
          <Send size={20} strokeWidth={1.8} />
          <span className="flex-1" />
          <Bookmark size={20} strokeWidth={1.8} />
        </div>
        <p className="mx-3 mb-3 line-clamp-2 text-[12px] leading-[1.4] text-ink-2">
          <b className="text-ink">{handle.slice(1)}</b> {d.caption}
        </p>
      </div>
    );
  }
  const d = item.data;
  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-panel pb-1.5 text-ink shadow-glass">
      <div aria-hidden className="flex items-center gap-1.5 border-b border-line bg-soft px-3 py-[9px]">
        <i className="size-[9px] rounded-full bg-line-2" />
        <i className="size-[9px] rounded-full bg-line-2" />
        <i className="size-[9px] rounded-full bg-line-2" />
        <span className="ml-2 text-[11.5px] text-ink-3">Inbox</span>
      </div>
      <div className="flex items-center gap-2.5 px-[18px] pt-3.5 pb-1">
        <span
          aria-hidden
          className="grid size-[26px] place-items-center rounded-full bg-[linear-gradient(135deg,var(--kit-bg),var(--kit-ac))] text-[12px] font-extrabold text-(--kit-fg)"
        >
          {initial}
        </span>
        <span>
          <b className="block text-[13.5px]">{author}</b>
          <small className="text-[12px] text-ink-3">to readers</small>
        </span>
      </div>
      <b className="block px-[18px] pt-1.5 pb-0.5 text-[18px] leading-[1.25]">{d.subject}</b>
      <small className="block px-[18px] pb-3 text-[13px] text-ink-2">{d.preview}</small>
      <div className="mx-[18px] mb-3 grid grid-cols-[62px_minmax(0,1fr)] items-center gap-3.5 rounded-[14px] bg-[linear-gradient(120deg,var(--kit-bg),var(--kit-bg2))] p-3.5 text-(--kit-fg)">
        <span className="leading-none">{cover}</span>
        <span className="min-w-0">
          <b className="block font-book text-[16px]">{book.title}</b>
          {book.subtitle && <small className="mt-0.5 mb-2 block text-[12px] text-(--kit-sub)">{book.subtitle}</small>}
          <em className="inline-block rounded-pill bg-(--kit-ac) px-3 py-1.5 text-[12px] font-bold text-(--kit-bg) not-italic">See the book</em>
        </span>
      </div>
      {d.body.slice(0, 3).map((p, i) => (
        <p key={i} className="mx-[18px] mb-2 text-[13px] leading-normal text-ink-2">
          {p}
        </p>
      ))}
    </div>
  );
}

/** One preview in the gallery (.mk-it): an article holding a button that picks it, with its number. */
export function GalleryItem({
  label,
  n,
  selected,
  onSelect,
  busy,
  children,
}: {
  label: string;
  n: number;
  selected: boolean;
  onSelect: () => void;
  busy?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <article aria-label={label} aria-busy={busy || undefined} className="relative min-w-0">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "group relative block w-full rounded-[22px] text-left outline-offset-4 transition-transform duration-(--vol-dur-base) hover:-translate-y-[3px] motion-reduce:hover:translate-y-0",
          "after:pointer-events-none after:absolute after:-inset-[5px] after:rounded-[26px] after:border-2 after:transition-colors",
          selected ? "after:border-mint-2" : "after:border-transparent",
        )}
      >
        <span className="sr-only">Show {label} in full</span>
        <span
          aria-hidden
          className={cn(
            "num absolute -top-2 -left-2 z-[3] grid size-6 place-items-center rounded-full border text-[12px] font-bold shadow-glass",
            selected ? "border-btn bg-btn text-on-btn" : "border-line bg-panel text-ink",
          )}
        >
          {n}
        </span>
        {children}
      </button>
    </article>
  );
}

export const channelLabel: Record<ItemKind, string> = { tiktok: "TikTok", instagram: "Instagram", email: "Email" };
export const channelIcon: Record<ItemKind, typeof Mail> = { tiktok: Smartphone, instagram: Square, email: Mail };

/** The gallery and side cards on the step page. */
export const kitCard = "vol-glass min-w-0 rounded-card p-[18px] max-[560px]:p-[15px]";

/** Phones and squares sit in a grid of at least 210 px (two across on phones); emails stack. */
export function galleryGrid(tab: ItemKind): string {
  return tab === "email"
    ? "grid grid-cols-1 gap-[18px]"
    : "grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] items-start gap-[18px] max-[560px]:grid-cols-2 max-[560px]:gap-3.5";
}

/** A preview being written again. */
export function BusyPreview({ text = "Writing it again" }: { text?: string }) {
  return (
    <span role="status" aria-label={text} className="grid gap-3 rounded-[18px] border border-line bg-panel-2 p-4">
      <span className="h-6 w-3/5 animate-pulse rounded-sm bg-soft motion-reduce:animate-none" />
      <span className="h-4 w-full animate-pulse rounded-sm bg-soft motion-reduce:animate-none" />
      <span className="h-4 w-4/5 animate-pulse rounded-sm bg-soft motion-reduce:animate-none" />
    </span>
  );
}

/** The house rules for launch content, under the chosen post. */
export function Guardrails() {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-[12px] bg-soft px-3 py-2.5 text-[12px] leading-[1.45] text-ink-2">
      <ShieldCheck size={14} aria-hidden className="mt-px shrink-0" />
      No invented reviews, testimonials, rankings or awards. Review requests ask for an honest review and offer nothing in return (KDP rules 10.6 and 10.7).
    </p>
  );
}

/** Nothing written yet for this book (.mk-empty): what the blueprint plans and how to start. */
export function KitEmpty({ book, label, status }: { book: Book; label: string; status?: ReactNode }) {
  const { tiktok, instagram } = book.marketingCounts;
  return (
    <section
      aria-labelledby="kit-empty"
      className="vol-glass grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[18px] rounded-card p-[22px] max-[760px]:grid-cols-1"
    >
      <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-mint-wash text-ink">
        <Megaphone size={20} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <h2 id="kit-empty" className="text-[14px] leading-5 font-semibold text-ink">
          No scripts yet for this book
        </h2>
        <p className="mt-1 text-[14px] leading-[1.5] text-ink-2">
          {tiktok} TikTok {tiktok === 1 ? "script" : "scripts"} and {instagram} Instagram {instagram === 1 ? "post" : "posts"} are planned in the blueprint's
          marketing package. They are written from the book, in its cover colours. {label} starts them.
        </p>
        {status}
      </div>
    </section>
  );
}
