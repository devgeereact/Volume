import { useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, ScrollRestoration, useLocation, useMatch } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "../components/ui/IconButton";
import { workspace } from "../demo/workspace";
import { cn } from "../lib/cn";
import { dur, ease } from "../lib/motion";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useFocusTrap } from "../lib/useFocusTrap";
import { CommandPalette } from "./CommandPalette";
import { useSettings } from "../api/hooks";
import { Banner } from "../components/ui";
import { useWorkspaceEvents } from "../api/events";
import { useWireMode } from "../api/wire-a";
import { Spine } from "./Spine";
import { NotConnectedBanner } from "./NotConnectedBanner";
import { TopBar } from "./TopBar";
import { useKeyChanged } from "../lib/useKeyChanged";

/** The misty mountain scene behind the whole app (approved design, frost edition). Decorative, fixed, drawn once. */
function Scene() {
  return (
    <div aria-hidden className="vol-scene">
      <svg viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" focusable="false">
        <path
          className="vol-m3"
          d="M0 330 L120 250 L210 290 L330 170 L450 260 L560 200 L700 120 L820 230 L930 180 L1060 260 L1180 150 L1300 240 L1440 190 L1440 600 L0 600Z"
        />
        <path
          className="vol-m2"
          d="M0 400 L140 320 L260 380 L400 290 L520 360 L660 300 L780 380 L900 320 L1040 390 L1180 310 L1320 370 L1440 330 L1440 600 L0 600Z"
        />
        <path className="vol-m1" d="M0 470 L180 420 L340 470 L520 430 L700 480 L880 440 L1060 490 L1240 440 L1440 480 L1440 600 L0 600Z" />
      </svg>
    </div>
  );
}

/** The foot pill under every screen but a book's: where the data comes from and the rule versions. */
function Foot() {
  const mode = useWireMode();
  const settings = useSettings({ enabled: mode === "api" });
  const parts: ReactNode[] = [];
  if (mode === "mock") {
    parts.push(
      <span key="demo">
        <b className="font-semibold text-ink">Volume</b>, on demo data
      </span>,
      <span key="kdp">KDP rules {workspace.kdpRules.version}</span>,
      <span key="style">House style v{workspace.houseStyle.version}</span>,
    );
  } else if (mode === "api") {
    parts.push(
      <span key="v">
        <b className="font-semibold text-ink">Volume</b>
      </span>,
    );
    if (settings.data?.kdpRulesVersion) parts.push(<span key="kdp">KDP rules {settings.data.kdpRulesVersion}</span>);
    if (settings.data?.houseStyleVersion !== null && settings.data?.houseStyleVersion !== undefined)
      parts.push(<span key="style">House style v{settings.data.houseStyleVersion}</span>);
  }
  if (parts.length === 0) return null;
  return <footer className="flex flex-wrap gap-x-[18px] gap-y-1.5 px-4 pt-2 pb-[22px] text-caption font-normal text-ink-2 min-[861px]:px-6">{parts}</footer>;
}

/**
 * App shell from the approved design (Volume Studio, frost edition): the misty scene behind everything,
 * the labelled side menu card that floats 16 px from the window edges (a drawer on phones, under 861 px),
 * the top bar, the screen and the foot line. The document scrolls; the side card and top bar stay put.
 * The status box at the foot of the side card replaced the bottom live bar: it shows what is running,
 * with Pause and Resume, and a failed job's notice. Screens with their own panes can use h-screen-fill.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const wide = useMediaQuery("(min-width: 861px)");
  const reduce = useReducedMotion();
  const bookMatch = useMatch("/books/:bookId/*");
  const mode = useWireMode();
  const api = mode === "api";
  const bookId = bookMatch?.params.bookId;
  const inBook = Boolean(bookId && bookId !== "new");
  // The book layout opens its own book stream; outside a book the workspace stream keeps lists and jobs fresh.
  useWorkspaceEvents({ enabled: api && !inBook });
  const settings = useSettings({ enabled: api });
  const anthropicEmpty = settings.data?.anthropic?.configured === true && settings.data.anthropic.outOfFundsAt !== null;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(drawerRef, drawerOpen);

  const phone = !wide;

  // The drawer closes on navigation and when the window grows past phone size.
  const pathChanged = useKeyChanged(pathname);
  if (drawerOpen && (pathChanged || !phone)) setDrawerOpen(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className={cn("isolate grid min-h-dvh", phone ? "grid-cols-1" : "grid-cols-[var(--vol-side)_minmax(0,1fr)]")}>
      <Scene />
      <a
        href="#main"
        className="fixed top-3 left-3 z-[80] -translate-y-20 rounded-md bg-btn px-3.5 py-2 text-label font-semibold text-on-btn focus:translate-y-0"
      >
        Skip to content
      </a>

      {!phone && (
        <div className="sticky top-4 my-4 ml-4 h-[calc(100dvh-32px)]">
          <Spine />
        </div>
      )}

      <div className="flex min-h-dvh min-w-0 flex-col">
        <TopBar phone={phone} onOpenMenu={() => setDrawerOpen(true)} menuButtonRef={menuButtonRef} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <NotConnectedBanner className="mx-4 mt-4 min-[861px]:mx-6" />
          {anthropicEmpty && (
            <Banner tone="attention" title="Anthropic credit has run out" className="mx-4 mt-4 min-[861px]:mx-6">
              Volume is using OpenRouter for Claude models until you top up at{" "}
              <a
                href="https://console.anthropic.com/settings/billing"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-select underline underline-offset-2"
              >
                console.anthropic.com
              </a>
              . Nothing is stopped.
            </Banner>
          )}
          <Outlet />
        </main>
        {!inBook && <Foot />}
      </div>

      <AnimatePresence>
        {phone && drawerOpen && (
          <div className="fixed inset-0 z-50">
            <motion.div
              aria-hidden
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: dur.base } }}
              exit={{ opacity: 0, transition: { duration: dur.fast } }}
              onClick={() => setDrawerOpen(false)}
            >
              <div className="absolute inset-0 bg-scrim" style={{ opacity: "var(--vol-scrim-opacity)" }} />
            </motion.div>
            <motion.div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 left-0 flex"
              initial={reduce ? { opacity: 0 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0, transition: { duration: dur.slow, ease: ease.out } }}
              exit={reduce ? { opacity: 0 } : { x: "-100%", transition: { duration: dur.base, ease: ease.in } }}
            >
              <Spine variant="drawer" onNavigate={() => setDrawerOpen(false)} className="w-[272px]" />
              <IconButton icon={X} label="Close menu" variant="glass" onClick={() => setDrawerOpen(false)} className="mt-3 ml-3" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CommandPalette />
      <ScrollRestoration />
    </div>
  );
}
