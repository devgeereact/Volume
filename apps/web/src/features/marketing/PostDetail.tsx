import type { ReactNode } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import { Button, StatusChip } from "../../components/ui";
import { cn } from "../../lib/cn";
import { channelIcon, channelLabel } from "./LaunchKit";
import { spokenSeconds, type MarketingItem } from "./marketingExtras";

/* The chosen post in full (.mk-insp in the approved design): its channel and headline, every part of the
   post, Copy post, the item's own actions, and the copy-one-part list. */

const h5 = "mt-3.5 mb-1.5 flex justify-between gap-2 text-[11px] leading-4 font-bold tracking-[0.08em] text-ink-3 uppercase";

function Part({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <>
      <h4 className={h5}>
        {title}
        {aside && <small className="num font-medium tracking-normal normal-case">{aside}</small>}
      </h4>
      {children}
    </>
  );
}

interface PostDetailProps {
  item: MarketingItem;
  /** Its place in the channel's list, from 0. */
  index: number;
  subjectIndex: number;
  onSubject: (i: number) => void;
  onCopy: () => void;
  /** Regenerate, Edit, Mark as used, Archive: only for people who can change the book. */
  actions?: ReactNode;
  /** The copy-one-part list. */
  parts?: ReactNode;
  busy?: ReactNode;
}

export function PostDetail({ item, index, subjectIndex, onSubject, onCopy, actions, parts, busy }: PostDetailProps) {
  const Icon = channelIcon[item.kind];
  const len = item.kind === "tiktok" ? `, ${item.data.lengthSeconds} seconds` : "";
  const title =
    item.kind === "tiktok"
      ? item.data.hook
      : item.kind === "instagram"
        ? firstLine(item.data.caption)
        : (item.data.subjects[subjectIndex] ?? item.data.subject);
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-line pb-3">
        <span aria-hidden className="grid size-[38px] place-items-center rounded-[12px] bg-btn text-on-btn">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <small className="text-[10.5px] leading-4 font-bold tracking-[0.09em] text-ink-3 uppercase">
            {channelLabel[item.kind]} {index + 1}
            {len}
          </small>
          <h3 className="mt-0.5 font-book text-[17px] leading-[1.25] font-semibold text-ink">{title}</h3>
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            {item.status === "used" ? <StatusChip status="passed">Used</StatusChip> : <StatusChip status="queued">Draft</StatusChip>}
          </span>
        </span>
      </div>

      {busy ?? (
        <div className="text-[13.5px] leading-[1.55] text-ink">
          {item.kind === "tiktok" && (
            <>
              {spokenSeconds(item.data.hook) > 3 && (
                <p className="mt-2 text-[12.5px] text-amber">The hook runs over 3 seconds spoken. Shorten it or regenerate.</p>
              )}
              <Part title="Beats">
                <ol className="grid gap-2">
                  {item.data.beats.map((b, i) => (
                    <li key={i} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
                      <span aria-hidden className="num grid size-[22px] place-items-center rounded-full bg-mint-wash text-[11px] font-bold text-ink">
                        {i + 1}
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ol>
              </Part>
              {item.data.onScreenText.length > 0 && (
                <Part title="On screen">
                  <ul className="flex flex-wrap gap-1.5">
                    {item.data.onScreenText.map((t) => (
                      <li key={t} className="rounded-[8px] border border-line bg-soft px-2 py-1 text-[12px] font-semibold">
                        {t}
                      </li>
                    ))}
                  </ul>
                </Part>
              )}
              <Part title="Caption" aside={`${item.data.caption.length} characters`}>
                <p>{item.data.caption}</p>
              </Part>
              <Tags tags={item.data.hashtags} />
            </>
          )}
          {item.kind === "instagram" && (
            <>
              {item.data.imageIdea && (
                <Part title="Image">
                  <p>{item.data.imageIdea}</p>
                </Part>
              )}
              <Part title="Caption" aside={`${item.data.caption.length} characters`}>
                <p>{item.data.caption}</p>
              </Part>
              <Tags tags={item.data.hashtags} />
            </>
          )}
          {item.kind === "email" && (
            <>
              <fieldset>
                <legend className={h5}>Subject line, pick one</legend>
                <div className="grid gap-1">
                  {item.data.subjects.map((s, i) => (
                    <label key={s} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2 hover:bg-soft has-checked:bg-select-wash">
                      <input
                        type="radio"
                        name={`subject-${item.data.id}`}
                        checked={subjectIndex === i}
                        onChange={() => onSubject(i)}
                        className="size-4 accent-(--vol-select)"
                      />
                      <span className="min-w-0 flex-1">{s}</span>
                      <span className="num text-[11.5px] text-ink-3">{s.length}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Part title="Preview line" aside={`${item.data.preview.length} characters`}>
                <p>{item.data.preview}</p>
              </Part>
              <Part title="Body">
                <div className="grid gap-2">
                  {item.data.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </Part>
            </>
          )}
        </div>
      )}

      <div className="mt-3.5 grid gap-2 border-t border-line pt-3.5">
        <Button variant="primary" icon={Copy} fullWidth onClick={onCopy}>
          Copy post
        </Button>
        <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <ShieldCheck size={14} aria-hidden className="shrink-0" />
          Check every claim before you post.
        </p>
        {actions && <div className={cn("flex flex-wrap gap-1.5")}>{actions}</div>}
      </div>
      {parts}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <Part title="Hashtags" aside={`${tags.length} of 10`}>
      <ul className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <li key={t} className="rounded-pill bg-blue-wash px-2.5 py-0.5 text-[12px] text-blue">
            {t}
          </li>
        ))}
      </ul>
    </Part>
  );
}

function firstLine(text: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(text);
  return (m ? m[0] : text).trim();
}
