import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, chipClasses, Cover, InspectorSection, Modal, Skeleton, Tabs, tabPanelProps, type TabItem } from "../../components/ui";
import { useProfile, useProfileMemory, useProfileSamples } from "../../api/hooks";
import { apiErrorText, useApiBooks, useApiProfiles, useWireMode } from "../../api/wire-a";
import type { ApiProfile, ProfileMemoryItem, ProfileSample } from "../../api/types";
import { coverFromStyle } from "../../demo/covers";
import { getBookType, getCoverStyle, getInteriorTheme } from "../../demo/config";
import { formatNumber } from "../../lib/format";
import { titleLines } from "../library/draftCover";
import { cn } from "../../lib/cn";
import { useToast } from "../../lib/toast";
import { NotFound } from "../../shell/NotFound";
import { IdentityTab } from "./IdentityTab";
import { MemoryTab } from "./MemoryTab";
import { ModelsTab } from "./ModelsTab";
import { ProfileAvatar } from "./ProfileAvatar";
import { RealPersonBadge } from "./ProfilesPage";
import { PublishingTab } from "./PublishingTab";
import { renderTemplate, validateProfile, type EditorTab } from "./profileRules";
import { VoiceTab } from "./VoiceTab";
import { draftFromApi, saveDraftToServer } from "./profileApi";
import { blankProfile, bookCount, getProfile, sampleTitle, saveProfile, useProfiles, type ProfileDraft } from "./profileStore";
import { useSyncWorkspaceModels } from "../settings/modelDefaults";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "voice", label: "Voice DNA" },
  { id: "publishing", label: "Publishing defaults" },
  { id: "models", label: "Models" },
  { id: "memory", label: "Memory" },
];
const ID_BASE = "profile";
const SAVE_MS = 600;

function isTab(v: string | null): v is EditorTab {
  return TABS.some((t) => t.id === v);
}

/** A sample cover in the profile's default cover style, so each profile's books start with their own look. */
function StylePreview({ draft, title }: { draft: ProfileDraft; title: string }) {
  const design = useMemo(() => {
    try {
      return coverFromStyle(draft.publishing.defaultCoverStyle, "", titleLines(title));
    } catch {
      return null;
    }
  }, [draft.publishing.defaultCoverStyle, title]);
  const type = getBookType(draft.publishing.defaultBookType);
  const theme = getInteriorTheme(draft.publishing.defaultInteriorTheme);
  const style = getCoverStyle(draft.publishing.defaultCoverStyle);
  return (
    <InspectorSection title="New books start with">
      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
        <Cover title={title} author={draft.name.trim() || "Your name"} design={design} hideSubtitle decorative className="w-full" />
        <dl className="grid gap-2 text-small">
          {[
            ["Book type", type?.name ?? "Not chosen"],
            ["Length", draft.publishing.defaultWordTarget > 0 ? `${formatNumber(draft.publishing.defaultWordTarget)} words` : "Not set"],
            ["Trim", draft.publishing.trim],
            ["Interior", theme?.name ?? "Not chosen"],
            ["Cover style", style?.name ?? "Not chosen"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </InspectorSection>
  );
}

/** Live preview of the copyright page as it will print. The bio is edited in Identity, so it is not repeated here. */
function PrintPreview({ draft, title }: { draft: ProfileDraft; title: string }) {
  const copyright = renderTemplate(draft.publishing.copyright, draft, title);
  const disclaimer = renderTemplate(draft.publishing.disclaimer, draft, title);
  const illustrative = draft.realPerson && draft.publishing.illustrative ? renderTemplate(draft.publishing.illustrativeLine, draft, title) : [];
  return (
    <InspectorSection title="Copyright page, as it will print">
      <div className="grid gap-2.5 rounded-lg border border-line bg-soft px-5 py-6 font-book text-[12.5px] leading-[19px] text-ink">
        {draft.publishing.imprint.trim() && <p className="font-semibold">{draft.publishing.imprint.trim()}</p>}
        {[...copyright, ...illustrative, ...disclaimer].map((para, i) => (
          <p key={i} className="whitespace-pre-line">
            {para}
          </p>
        ))}
      </div>
      <p className="mt-2 text-small text-ink-3">Shown for {title}. No ISBN entered, so the ISBN line is left out.</p>
    </InspectorSection>
  );
}

/** What the editor needs from its data source: demo store or server. */
interface EditorEnv {
  /** Names of the other profiles, so two cannot share one. */
  otherNames: string[];
  /** Books under this profile that are not archived. */
  count: number;
  /** A title to show in the previews. */
  title: string;
  /** Saves and resolves with the profile id. Rejects with an error to show. */
  save: (draft: ProfileDraft) => Promise<string>;
  /** Called after a save, so the source can reload. */
  onSaved?: (() => void) | undefined;
}

function ProfileEditor({ initial, isNew, env }: { initial: ProfileDraft; isNew: boolean; env: EditorEnv }) {
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: EditorTab = isTab(tabParam) ? tabParam : "identity";
  const [saved, setSaved] = useState<ProfileDraft>(initial);
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const skipGuard = useRef(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const otherNames = env.otherNames;
  const errors = useMemo(() => validateProfile(draft, otherNames), [draft, otherNames]);
  const visibleErrors = showErrors ? errors : errors.filter((e) => e.field !== "name");

  const update = useCallback((fn: (d: ProfileDraft) => ProfileDraft) => setDraft((d) => fn(d)), []);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !skipGuard.current && dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  function setTab(id: string) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === "identity") next.delete("tab");
        else next.set("tab", id);
        return next;
      },
      { replace: true },
    );
  }

  function save() {
    if (errors.length > 0) {
      setShowErrors(true);
      requestAnimationFrame(() => bannerRef.current?.focus());
      return;
    }
    setSaving(true);
    setSaveError(null);
    env.save(draft).then(
      (id) => {
        const stored = { ...draft, id };
        setSaved(stored);
        setDraft(stored);
        setSaving(false);
        setShowErrors(false);
        toast.show({
          tone: "success",
          title: isNew ? "Profile added" : "Profile saved",
          body: isNew ? `${draft.name.trim()} is ready for the new book wizard.` : `New books under ${draft.name.trim()} use these settings.`,
        });
        if (isNew) {
          skipGuard.current = true;
          void navigate(`/profiles/${id}`, { replace: true });
        } else env.onSaved?.();
      },
      (e: unknown) => {
        setSaving(false);
        setSaveError(apiErrorText(e));
      },
    );
  }

  const errorTabs = new Map<EditorTab, number>();
  for (const e of visibleErrors) errorTabs.set(e.tab, (errorTabs.get(e.tab) ?? 0) + 1);
  const tabItems: TabItem[] = TABS.map((t) => {
    const n = errorTabs.get(t.id);
    const item: TabItem = { id: t.id, label: t.label };
    if (n) {
      item.count = n;
      item.countTone = "claim";
    } else if (t.id === "memory" && draft.memory.length > 0) item.count = draft.memory.length;
    return item;
  });

  const count = isNew ? 0 : env.count;
  const title = isNew ? draft.name.trim() || "New profile" : saved.name;

  return (
    <div className="grid grid-cols-1 items-start gap-5 px-4 pt-1.5 pb-8 min-[861px]:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="vol-glass grid min-w-0 content-start gap-6 rounded-card p-[22px] max-[560px]:p-4">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <ProfileAvatar initials={draft.initials || "?"} id={isNew ? undefined : saved.id} size="xl" />
          <div className="grid min-w-0 flex-1 gap-1">
            <h1 className="text-[20px] leading-7 font-bold tracking-[-0.01em] text-ink">{title}</h1>
            <p className="inline-flex flex-wrap items-center gap-2 text-small text-ink-2">
              {isNew ? "Identity, voice, defaults and models." : count === 0 ? "No books yet" : `${count} ${count === 1 ? "book" : "books"}`}
              {!isNew && (saved.realPerson ? <RealPersonBadge /> : <span className={chipClasses("info")}>Pen name</span>)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <>
              <span role="status" className={cn("text-small", dirty ? "font-semibold text-amber" : "text-ink-3")}>
                {dirty ? "Unsaved changes" : isNew ? "" : "All changes saved"}
              </span>
              {dirty && !isNew && canWrite && (
                <Button variant="ghost" onClick={() => setDraft(saved)}>
                  Discard changes
                </Button>
              )}
              {canWrite && (
                <Button variant="primary" icon={Save} onClick={save} loading={saving} loadingLabel="Saving">
                  {isNew ? "Add profile" : "Save profile"}
                </Button>
              )}
            </>
          </div>
        </header>
        <ReadOnlyBanner />

        {saveError && (
          <Banner tone="error" title={isNew ? "Profile not added" : "Profile not saved"}>
            {saveError} Your changes are still here.
          </Banner>
        )}

        {showErrors && errors.length > 0 && (
          <div ref={bannerRef} tabIndex={-1} className="outline-none">
            <Banner tone="error" title={`Fix ${errors.length === 1 ? "1 field" : `${errors.length} fields`} before saving`}>
              <ul className="mt-1 grid gap-0.5">
                {errors.map((e) => (
                  <li key={e.field}>
                    <button type="button" className="text-left underline underline-offset-2 hover:text-claim" onClick={() => setTab(e.tab)}>
                      {e.label}
                    </button>
                    : {e.message}
                  </li>
                ))}
              </ul>
            </Banner>
          </div>
        )}

        <div className="grid max-w-[760px] gap-7">
          <Tabs label="Profile sections" idBase={ID_BASE} items={tabItems} value={tab} onChange={setTab} />
          <div {...tabPanelProps(ID_BASE, tab)} className="focus-visible:outline-offset-4">
            {tab === "identity" && <IdentityTab draft={draft} update={update} errors={visibleErrors} />}
            {tab === "voice" && <VoiceTab draft={draft} update={update} errors={visibleErrors} />}
            {tab === "publishing" && <PublishingTab draft={draft} update={update} errors={visibleErrors} />}
            {tab === "models" && <ModelsTab draft={draft} update={update} errors={visibleErrors} />}
            {tab === "memory" && <MemoryTab draft={draft} update={update} errors={visibleErrors} />}
          </div>
        </div>
      </div>

      <aside aria-label="Preview" className="min-w-0 lg:sticky-side">
        <div className="vol-glass relative grid content-start rounded-card p-5">
          <StylePreview draft={draft} title={isNew ? "Your Book Title" : env.title} />
          <PrintPreview draft={draft} title={isNew ? "Your Book Title" : env.title} />
        </div>
      </aside>

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        size="sm"
        title="Leave without saving?"
        description={`Your changes to ${draft.name.trim() || "this profile"} are not saved yet.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </>
        }
      />
    </div>
  );
}

function demoSave(draft: ProfileDraft): Promise<string> {
  return new Promise((resolve) => window.setTimeout(() => resolve(saveProfile(draft)), SAVE_MS));
}

function EditorSkeleton() {
  return (
    <div role="status" aria-label="Loading profile" className="grid content-start gap-6 px-4 pt-1.5 pb-8 min-[861px]:px-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-10 w-full max-w-[760px]" />
      <Skeleton className="h-3 w-3/5 max-w-[760px]" />
      <Skeleton className="h-3 w-2/5 max-w-[760px]" />
    </div>
  );
}

/** Demo mode: the screen-local store. */
function DemoProfileEditor({ profileId }: { profileId: string | undefined }) {
  const all = useProfiles();
  const isNew = profileId === "new";
  const existing = isNew ? undefined : getProfile(profileId ?? "");
  if (!isNew && !existing) return <NotFound what="profile" />;
  const draftId = existing?.id ?? "new";
  const env: EditorEnv = {
    otherNames: all.filter((p) => p.id !== draftId).map((p) => p.name),
    count: existing ? bookCount(existing.id) : 0,
    title: existing ? sampleTitle(existing.id) : "Your Book Title",
    save: demoSave,
  };
  return <ProfileEditor key={profileId} initial={existing ?? blankProfile()} isNew={isNew} env={env} />;
}

/** Server mode: loads the profile, its samples and memory, and saves through the API. */
function ApiProfileEditor({ profileId }: { profileId: string | undefined }) {
  const qc = useQueryClient();
  const isNew = profileId === "new";
  const id = isNew ? undefined : profileId;
  const profile = useProfile(id);
  const samples = useProfileSamples(id);
  const memory = useProfileMemory(id);
  const list = useApiProfiles(true, { includeArchived: true });
  const books = useApiBooks(true, id ? { profileId: id } : {});
  const [round, setRound] = useState(0);

  if (isNew) {
    const env: EditorEnv = {
      otherNames: (list.data ?? []).map((p) => p.penName),
      count: 0,
      title: "Your Book Title",
      save: (d) => saveDraftToServer(qc, d, { profile: null, samples: [], memory: [] }),
    };
    return <ProfileEditor key="new" initial={blankProfile()} isNew env={env} />;
  }
  const failed = profile.error ?? samples.error ?? memory.error;
  if (profile.isError && profile.error && "code" in profile.error && profile.error.code === "not_found") return <NotFound what="profile" />;
  if (failed)
    return (
      <div className="px-4 pt-1.5 pb-8 min-[861px]:px-6">
        <Banner
          tone="error"
          title="Could not load this profile"
          action={
            <Button
              size="sm"
              onClick={() => {
                void profile.refetch();
                void samples.refetch();
                void memory.refetch();
              }}
            >
              Retry
            </Button>
          }
        >
          {apiErrorText(failed)}
        </Banner>
      </div>
    );
  if (!profile.data || !samples.data || !memory.data) return <EditorSkeleton />;

  // A save compares the draft with what the server holds now (sample ids, memory switches).
  const base: { profile: ApiProfile; samples: ProfileSample[]; memory: ProfileMemoryItem[] } = {
    profile: profile.data,
    samples: samples.data,
    memory: memory.data,
  };
  const p = profile.data;
  const active = (books.data ?? []).filter((b) => b.status !== "archived");
  const env: EditorEnv = {
    otherNames: (list.data ?? []).filter((x) => x.id !== p.id).map((x) => x.penName),
    count: active.length,
    title: active.find((b) => b.title)?.title ?? "Your Book Title",
    save: (d) => saveDraftToServer(qc, d, base),
    onSaved: () => setRound((r) => r + 1),
  };
  return <ProfileEditor key={`${p.id}:${round}`} initial={draftFromApi(p, samples.data, memory.data)} isNew={false} env={env} />;
}

/** Profile editor (09-UX-FLOWS, M1). /profiles/new adds a profile. */
export default function ProfileEditorPage() {
  const { profileId } = useParams();
  const mode = useWireMode();
  useSyncWorkspaceModels(mode === "api");
  if (mode === "checking") return <EditorSkeleton />;
  if (mode === "api") return <ApiProfileEditor key={profileId} profileId={profileId} />;
  return <DemoProfileEditor profileId={profileId} />;
}
