import { useState, type ReactNode } from "react";
import { useCanManage } from "../../lib/access";
import { Link } from "react-router";
import { HardDriveDownload, PlugZap, RefreshCw, Save, Upload } from "lucide-react";
import { useNavigate } from "react-router";
import {
  Banner,
  Button,
  EmptyState,
  Figure,
  Input,
  KeyValueList,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  StatusChip,
  Switch,
} from "../../components/ui";
import { apiErrorText, fromServerTrim, isoFromMs, toServerTrim, useApiProfiles, useApiSettings } from "../../api/wire-a";
import { useBackups, useHealth, useImportProject, useMakeBackup, usePatchSettings, useTestOpenRouter } from "../../api/hooks";
import type { BookDefaultsSetting } from "../../api/types";
import { bookCategories, bookTypes, bookTypesIn, coverStyles, getBookType, getCoverStyle, getInteriorTheme, interiorThemes } from "../../demo/config";
import { formatDate, formatNumber, formatRelative } from "../../lib/format";
import { TRIM_HINT, TRIM_OPTIONS } from "../profiles/PublishingTab";
import type { SettingsResponse } from "../../api/types";
import { formatTime, formatUsd } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { InlineStatus, PanelHeader, SaveAction } from "./PanelHeader";
import { Block } from "./panels";
import { canSeeBackups, guestCapError, guestCapOf, parseGuestCap } from "./instanceOnly";

/* Settings panels that read and save through the Volume server (GET and PATCH /settings, the backups
   and the OpenRouter test). Used when the server answers; the demo panels in panels.tsx stay for demo
   mode. The server reports whether the OpenRouter key is present, never the key itself. */

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3 rounded-md border border-border bg-sheet p-5">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

function LoadError({ error, retry, what }: { error: unknown; retry: () => void; what: string }) {
  return (
    <Banner
      tone="error"
      title={`Could not load ${what}`}
      action={
        <Button size="sm" onClick={retry}>
          Retry
        </Button>
      }
    >
      {apiErrorText(error)}
    </Banner>
  );
}

function providerLabel(p: string): string {
  if (p === "mock") return "Test answers (mock provider, no AI calls)";
  if (p === "openrouter") return "OpenRouter";
  return p;
}

/* ---------- OpenRouter ---------- */

function creditLine(credit: { limitRemainingUsd: number | null } | null | undefined): string {
  if (credit === undefined || credit === null) return "Not reported";
  return credit.limitRemainingUsd === null ? "No spending limit on the key" : formatUsd(credit.limitRemainingUsd);
}

export function ApiKeyPanel() {
  const q = useApiSettings(true);
  const test = useTestOpenRouter();
  const [testedAt, setTestedAt] = useState<string | null>(null);
  const header = (
    <PanelHeader
      title="OpenRouter"
      body="Volume reaches every model through OpenRouter with one key that stays on the server."
      actions={
        q.data ? (
          <Button
            icon={PlugZap}
            loading={test.isPending}
            loadingLabel="Testing"
            onClick={() => test.mutate(undefined, { onSettled: () => setTestedAt(new Date().toISOString()) })}
          >
            Test connection
          </Button>
        ) : undefined
      }
    />
  );
  if (q.isPending)
    return (
      <div className="grid gap-6">
        {header}
        <Loading label="Loading the key status" />
      </div>
    );
  if (q.isError)
    return (
      <div className="grid gap-6">
        {header}
        <LoadError error={q.error} retry={() => void q.refetch()} what="the key status" />
      </div>
    );
  const s = q.data;
  const present = s.openRouterKey.present;
  const result = test.data;
  return (
    <div className="grid gap-6">
      {header}
      {test.isError && (
        <Banner tone="error" title="The test did not run">
          {apiErrorText(test.error)}
        </Banner>
      )}
      {result && (
        <Banner
          tone={result.ok ? "success" : "attention"}
          title={result.ok ? "Connection works" : present ? "OpenRouter did not accept the key" : "No key to test"}
        >
          {result.message}
          {result.ok && result.creditUsd !== null ? ` Credit left before the key's limit: ${formatUsd(result.creditUsd)}.` : ""}
        </Banner>
      )}
      {!present && (
        <EmptyState
          drawing="box"
          title="No OpenRouter key yet"
          body="Add OPENROUTER_API_KEY to the server .env file, then restart. AI steps wait until the key is there."
          action={
            <Button variant="primary" icon={RefreshCw} loading={q.isFetching} loadingLabel="Checking" onClick={() => void q.refetch()}>
              Check again
            </Button>
          }
        />
      )}
      <Block title="Key status" aside={present ? <StatusChip status="passed">Key present</StatusChip> : <StatusChip status="attention">No key</StatusChip>}>
        <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <KeyValueList
            items={[
              { label: "Key on the server", value: present ? "Yes" : "No" },
              {
                label: "Credit left",
                value: present
                  ? result?.ok
                    ? result.creditUsd === null
                      ? "No spending limit on the key"
                      : formatUsd(result.creditUsd)
                    : creditLine(s.openRouterCredit)
                  : "No key",
              },
              { label: "Last tested", value: testedAt ? `Today, ${formatTime(testedAt)}` : "Not tested yet" },
              { label: "AI answers from", value: providerLabel(s.aiProvider) },
            ]}
          />
          <div className="grid content-start gap-2 border-t border-border pt-4 text-small text-ink-secondary md:border-t-0 md:border-l md:pt-0 md:pl-10">
            <p className="font-semibold text-ink">Where the key lives</p>
            <p>
              In the server’s .env file as <span className="font-mono text-[12.5px] text-ink">OPENROUTER_API_KEY</span>. Volume never shows it, logs it or sends
              it to the browser, not even in part.
            </p>
            <p>To change it, edit the file and restart the server.</p>
          </div>
        </div>
      </Block>
      <Banner tone="info" title="Set a spending limit on the key too">
        In your OpenRouter account you can cap what this key may spend. It is a second safety net under Volume’s own{" "}
        <Link to="/settings/budgets" className="font-semibold text-select underline underline-offset-2">
          budgets
        </Link>
        .
      </Banner>
    </div>
  );
}

/* ---------- Budgets ---------- */

function money(s: string): number | null {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && s.trim() !== "" ? n : null;
}

interface BudgetValues {
  monthly: string;
  book: string;
  warn: string;
  /** Instance owner only; empty for everyone else and never sent. */
  guest: string;
}

function valuesOf(s: SettingsResponse): BudgetValues {
  const guest = guestCapOf(s);
  return {
    guest: guest === null ? "" : String(guest),
    monthly: s.budgets.monthlyCapUsd === null ? "" : String(s.budgets.monthlyCapUsd),
    book: String(s.budgets.bookDefaultUsd),
    warn: String(Math.round(s.budgets.warnRatio * 100)),
  };
}

const WARN_OPTIONS = ["50", "70", "80", "90"];

export function ApiBudgetsPanel() {
  const q = useApiSettings(true);
  const header = (actions?: ReactNode) => (
    <PanelHeader
      title="Budgets"
      body="Caps on AI spend. When a book reaches its budget, writing pauses and says how much more it needs. Nothing is charged past a cap."
      actions={actions}
    />
  );
  if (q.isPending)
    return (
      <div className="grid gap-6">
        {header()}
        <Loading label="Loading budgets" />
      </div>
    );
  if (q.isError)
    return (
      <div className="grid gap-6">
        {header()}
        <LoadError error={q.error} retry={() => void q.refetch()} what="your budgets" />
      </div>
    );
  return <BudgetsForm settings={q.data} header={header} />;
}

function BudgetsForm({ settings, header }: { settings: SettingsResponse; header: (actions?: ReactNode) => ReactNode }) {
  const saved = valuesOf(settings);
  const [v, setV] = useState<BudgetValues>(saved);
  const [status, setStatus] = useState<string | null>(null);
  const patch = usePatchSettings();
  const spent = settings.budgets.monthSpendUsd;
  const monthly = money(v.monthly);
  const book = money(v.book);
  const noCap = v.monthly.trim() === "";
  const monthlyError = noCap
    ? undefined
    : monthly === null || monthly <= 0
      ? "Enter a monthly cap above $0, for example 40, or leave it empty for no cap."
      : undefined;
  const bookError =
    book === null || book <= 0
      ? "Enter a book budget above $0, for example 15."
      : !noCap && monthly !== null && book > monthly
        ? "A book budget cannot be more than the monthly cap."
        : undefined;
  const isInstanceOwner = guestCapOf(settings) !== null;
  const guestError = isInstanceOwner ? guestCapError(v.guest) : undefined;
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const cap = settings.budgets.monthlyCapUsd;
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());
  const warnOptions = WARN_OPTIONS.includes(v.warn) ? WARN_OPTIONS : [...WARN_OPTIONS, v.warn].sort((a, b) => Number(a) - Number(b));

  function save() {
    if ((!noCap && monthly === null) || book === null) return;
    const guest = isInstanceOwner ? parseGuestCap(v.guest) : null;
    if (isInstanceOwner && guest === null) return;
    setStatus(null);
    patch.mutate(
      {
        // An empty cap is sent as null, which clears it on the server.
        "budget.monthly_cap_usd": noCap ? null : monthly,
        "budget.book_default_usd": book,
        "budget.warn_ratio": Number(v.warn) / 100,
        // Only the owner of this Volume may send this key; the server answers 403 to anyone else.
        ...(guest !== null ? { "budget.guest_workspaces_monthly_cap_usd": guest } : {}),
      },
      { onSuccess: () => setStatus(`Saved at ${formatTime(new Date().toISOString())}.`) },
    );
  }

  return (
    <div className="grid gap-6">
      {header(
        patch.isPending ? (
          <Button variant="primary" icon={Save} loading loadingLabel="Saving">
            Save budgets
          </Button>
        ) : (
          <SaveAction
            dirty={dirty}
            icon={Save}
            invalidReason={monthlyError || bookError || guestError ? "Fix the fields marked in red first" : undefined}
            onSave={save}
          >
            Save budgets
          </SaveAction>
        ),
      )}
      {status && !dirty && <InlineStatus>{status}</InlineStatus>}
      {patch.isError && (
        <Banner tone="error" title="Budgets not saved">
          {apiErrorText(patch.error)} Your changes are still on this page.
        </Banner>
      )}
      <Block title={`${monthLabel} so far`}>
        {cap === null ? (
          <>
            <Figure value={formatUsd(spent)} unit="spent this month" />
            <p className="text-small text-ink-secondary">No monthly cap set yet. Set one below and Volume stops new jobs when it is reached.</p>
          </>
        ) : (
          <>
            <Figure value={formatUsd(spent)} unit={`of ${formatUsd(cap)} this month`} />
            <ProgressBar value={spent} max={cap} label={`${monthLabel} AI spend`} valueText={`${formatUsd(spent)} of ${formatUsd(cap)}`} />
            <p className="text-small text-ink-secondary">
              {cap > 0 ? Math.round((spent / cap) * 100) : 0}% used. Volume warns at {saved.warn}% and stops new jobs at the cap.
            </p>
          </>
        )}
      </Block>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Monthly cap, US dollars"
          inputMode="decimal"
          value={v.monthly}
          onChange={(e) => setV({ ...v, monthly: e.target.value })}
          error={dirty ? monthlyError : undefined}
          hint="All books and profiles together, in dollars as OpenRouter bills. Leave empty for no monthly cap."
        />
        <Input
          label="Default budget per book, US dollars"
          inputMode="decimal"
          value={v.book}
          onChange={(e) => setV({ ...v, book: e.target.value })}
          error={dirty ? bookError : undefined}
          hint="New books start with this. Each book can change it in the wizard."
        />
        <Select
          label="Warn me at"
          value={v.warn}
          onChange={(warn) => setV({ ...v, warn })}
          options={warnOptions.map((w) => ({ value: w, label: `${w}% of a budget`, hint: w === "80" ? "Default" : undefined }))}
          hint="Applies to the monthly cap and to each book."
        />
      </div>
      {isInstanceOwner && (
        <Block title="Other workspaces">
          <p className="text-small text-ink-secondary">
            Other workspaces use your OpenRouter key. Set how much they may spend each month. 0 stops their AI runs.
          </p>
          <Input
            label="Monthly cap per workspace, US dollars"
            inputMode="decimal"
            value={v.guest}
            onChange={(e) => setV({ ...v, guest: e.target.value })}
            error={dirty ? guestError : undefined}
            hint={
              saved.guest === "0"
                ? "Now 0, so other workspaces cannot run AI. Their own caps still apply under this one."
                : "Each workspace gets this much a month. Their own caps still apply under this one."
            }
            className="max-w-xs"
          />
        </Block>
      )}
    </div>
  );
}

/* ---------- Book defaults ---------- */

const bookTypeOptions = bookCategories.flatMap((c) => bookTypesIn(c.id).map((t) => ({ value: t.id, label: t.name, hint: c.name })));

interface DefaultsForm {
  type: string;
  trim: string;
  theme: string;
  cover: string;
  paper: "cream" | "white";
  total: string;
  chapters: string;
}

function defaultsForm(saved: BookDefaultsSetting | undefined): DefaultsForm {
  const type = getBookType(saved?.bookTypeId ?? undefined) ?? getBookType("self-help") ?? bookTypes[0];
  return {
    type: type?.id ?? "",
    trim: saved?.trim ? fromServerTrim(saved.trim) : (type?.defaultTrim ?? "6 x 9 in"),
    theme: saved?.interiorThemeId ?? type?.defaultInteriorTheme ?? "",
    cover: saved?.coverStyleId ?? type?.defaultCoverStyle ?? "",
    paper: saved?.paper ?? "cream",
    total: String(saved?.wordTarget ?? type?.wordRange.default ?? 30000),
    chapters: String(saved?.chapterCount ?? type?.chapterRange.default ?? 10),
  };
}

/** Book defaults saved as the "book.defaults" workspace setting. POST /books fills a new book's gaps from it. */
export function ApiBookDefaultsPanel() {
  const q = useApiSettings(true);
  const header = (
    <PanelHeader
      title="Book defaults"
      body="Where a new book starts when its profile has no default of its own. The wizard shows these and each book can change them."
    />
  );
  if (q.isPending)
    return (
      <div className="grid gap-6">
        {header}
        <Loading label="Loading book defaults" />
      </div>
    );
  if (q.isError)
    return (
      <div className="grid gap-6">
        {header}
        <LoadError error={q.error} retry={() => void q.refetch()} what="your book defaults" />
      </div>
    );
  const saved = q.data.values["book.defaults"];
  return <BookDefaultsForm saved={saved} />;
}

function BookDefaultsForm({ saved }: { saved: BookDefaultsSetting | undefined }) {
  const initial = defaultsForm(saved);
  const [base, setBase] = useState(initial);
  const [v, setV] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const patch = usePatchSettings();
  const type = getBookType(v.type);
  const n = (s: string) => Number(s.replace(/[,\s]/g, ""));
  const range = (s: string, min: number, max: number, what: string) =>
    !Number.isInteger(n(s)) || n(s) < min || n(s) > max ? `${what} must be between ${formatNumber(min)} and ${formatNumber(max)}.` : undefined;
  const totalError = type ? range(v.total, type.wordRange.min, type.wordRange.max, "The book length") : undefined;
  const unit = type?.structure.bodyUnit ?? "chapters";
  const unitLabel = unit.charAt(0).toUpperCase() + unit.slice(1);
  const chaptersError = type ? range(v.chapters, type.chapterRange.min, type.chapterRange.max, unitLabel) : undefined;
  const invalid = Boolean(totalError || chaptersError);
  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const notSaved = saved === undefined;

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

  function save() {
    const trim = toServerTrim(v.trim);
    const body: BookDefaultsSetting = {
      bookTypeId: v.type || null,
      paper: v.paper,
      interiorThemeId: v.theme || null,
      coverStyleId: v.cover || null,
      wordTarget: n(v.total) || null,
      chapterCount: n(v.chapters) || null,
      ...(trim ? { trim } : {}),
    };
    setStatus(null);
    patch.mutate(
      { "book.defaults": body },
      {
        onSuccess: () => {
          setBase(v);
          setStatus(`Saved at ${formatTime(new Date().toISOString())}. New books start with these.`);
        },
      },
    );
  }

  return (
    <div className="grid gap-6">
      <PanelHeader
        title="Book defaults"
        body="Where a new book starts when its profile has no default of its own. The wizard shows these and each book can change them."
        actions={
          patch.isPending ? (
            <Button variant="primary" icon={Save} loading loadingLabel="Saving">
              Save defaults
            </Button>
          ) : (
            <SaveAction dirty={dirty || notSaved} icon={Save} invalidReason={invalid ? "Fix the fields marked in red first" : undefined} onSave={save}>
              Save defaults
            </SaveAction>
          )
        }
      />
      {notSaved && !status && (
        <InlineStatus tone="neutral">Not saved yet. These are the self-help type's own defaults; save to make them the workspace's.</InlineStatus>
      )}
      {status && !dirty && <InlineStatus>{status}</InlineStatus>}
      {patch.isError && (
        <Banner tone="error" title="Defaults not saved">
          {apiErrorText(patch.error)} Your changes are still on this page.
        </Banner>
      )}
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
          <p className="text-small text-ink-tertiary">Cream suits text-led books. Spine width depends on it.</p>
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
      <fieldset className="grid gap-4">
        <legend className="mb-3 text-subhead text-ink">Length</legend>
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
            hint={type ? `${formatNumber(type.chapterRange.min)} to ${formatNumber(type.chapterRange.max)}` : undefined}
          />
        </div>
      </fieldset>
    </div>
  );
}

/* ---------- Data and backups ---------- */

function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ApiBackupsPanel() {
  const canManage = useCanManage();
  const settings = useApiSettings(true);
  // The server sends backups as null to everyone but the owner of this Volume; GET /backups would only answer 403.
  const seeBackups = canSeeBackups(settings.data);
  const q = useBackups({ enabled: settings.isError || seeBackups === true });
  const make = useMakeBackup();
  const patch = usePatchSettings();
  const [status, setStatus] = useState<string | null>(null);
  const header = (
    <PanelHeader
      title="Data and backups"
      body="Books save to the Volume database: on this Mac for now, and on your cPanel database once it is connected."
      actions={
        seeBackups && q.data?.status.supported && canManage ? (
          <Button
            variant="primary"
            icon={HardDriveDownload}
            loading={make.isPending}
            loadingLabel="Backing up"
            onClick={() => {
              setStatus(null);
              make.mutate(undefined, { onSuccess: (f) => setStatus(`Backed up at ${formatTime(isoFromMs(f.createdAt))} as ${f.name}.`) });
            }}
          >
            Back up now
          </Button>
        ) : undefined
      }
    />
  );
  if (seeBackups === false)
    return (
      <div className="grid gap-6">
        {header}
        <Banner tone="info" title="The owner of this Volume looks after backups">
          Backups hold every workspace on this Volume, so only its owner sees and makes them. Your books are in them.
        </Banner>
        <ImportProjectBlock />
      </div>
    );
  if (settings.isPending || q.isPending)
    return (
      <div className="grid gap-6">
        {header}
        <Loading label="Loading backups" />
      </div>
    );
  if (q.isError)
    return (
      <div className="grid gap-6">
        {header}
        <LoadError error={q.error} retry={() => void q.refetch()} what="your backups" />
      </div>
    );
  const st = q.data.status;
  const values = (settings.data?.values ?? {}) as Record<string, unknown>;
  const nightly = values["backup.enabled"] !== false;
  const time = typeof values["backup.time"] === "string" ? values["backup.time"] : "02:00";
  return (
    <div className="grid gap-6">
      {header}
      {status && <InlineStatus>{status}</InlineStatus>}
      {make.isError && (
        <Banner tone="error" title="Backup not made">
          {apiErrorText(make.error)}
        </Banner>
      )}
      {!st.supported && (
        <Banner tone="info" title="Your host keeps the backups">
          The database is on cPanel, so the host’s own backups cover it. Volume does not copy a MySQL database itself.
        </Banner>
      )}
      <Block title="Where your data lives">
        <KeyValueList
          className="max-w-[460px]"
          items={[
            { label: "Database", value: settings.data ? (settings.data.database.client === "mysql" ? "MySQL on cPanel" : "SQLite on this Mac") : "Loading" },
            { label: "Backups", value: st.locationKind === "cpanel" ? "Kept by the host" : "The backups folder in Volume’s data folder" },
            { label: "Last backup", value: st.lastAt ? formatRelative(isoFromMs(st.lastAt), new Date().toISOString()) : "None yet" },
            { label: "Kept", value: `The last ${st.keep}` },
          ]}
        />
      </Block>
      {st.supported && (
        <Block title="Automatic backups">
          <Switch
            label="Back up every night"
            description="The database and all book files, while Volume is running."
            checked={nightly}
            disabled={patch.isPending}
            onChange={(on) => patch.mutate({ "backup.enabled": on })}
          />
          {nightly && (
            <Select
              label="Time"
              value={time}
              onChange={(t) => patch.mutate({ "backup.time": t })}
              options={[...new Set(["01:00", "02:00", "03:00", "23:00", time])].sort().map((t) => ({ value: t, label: t }))}
              className="max-w-xs"
            />
          )}
          {patch.isError && <p className="text-small text-claim">Not saved. {apiErrorText(patch.error)}</p>}
        </Block>
      )}
      <Block title={`Backups (${q.data.items.length})`}>
        {q.data.items.length === 0 ? (
          <p className="text-small text-ink-secondary">No backups yet. Back up now, or wait for the nightly one.</p>
        ) : (
          <ul className="grid">
            {q.data.items.slice(0, 14).map((f) => (
              <li
                key={f.name}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border py-2 text-[14px] first:border-t-0"
              >
                <span className="min-w-0 truncate font-mono text-[12.5px] text-ink">{f.name}</span>
                <span className="num text-small text-ink-secondary">
                  {formatDate(isoFromMs(f.createdAt))}, {formatTime(isoFromMs(f.createdAt))}, {sizeText(f.bytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <ImportProjectBlock />
    </div>
  );
}

/* ---------- House style and KDP rules ---------- */

export function ApiHouseStylePanel({ children }: { children: ReactNode }) {
  const q = useApiSettings(true);
  const info = q.data?.houseStyle;
  const version = info ? info.version : q.data?.houseStyleVersion;
  return (
    <div className="grid gap-6">
      <PanelHeader title="House style" body="The writing rules every book follows. Read only in version 1; the file is config/house-style.json." />
      {q.isError && <LoadError error={q.error} retry={() => void q.refetch()} what="the house style version" />}
      <Block
        title={q.isPending ? "Loading" : version === null || version === undefined ? "Version not found" : `Version ${version}`}
        aside={<StatusChip status="locked">Read only</StatusChip>}
      >
        <KeyValueList
          className="max-w-[460px]"
          items={[
            { label: "Language", value: "English (UK), en-GB" },
            ...(info
              ? [
                  { label: "Banned phrases", value: formatNumber(info.bannedCount) },
                  { label: "Spelling pairs, US to UK", value: formatNumber(info.spellingPairs) },
                  { label: "Updated", value: info.updatedOn ? formatDate(`${info.updatedOn}T12:00:00Z`) : "Not dated" },
                ]
              : []),
            { label: "File the server reads", value: version === null ? "config/house-style.json is missing" : "config/house-style.json" },
          ]}
        />
      </Block>
      {children}
    </div>
  );
}

export function ApiKdpRulesPanel() {
  const q = useApiSettings(true);
  const now = useNow(60 * 60_000);
  const kdp = q.data?.kdpRules ?? null;
  const version = kdp?.version ?? q.data?.kdpRulesVersion;
  const checked = kdp?.checkedAt ?? version;
  const dated = checked && /^\d{4}-\d{2}-\d{2}$/.test(checked) ? `${checked}T12:00:00Z` : null;
  const ageDays = dated ? Math.max(0, Math.round((now - new Date(dated).getTime()) / 86_400_000)) : null;
  const due = kdp?.recheckDueAt ? `${kdp.recheckDueAt}T12:00:00Z` : null;
  const overdue = due ? now > new Date(due).getTime() : ageDays !== null && ageDays > 90;
  return (
    <div className="grid gap-6">
      <PanelHeader title="KDP rules" body="Trim sizes, page limits, cover maths and royalty rules come from one dated file, never from memory." />
      {q.isPending && <Loading label="Loading the KDP rules version" />}
      {q.isError && <LoadError error={q.error} retry={() => void q.refetch()} what="the KDP rules version" />}
      {q.data && !version && (
        <Banner tone="attention" title="No KDP rules file found">
          The server found no dated file in config/kdp-rules. Export preflight cannot check KDP limits until one is added.
        </Banner>
      )}
      {version && ageDays !== null && (
        <Banner
          tone={overdue ? "attention" : "success"}
          title={overdue ? "Time to check the KDP rules again" : `Oldest check ${ageDays === 1 ? "1 day" : `${ageDays} days`} ago`}
        >
          {overdue
            ? `The oldest check in the rules file was ${ageDays} days ago. Check KDP’s help pages and add a new dated file.`
            : due
              ? `Next check due by ${formatDate(due)}.`
              : "Volume asks for a fresh check after 90 days."}
        </Banner>
      )}
      {version && (
        <Block title={`Rules file ${version}`} aside={<StatusChip status="locked">Read only</StatusChip>}>
          <KeyValueList
            className="max-w-[460px]"
            items={[
              { label: "Checked", value: dated ? formatDate(dated) : "Not dated" },
              ...(kdp ? [{ label: "Rules", value: formatNumber(kdp.rules) }] : []),
              { label: "Next check due", value: due ? formatDate(due) : "Not set" },
            ]}
          />
          <p className="max-w-[62ch] text-small text-ink-secondary">
            Some rules are still marked unverified, such as the trim size list. Export preflight warns while a rule it uses is unverified.
          </p>
        </Block>
      )}
    </div>
  );
}

/* ---------- About ---------- */

export function ApiAboutPanel({ fonts }: { fonts: ReactNode }) {
  const health = useHealth();
  const settings = useApiSettings(true);
  const h = health.data;
  const exportProvider = settings.data?.exportProvider;
  return (
    <div className="grid gap-6">
      <PanelHeader title="About Volume" body="A local-first studio for writing, editing and publishing books under your own name and your pen names." />
      <Block title="This copy">
        <KeyValueList
          className="max-w-[460px]"
          items={[
            { label: "Server version", value: h ? h.version : "Loading" },
            { label: "Database", value: h ? (h.database.client === "mysql" ? "MySQL" : "SQLite") : "Loading" },
            { label: "AI answers from", value: h ? providerLabel(h.ai.provider) : "Loading" },
            {
              label: "Exports made by",
              value: exportProvider ? (exportProvider === "mock" ? "Test exporter (mock)" : "Volume exporter") : h ? h.exporter.name : "Loading",
            },
            { label: "Running for", value: h ? `${Math.floor(h.uptimeS / 3600)} h ${Math.floor((h.uptimeS % 3600) / 60)} min` : "Loading" },
            { label: "Runs on", value: "This computer, 127.0.0.1" },
          ]}
        />
      </Block>
      {fonts}
    </div>
  );
}

/* ---------- Project files ---------- */

/**
 * Import a project file made by "Export project file" (a book with its versions, covers and exports).
 * The owner picks the file and the profile it goes under; the server checks the file and says plainly
 * when it is not a Volume project.
 */
function ImportProjectBlock() {
  const canManage = useCanManage();
  const profiles = useApiProfiles(true);
  const importer = useImportProject();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [profileId, setProfileId] = useState("");
  const [inputKey, setInputKey] = useState(0);
  // The server checks the size (MAX_UPLOAD_BYTES) and the contents; here only the file type.
  const fileError = file !== null && !/\.zip$/i.test(file.name) ? "Choose the .zip file that Export project file made." : undefined;
  const options = [
    { value: "", label: "The profile in the file", hint: "Uses the same profile if you already have it, otherwise adds it" },
    ...(profiles.data ?? []).filter((p) => p.status !== "archived").map((p) => ({ value: p.id, label: p.penName })),
  ];
  const done = importer.data;

  return (
    <Block title="Import a project file">
      <p className="max-w-[62ch] text-small text-ink-secondary">
        Load a book exported from Volume, with its versions, covers and exports. To make one, open the book and choose Export project file in the command menu
        (Cmd K), or use the file button on an Archive row.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid content-start gap-1.5">
          <span className="text-label text-ink">Project file</span>
          <input
            key={inputKey}
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => {
              importer.reset();
              setFile(e.target.files?.[0] ?? null);
            }}
            className="block w-full text-small text-ink-secondary file:mr-3 file:h-10 file:rounded-sm file:border file:border-border-strong file:bg-sheet file:px-3 file:text-label file:font-semibold file:text-ink hover:file:bg-sunken"
          />
          {fileError ? (
            <span className="text-small text-claim">{fileError}</span>
          ) : (
            <span className="text-small text-ink-tertiary">A .zip made by Volume.</span>
          )}
        </label>
        <Select label="Put the book under" value={profileId} onChange={setProfileId} options={options} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canManage && (
          <Button
            icon={Upload}
            loading={importer.isPending}
            loadingLabel="Importing"
            disabledReason={!file ? "Choose a project file first." : fileError}
            onClick={() => {
              if (!file || fileError) return;
              importer.mutate(
                { file, profileId: profileId || null },
                {
                  onSuccess: () => {
                    setFile(null);
                    setInputKey((k) => k + 1);
                  },
                },
              );
            }}
          >
            Import project
          </Button>
        )}
        {done && (
          <InlineStatus>
            Imported {done.book.title ?? "the book"}
            {done.profileCreated ? ", with its profile added" : ""}.{" "}
            <button type="button" className="font-semibold text-select underline underline-offset-2" onClick={() => void navigate(`/books/${done.bookId}`)}>
              Open it
            </button>
          </InlineStatus>
        )}
      </div>
      {importer.isError && (
        <Banner tone="error" title="The project was not imported">
          {apiErrorText(importer.error)}
        </Banner>
      )}
    </Block>
  );
}
