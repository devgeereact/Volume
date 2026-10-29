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
import { SettingsIconContext } from "./PanelHeader";
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
/* The line under each section's name in the side menu (approved design, .set-i small). */
const hints: Record<SettingsTab, string> = {
  key: "Connection and credit",
  models: "One model per stage",
  budgets: "Spend this month",
  "book-defaults": "Type, trim, paper, length",
  "house-style": "Rules and banned phrases",
  "kdp-rules": "Print, covers, royalties",
  appearance: "Light, dark or system",
  backups: "Backups and project files",
  members: "Who can sign in",
  account: "Your data and membership",
  about: "Versions and sources",
};
/* The side menu's groups, in the approved order. Every tab in screens.ts sits in one group. */
const groups: { label: string; ids: SettingsTab[] }[] = [
  { label: "Workspace", ids: ["key", "models", "budgets"] },
  { label: "Books", ids: ["book-defaults", "house-style", "kdp-rules"] },
  { label: "App", ids: ["appearance", "backups"] },
  { label: "People", ids: ["members", "account", "about"] },
];
const sections = settingsTabs.map((t) => ({ id: t.id, label: t.label, icon: icons[t.id], hint: hints[t.id] }));

function isTab(v: string | undefined): v is SettingsTab {
  return settingsTabs.some((t) => t.id === v);
}

function PanelSkeleton() {
  return (
    <div role="status" aria-label="Loading settings" className="grid gap-5">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3 w-4/5" />
      <div className="grid gap-3 vol-glass rounded-card p-[22px] max-[560px]:p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <div className="grid gap-3 vol-glass rounded-card p-[22px] max-[560px]:p-4">
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
  const HeroIcon = icons[tab];

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
    <div className="grid w-full min-w-0 grid-cols-1 content-start gap-5 px-4 pt-1.5 pb-8 min-[861px]:px-6">
      <PageHeader title="Settings" titleHidden className="sr-only" />
      <div className="grid grid-cols-1 items-start gap-5 min-[861px]:grid-cols-[230px_minmax(0,1fr)] min-[1101px]:grid-cols-[280px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="vol-glass min-w-0 rounded-card p-3.5 max-[860px]:overflow-x-auto max-[860px]:p-2 max-[860px]:[scrollbar-width:none] min-[861px]:sticky min-[861px]:top-[calc(var(--shell-topbar)+12px)]"
        >
          <div className="grid gap-1 max-[860px]:flex">
            {groups.map((g, gi) => {
              const items = shown.filter((s) => g.ids.includes(s.id));
              if (items.length === 0) return null;
              return (
                <div key={g.label} className="grid gap-1 max-[860px]:contents">
                  <p
                    className={cn(
                      "px-2.5 pb-1 text-[11px] leading-4 font-bold tracking-[0.09em] text-ink-3 uppercase max-[860px]:hidden",
                      gi === 0 ? "pt-0.5" : "pt-3",
                    )}
                  >
                    {g.label}
                  </p>
                  <ul className="grid gap-1 max-[860px]:flex">
                    {items.map((s) => {
                      const Icon = s.icon;
                      const current = s.id === tab;
                      return (
                        <li key={s.id} className="flex min-w-0 max-[860px]:flex-none">
                          <NavLink
                            ref={current ? currentRef : undefined}
                            to={s.id === "key" ? "/settings" : `/settings/${s.id}`}
                            end
                            aria-current={current ? "page" : undefined}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-[background-color] duration-(--vol-dur-fast) -outline-offset-2",
                              current ? "bg-panel-2 shadow-control" : "hover:bg-soft",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "grid size-[34px] shrink-0 place-items-center rounded-[11px]",
                                current ? "bg-btn text-on-btn" : "bg-soft text-ink-2",
                              )}
                            >
                              <Icon size={16} strokeWidth={1.8} />
                            </span>
                            <span className="grid min-w-0">
                              <span className="text-[13.5px] leading-5 font-semibold whitespace-nowrap text-ink">{s.label}</span>
                              <span className="truncate text-[11.5px] leading-4 text-ink-3 max-[860px]:hidden">{s.hint}</span>
                            </span>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
        <div className="grid min-w-0 content-start gap-[18px]">
          {!me.canManage && me.state === "ready" && !ownTab && (
            <Banner tone="info" title={`Only the owner changes settings. You are ${me.role === "editor" ? "an editor" : "a viewer"}.`}>
              You can read every setting here. Ask the owner to change one.
            </Banner>
          )}
          {/* Settings are the owner's (D-047): for anyone else the fields read but do not change. Appearance is this browser's own,
              and Your account is the caller's own (D-050). */}
          <fieldset disabled={!me.canManage && !ownTab} className="m-0 min-w-0 border-0 p-0">
            <SettingsIconContext value={<HeroIcon size={26} strokeWidth={1.6} />}>{panel()}</SettingsIconContext>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
