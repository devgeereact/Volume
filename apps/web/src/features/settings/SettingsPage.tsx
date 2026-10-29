import { useEffect, useRef } from "react";
import { NavLink, Navigate, useLocation, useParams } from "react-router";
import type { LucideIcon } from "lucide-react";
import { BookOpen, CircleUserRound, Cpu, HardDrive, Info, KeyRound, Scale, SpellCheck, SunMoon, UserCog, Wallet } from "lucide-react";
import { Banner, Button, PageHeader, Skeleton } from "../../components/ui";
import { cn } from "../../lib/cn";
import { settingsTabs, type SettingsTab } from "../../screens";
import { useDemoState } from "../library/demoState";
import { useWireMode } from "../../api/wire-a";
import { useVolumeMe } from "../../api/wire-d";
import { AccountPanel } from "./AccountPanel";
import { MembersPanel } from "./MembersPanel";
import { ApiAboutPanel, ApiBackupsPanel, ApiBookDefaultsPanel, ApiBudgetsPanel, ApiHouseStylePanel, ApiKdpRulesPanel, ApiKeyPanel } from "./apiPanels";
import { ModelsPanel } from "./ModelsPanel";
import {
  AboutFonts,
  AboutPanel,
  AppearancePanel,
  BackupsPanel,
  BookDefaultsPanel,
  BudgetsPanel,
  HouseStylePanel,
  HouseStyleRules,
  KdpRulesPanel,
  KeyPanel,
} from "./panels";

/* Settings (09-UX-FLOWS, M13). The optional :tab param picks the section; /settings opens OpenRouter.
   Demo states: ?state=loading, ?state=error, ?state=empty (no key). With the server running every
   section reads the server (apiPanels.tsx): key present yes or no, the connection test and credit,
   models, spending, book defaults, backups, the house style and KDP rules versions, and About.
   Appearance is a per-browser choice in both modes. */
/* Tab ids and labels live in screens.ts (settingsTabs); only the icons are chosen here. */
const icons: Record<SettingsTab, LucideIcon> = {
  key: KeyRound,
  models: Cpu,
  budgets: Wallet,
  "book-defaults": BookOpen,
  appearance: SunMoon,
  backups: HardDrive,
  "house-style": SpellCheck,
  "kdp-rules": Scale,
  members: UserCog,
  account: CircleUserRound,
  about: Info,
};
const sections = settingsTabs.map((t) => ({ id: t.id, label: t.label, icon: icons[t.id] }));

function isTab(v: string | undefined): v is SettingsTab {
  return settingsTabs.some((t) => t.id === v);
}

function PanelSkeleton() {
  return (
    <div role="status" aria-label="Loading settings" className="grid gap-5">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3 w-4/5" />
      <div className="grid gap-3 rounded-md border border-border bg-sheet p-5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <div className="grid gap-3 rounded-md border border-border bg-sheet p-5">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { tab: tabParam } = useParams();
  const { state, retry } = useDemoState();
  const mode = useWireMode();
  const api = mode === "api";
  const me = useVolumeMe();
  const { search } = useLocation();
  const currentRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // On phones the section strip scrolls sideways: keep the current section in view.
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tabParam]);
  if (tabParam !== undefined && !isTab(tabParam)) return <Navigate to="/settings" replace />;
  const tab: SettingsTab = tabParam ?? "key";
  // Members shows only to the owner with ACCOUNTS_MODE=invite (D-047); anyone else is sent to the first section.
  if (tab === "members" && me.state !== "loading" && !me.membersVisible) return <Navigate to={{ pathname: "/settings", search }} replace />;
  const shown = sections.filter((s) => s.id !== "members" || me.membersVisible);
  const ownTab = tab === "appearance" || tab === "account";

  function panel() {
    if (mode === "checking" && tab !== "appearance") return <PanelSkeleton />;
    if (tab === "members") return me.state === "loading" ? <PanelSkeleton /> : <MembersPanel me={me} />;
    if (tab === "account") return me.state === "loading" ? <PanelSkeleton /> : <AccountPanel me={me} />;
    if (api) {
      switch (tab) {
        case "key":
          return <ApiKeyPanel />;
        case "models":
          return <ModelsPanel state="ready" api />;
        case "budgets":
          return <ApiBudgetsPanel />;
        case "book-defaults":
          return <ApiBookDefaultsPanel />;
        case "backups":
          return <ApiBackupsPanel />;
        case "house-style":
          return (
            <ApiHouseStylePanel>
              <HouseStyleRules />
            </ApiHouseStylePanel>
          );
        case "kdp-rules":
          return <ApiKdpRulesPanel />;
        case "about":
          return <ApiAboutPanel fonts={<AboutFonts />} />;
        case "appearance":
          return <AppearancePanel />;
      }
    }
    if (state === "loading") return <PanelSkeleton />;
    if (tab === "key") return <KeyPanel state={state} retry={retry} />;
    if (tab === "models") return <ModelsPanel state={state} />;
    if (state === "error")
      return (
        <Banner
          tone="error"
          title="Could not load your settings"
          action={
            <Button size="sm" onClick={retry}>
              Retry
            </Button>
          }
        >
          The local server did not answer. Your settings are safe on disk. Try again in a moment.
        </Banner>
      );
    switch (tab) {
      case "budgets":
        return <BudgetsPanel />;
      case "book-defaults":
        return <BookDefaultsPanel />;
      case "appearance":
        return <AppearancePanel />;
      case "backups":
        return <BackupsPanel />;
      case "house-style":
        return <HouseStylePanel />;
      case "kdp-rules":
        return <KdpRulesPanel />;
      case "about":
        return <AboutPanel />;
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 content-start gap-7 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader title="Settings" summary="Workspace settings for every profile and book." />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[216px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:sticky lg:top-[calc(var(--shell-topbar)+28px)] lg:self-start"
        >
          <ul className="flex gap-1 lg:grid">
            {shown.map((s) => {
              const Icon = s.icon;
              const current = s.id === tab;
              return (
                <li key={s.id} className="shrink-0">
                  <NavLink
                    ref={current ? currentRef : undefined}
                    to={s.id === "key" ? "/settings" : `/settings/${s.id}`}
                    end
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-2.5 rounded-sm px-3 text-label whitespace-nowrap -outline-offset-2",
                      current ? "vol-pencil-edge bg-select-wash font-semibold text-select" : "text-ink-secondary hover:bg-sunken hover:text-ink",
                    )}
                  >
                    <Icon size={16} aria-hidden />
                    {s.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="grid min-w-0 max-w-[880px] content-start gap-5">
          {!me.canManage && me.state === "ready" && !ownTab && (
            <Banner tone="info" title={`Only the owner changes settings. You are ${me.role === "editor" ? "an editor" : "a viewer"}.`}>
              You can read every setting here. Ask the owner to change one.
            </Banner>
          )}
          {/* Settings are the owner's (D-047): for anyone else the fields read but do not change. Appearance is this browser's own,
              and Your account is the caller's own (D-050). */}
          <fieldset disabled={!me.canManage && !ownTab} className="m-0 min-w-0 border-0 p-0">
            {panel()}
          </fieldset>
        </div>
      </div>
    </div>
  );
}
