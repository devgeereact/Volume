import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, Copy, Download, HardDriveDownload, PlugZap, Save } from "lucide-react";
import { Banner, Button, EmptyState, IconButton, Input, KeyValueList, SegmentedControl, Select, StatusChip, Switch } from "../../components/ui";
import { books, DEMO_NOW } from "../../demo/books";
import { bookCategories, bookTypes, bookTypesIn, coverStyles, getBookType, getCoverStyle, getInteriorTheme, interiorThemes } from "../../demo/config";
import { workspace } from "../../demo/workspace";
import { formatDate, formatNumber, formatRelative, formatTime, formatUsd } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import type { DemoState } from "../library/demoState";
import { TRIM_HINT, TRIM_OPTIONS } from "../profiles/PublishingTab";
import { InlineStatus, PanelHeader, SaveAction, SettingRow, SettingsSection } from "./PanelHeader";

/* Settings panels other than Models. Demo values come from src/data/workspace.ts; the prototype never
   reads a key and never calls OpenRouter. */

/** Data folder from docs/02-architecture/ARCHITECTURE.md (data/ at the repository root, git-ignored). */
const DATA_FOLDER = "~/Projects/volume/data";
const BACKUP_FOLDER = workspace.backups.location;

function useFakeAction(ms: number): [boolean, (done: () => void) => void] {
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    busy,
    (done) => {
      setBusy(true);
      timer.current = window.setTimeout(() => {
        setBusy(false);
        done();
      }, ms);
    },
  ];
}

/** A titled section card in a Settings panel (approved design, .set-sec). */
export function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode | undefined }) {
  return (
    <SettingsSection title={title} aside={aside}>
      {children}
    </SettingsSection>
  );
}

/* ---------- OpenRouter ---------- */

export function KeyPanel({ state, retry }: { state: DemoState; retry: () => void }) {
  const or = workspace.openRouter;
  const [testing, runTest] = useFakeAction(1200);
  const [result, setResult] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(or.checkedAt);

  if (state === "empty")
    return (
      <div className="grid gap-6">
        <PanelHeader title="OpenRouter" body="Volume reaches every model through OpenRouter with one key that stays on the server." />
        <EmptyState
          drawing="box"
          title="No OpenRouter key yet"
          body="Add OPENROUTER_API_KEY to the server .env file, then restart. AI steps wait until the key is there."
          action={
            <Button variant="primary" onClick={retry}>
              Check again
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="grid gap-[18px]">
      <PanelHeader
        title="OpenRouter"
        body="Volume reaches every model through OpenRouter with one key that stays on the server."
        actions={state === "error" ? <StatusChip status="attention">Not reachable</StatusChip> : <StatusChip status="passed">Connected</StatusChip>}
      />
      {state === "error" ? (
        <Banner
          tone="error"
          title="Could not reach OpenRouter"
          action={
            <Button size="sm" onClick={retry}>
              Try again
            </Button>
          }
        >
          Check this computer’s internet connection. Your work is safe, and AI steps wait until Volume can connect.
        </Banner>
      ) : (
        result && (
          <Banner tone="success" title="Connection works">
            {result}
          </Banner>
        )
      )}
      <SettingsSection title="Key">
        <div>
          <SettingRow
            title="API key"
            body={
              <>
                Kept on the server as <span className="font-mono text-[12px] text-ink-2">OPENROUTER_API_KEY</span>. Volume never shows it, logs it or sends it
                to the browser, not even in part.
              </>
            }
          >
            {!or.keyPresent ? (
              <StatusChip status="attention">Missing</StatusChip>
            ) : state === "error" ? (
              <StatusChip tone="info">Present, not checked</StatusChip>
            ) : (
              <StatusChip status="passed">Present and valid</StatusChip>
            )}
          </SettingRow>
          <SettingRow title="Credit left" body={`Last checked ${formatRelative(checkedAt).toLowerCase()}.`}>
            <span className="num text-[28px] leading-none font-light tracking-[-0.02em] text-ink">
              {or.creditUsd === null ? "Not reported" : formatUsd(or.creditUsd)}
            </span>
          </SettingRow>
          <SettingRow title="Test the connection" body="Sends one small request to OpenRouter.">
            <Button
              icon={PlugZap}
              loading={testing}
              loadingLabel="Testing"
              onClick={() =>
                runTest(() => {
                  setCheckedAt(DEMO_NOW);
                  setResult(`Connected at ${formatTime(DEMO_NOW)}. OpenRouter accepted the key and reported ${formatUsd(or.creditUsd ?? 0)} of credit left.`);
                })
              }
            >
              Test connection
            </Button>
          </SettingRow>
        </div>
      </SettingsSection>
      <KeySafetyNet />
    </div>
  );
}

/** Where to cap the key and how to change it; shared with the server version of the OpenRouter panel. */
export function KeySafetyNet() {
  return (
    <SettingsSection title="Safety net">
      <div>
        <SettingRow
          title="Cap the key in OpenRouter"
          body={
            <>
              Volume has no spending cap of its own. Your OpenRouter account can limit what this key may spend, as a second safety net. See what the AI has cost
              on the{" "}
              <Link to="/settings/budgets" className="font-semibold text-select underline underline-offset-2">
                spending
              </Link>{" "}
              page.
            </>
          }
        />
        <SettingRow title="Change the key" body="Edit the server’s environment file and restart the server. The browser never sees it." />
      </div>
    </SettingsSection>
  );
}

/* ---------- Spending (D-057: no book or monthly cap) ---------- */

/** This month's spend as the approved design's light figure (.statpill b), with its words beside it. */
export function SpendFigure({ usd }: { usd: number }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="num text-[28px] leading-none font-light tracking-[-0.02em] text-ink">{formatUsd(usd)}</span>
      <span className="text-small text-ink-3">spent this month</span>
    </p>
  );
}

export function BudgetsPanel() {
  const spend = workspace.spend;
  return (
    <div className="grid gap-6">
      <PanelHeader
        title="Spending"
        body="Volume has no book or monthly spending cap. It records what the AI costs and pauses a job only when the AI provider runs out of credit, then tells you to top up."
      />
      <Block title={`${spend.monthLabel} so far`}>
        <SpendFigure usd={spend.spentUsd} />
        <p className="text-small text-ink-2">All books and profiles together, in dollars as the AI provider bills.</p>
      </Block>
    </div>
  );
}

/* ---------- Book defaults ---------- */

const bookTypeOptions = bookCategories.flatMap((c) => bookTypesIn(c.id).map((t) => ({ value: t.id, label: t.name, hint: c.name })));

export function BookDefaultsPanel() {
  const startType = getBookType("self-help") ?? bookTypes[0];
  const initial = {
    type: startType?.id ?? "",
    trim: startType?.defaultTrim ?? "6 x 9 in",
    theme: startType?.defaultInteriorTheme ?? "",
    cover: startType?.defaultCoverStyle ?? "",
    paper: "cream" as "cream" | "white",
    total: String(startType?.wordRange.default ?? 30000),
    chapters: String(startType?.chapterRange.default ?? 10),
  };
  const [savedValues, setSavedValues] = useState(initial);
  const [v, setV] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const type = getBookType(v.type);
  const n = (s: string) => Number(s.replace(/[,\s]/g, ""));
  const range = (s: string, min: number, max: number, what: string) =>
    !Number.isInteger(n(s)) || n(s) < min || n(s) > max ? `${what} must be between ${formatNumber(min)} and ${formatNumber(max)}.` : undefined;
  const totalError = type ? range(v.total, type.wordRange.min, type.wordRange.max, "The book length") : undefined;
  const unit = type?.structure.bodyUnit ?? "chapters";
  const unitLabel = unit.charAt(0).toUpperCase() + unit.slice(1);
  const chaptersError = type ? range(v.chapters, type.chapterRange.min, type.chapterRange.max, unitLabel) : undefined;
  const invalid = Boolean(totalError || chaptersError);
  const dirty = JSON.stringify(v) !== JSON.stringify(savedValues);
  const perUnit = !invalid && n(v.chapters) > 0 ? Math.round(n(v.total) / n(v.chapters) / 50) * 50 : null;

  function chooseType(id: string) {
    const t = getBookType(id);
    if (!t) return;
    setV({
      ...v,
      type: id,
      trim: t.defaultTrim,
      theme: t.defaultInteriorTheme,
      cover: t.defaultCoverStyle,
      total: String(t.wordRange.default),
      chapters: String(t.chapterRange.default),
    });
  }

  return (
    <div className="grid gap-6">
      <PanelHeader
        title="Book defaults"
        body="Where a new book starts when its profile has no default of its own. The wizard shows these and each book can change them."
        actions={
          <SaveAction
            dirty={dirty}
            icon={Save}
            invalidReason={invalid ? "Fix the fields marked in red first" : undefined}
            onSave={() => {
              setSavedValues(v);
              setStatus(`Saved at ${formatTime(DEMO_NOW)}. New books start with these.`);
            }}
          >
            Save defaults
          </SaveAction>
        }
      />
      {status && !dirty && <InlineStatus>{status}</InlineStatus>}
      <SettingsSection title="Every new book">
        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            label="Book type"
            value={v.type}
            onChange={chooseType}
            options={bookTypeOptions}
            hint={type ? `${type.description} Choosing a type fills in its length, trim, interior and cover style.` : undefined}
            className="sm:col-span-2"
          />
          <Select label="Trim size" value={v.trim} onChange={(trim) => setV({ ...v, trim })} options={TRIM_OPTIONS} hint={TRIM_HINT} />
          <fieldset className="grid content-start gap-1.5">
            <legend className="mb-1.5 text-label text-ink">Paper</legend>
            <SegmentedControl<"cream" | "white">
              label="Paper"
              value={v.paper}
              onChange={(paper) => setV({ ...v, paper })}
              options={[
                { value: "cream", label: "Cream" },
                { value: "white", label: "White" },
              ]}
              className="w-full sm:w-60"
            />
            <p className="text-small text-ink-3">Cream suits text-led books. Spine width depends on it.</p>
          </fieldset>
          <Select
            label="Interior theme"
            value={v.theme}
            onChange={(theme) => setV({ ...v, theme })}
            options={interiorThemes.map((t) => ({ value: t.id, label: t.name }))}
            hint={getInteriorTheme(v.theme)?.description}
          />
          <Select
            label="Cover style"
            value={v.cover}
            onChange={(cover) => setV({ ...v, cover })}
            options={coverStyles.map((c) => ({ value: c.id, label: c.name }))}
            hint={getCoverStyle(v.cover)?.description}
          />
        </div>
      </SettingsSection>
      <SettingsSection title="Length and language">
        <fieldset className="grid gap-4">
          <legend className="sr-only">Length</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Book length, words"
              inputMode="numeric"
              value={v.total}
              onChange={(e) => setV({ ...v, total: e.target.value })}
              error={totalError}
              hint={type ? `${formatNumber(type.wordRange.min)} to ${formatNumber(type.wordRange.max)} for this book type` : undefined}
            />
            <Input
              label={unitLabel}
              inputMode="numeric"
              value={v.chapters}
              onChange={(e) => setV({ ...v, chapters: e.target.value })}
              error={chaptersError}
              hint={
                type
                  ? `${formatNumber(type.chapterRange.min)} to ${formatNumber(type.chapterRange.max)}${perUnit ? `, about ${formatNumber(perUnit)} words each` : ""}`
                  : undefined
              }
            />
          </div>
        </fieldset>
        <Switch
          label="British English"
          description="Version 1 writes in British English. Spelling and phrasing follow the house style, so this stays on."
          checked
          disabled
          onChange={() => undefined}
        />
      </SettingsSection>
    </div>
  );
}

/* ---------- Appearance ---------- */

export function AppearancePanel() {
  const { theme, preference, setTheme, followSystem } = useTheme();
  const value = preference ?? "system";
  return (
    <div className="grid gap-6">
      <PanelHeader title="Appearance" body="Paper and cloth by day, the night desk after dark. Changes apply straight away." />
      <SettingsSection title="Theme" className="gap-3">
        <SegmentedControl<"light" | "dark" | "system">
          label="Theme"
          value={value}
          onChange={(t) => (t === "system" ? followSystem() : setTheme(t))}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "Match system" },
          ]}
          className="w-full sm:w-[360px]"
        />
        <p role="status" className="text-small text-ink-2">
          {preference === null
            ? `Following this computer’s setting, so the ${theme} theme is on now.`
            : `The ${theme} theme stays on until you change it here.`}
        </p>
      </SettingsSection>
      <SettingsSection title="Motion">
        <div>
          <SettingRow
            title="Reduced motion"
            body="When “reduce motion” is on in your system settings, page turns, cover lifts and streaming text become simple fades, and nothing moves on its own."
          >
            <span className="text-[14px] font-semibold text-ink">Follows your system</span>
          </SettingRow>
        </div>
      </SettingsSection>
    </div>
  );
}

/* ---------- Data and backups ---------- */

export function BackupsPanel() {
  const [backingUp, runBackup] = useFakeAction(1400);
  const [exporting, runExport] = useFakeAction(1600);
  const [lastAt, setLastAt] = useState(workspace.backups.lastAt);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [nightly, setNightly] = useState(true);
  const [time, setTime] = useState("02:00");
  const [keep, setKeep] = useState(String(workspace.backups.keep));
  const [scope, setScope] = useState("all");
  const [copied, setCopied] = useState(false);

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(DATA_FOLDER);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const slug = scope === "all" ? "all-books" : scope;

  return (
    <div className="grid gap-6">
      <PanelHeader
        title="Data and backups"
        body="Books save to the Volume database: on this Mac for now, and on your cPanel database once it is connected. Back up often, and export a project when you want to move it."
        actions={
          <Button
            variant="primary"
            icon={HardDriveDownload}
            loading={backingUp}
            loadingLabel="Backing up"
            onClick={() =>
              runBackup(() => {
                setLastAt(DEMO_NOW);
                setBackupStatus(`Backed up at ${formatTime(DEMO_NOW)}. The database and book files are in backups/2026-10-04.`);
              })
            }
          >
            Back up now
          </Button>
        }
      />
      {backupStatus && <InlineStatus>{backupStatus}</InlineStatus>}

      <Block title="Where your data lives">
        <div className="flex items-end gap-2">
          <Input
            label="Data folder"
            value={DATA_FOLDER}
            readOnly
            className="flex-1"
            fieldClassName="font-mono"
            hint="Read only here. The database, book files, exports and backups all sit in this folder."
          />
          <span className="mb-[26px]">
            <IconButton icon={copied ? Check : Copy} variant="secondary" label={copied ? "Copied" : "Copy the folder path"} onClick={() => void copyPath()} />
          </span>
        </div>
        <KeyValueList
          className="max-w-[460px]"
          items={[
            { label: "Backups folder", value: BACKUP_FOLDER.replace(DATA_FOLDER, "data") },
            { label: "Last backup", value: formatRelative(lastAt) },
          ]}
        />
      </Block>

      <Block title="Automatic backups">
        <Switch label="Back up every night" description="The database and all book files, while Volume is running." checked={nightly} onChange={setNightly} />
        {nightly && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Select label="Time" value={time} onChange={setTime} options={["01:00", "02:00", "03:00", "23:00"].map((t) => ({ value: t, label: t }))} />
            <Select
              label="Keep"
              value={keep}
              onChange={setKeep}
              options={[
                { value: "7", label: "The last 7 backups" },
                { value: "14", label: "The last 14 backups", hint: "Default" },
                { value: "30", label: "The last 30 backups" },
              ]}
              hint="Older backups are removed after a new one succeeds."
            />
          </div>
        )}
      </Block>

      <Block title="Export a project">
        <p className="max-w-[62ch] text-small text-ink-2">
          A zip with the manuscript, versions, covers, exports and settings, so you can move a book to another computer or keep an archive.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="What to export"
            value={scope}
            onChange={(s) => {
              setScope(s);
              setExportStatus(null);
            }}
            options={[{ value: "all", label: "All books" }, ...books.filter((b) => !b.archived).map((b) => ({ value: b.id, label: b.title }))]}
            className="w-full sm:w-72"
          />
          <Button
            icon={Download}
            loading={exporting}
            loadingLabel="Exporting"
            onClick={() => runExport(() => setExportStatus(`volume-${slug}-2026-10-04.zip is ready in data/exports.`))}
          >
            Export as zip
          </Button>
        </div>
        {exportStatus && <InlineStatus>{exportStatus}</InlineStatus>}
      </Block>
    </div>
  );
}

/* ---------- House style ---------- */

const SPELLING_EXAMPLES: [string, string][] = [
  ["color", "colour"],
  ["favor", "favour"],
  ["organize", "organise"],
  ["center", "centre"],
];

export function HouseStylePanel() {
  const hs = workspace.houseStyle;
  return (
    <div className="grid gap-6">
      <PanelHeader title="House style" body="The writing rules every book follows. Read only in version 1; the file is config/house-style.json." />
      <Block title={`Version ${hs.version}`} aside={<StatusChip status="locked">Read only</StatusChip>}>
        <KeyValueList
          className="max-w-[460px]"
          items={[
            { label: "Language", value: "English (UK), en-GB" },
            { label: "Banned phrases", value: formatNumber(hs.bannedPhrases) },
            { label: "Spelling pairs, US to UK", value: formatNumber(hs.spellingPairs) },
            { label: "Updated", value: formatDate("2026-10-04T09:00:00+01:00") },
          ]}
        />
      </Block>
      <HouseStyleRules />
    </div>
  );
}

/** The rules and spelling examples, shared with the server version of this panel. */
export function HouseStyleRules() {
  return (
    <>
      <Block title="Rules that apply to every book">
        <ul className="grid max-w-[66ch] gap-2 text-[14px] leading-5 text-ink">
          <li>No em dashes. A comma, colon, full stop or brackets instead.</li>
          <li>No en dash in number ranges: write “pages 10 to 20”.</li>
          <li>British spelling throughout, with context words such as programme and program flagged for a look.</li>
          <li>None of the banned phrases, plus any a profile adds in its Voice DNA.</li>
          <li>Non-fiction in the first person unless the profile says otherwise. About the Author stays in the third person.</li>
        </ul>
      </Block>
      <Block title="Spelling, a few examples">
        <table className="w-full max-w-[420px] text-[14px]">
          <thead>
            <tr className="text-left text-[12.5px] text-ink-2">
              <th scope="col" className="pb-2 font-semibold">
                US spelling
              </th>
              <th scope="col" className="pb-2 font-semibold">
                Volume writes
              </th>
            </tr>
          </thead>
          <tbody>
            {SPELLING_EXAMPLES.map(([us, uk]) => (
              <tr key={us} className="border-t border-line">
                <td className="py-2 text-ink-2">{us}</td>
                <td className="py-2 font-semibold text-ink">{uk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>
    </>
  );
}

/* ---------- KDP rules ---------- */

export function KdpRulesPanel() {
  const kr = workspace.kdpRules;
  const ageDays = Math.round((new Date(DEMO_NOW).getTime() - new Date(`${kr.version}T12:00:00+01:00`).getTime()) / 86_400_000);
  const stale = ageDays > 90;
  return (
    <div className="grid gap-6">
      <PanelHeader title="KDP rules" body="Trim sizes, page limits, cover maths and royalty rules come from one dated file, never from memory." />
      {stale ? (
        <Banner tone="attention" title="Time to check the KDP rules again">
          The oldest check in the rules file was {ageDays} days ago. Check KDP’s help pages and add a new dated file.
        </Banner>
      ) : (
        <Banner tone="success" title={`Oldest check ${ageDays === 1 ? "1 day" : `${ageDays} days`} ago`}>
          Next check due by {formatDate(`${kr.recheckDue}T09:00:00+00:00`)}.
        </Banner>
      )}
      <Block title={`Rules file ${kr.version}`} aside={<StatusChip status="locked">Read only</StatusChip>}>
        <KeyValueList
          className="max-w-[460px]"
          items={[
            { label: "Dated", value: formatDate(`${kr.version}T12:00:00+01:00`) },
            { label: "Rules", value: kr.rules },
            { label: "Next check due", value: formatDate(`${kr.recheckDue}T09:00:00+00:00`) },
          ]}
        />
        <p className="max-w-[62ch] text-small text-ink-2">
          Some rules are still marked unverified, such as the trim size list. Export preflight warns while a rule it uses is unverified.
        </p>
      </Block>
    </div>
  );
}

/* ---------- About ---------- */

export function AboutPanel() {
  return (
    <div className="grid gap-6">
      <PanelHeader title="About Volume" body="A local-first studio for writing, editing and publishing books under your own name and your pen names." />
      <Block title="This copy">
        <KeyValueList
          className="max-w-[460px]"
          items={[
            { label: "Version", value: "Prototype, phase 0" },
            { label: "AI access", value: "OpenRouter, one key on the server" },
            { label: "Runs on", value: "This computer, 127.0.0.1" },
          ]}
        />
      </Block>
      <AboutFonts />
    </div>
  );
}

/** Fonts and icons used, shared with the server version of this panel. */
export function AboutFonts() {
  return (
    <Block title="Fonts and icons">
      <ul className="grid gap-1.5 text-[14px] leading-5 text-ink">
        <li>
          <span className="font-book">Literata</span> for book text, SIL Open Font Licence 1.1
        </li>
        <li>Manrope for the interface, SIL Open Font Licence 1.1</li>
        <li>
          <span className="font-mono text-[13px]">JetBrains Mono</span> for model IDs and keys, SIL Open Font Licence 1.1
        </li>
        <li>Lucide icons, ISC licence</li>
      </ul>
    </Block>
  );
}
