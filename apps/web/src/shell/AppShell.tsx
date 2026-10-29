import { useEffect, useRef, useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useMatch } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "../components/ui/IconButton";
import { getBook } from "../demo/books";
import { cn } from "../lib/cn";
import { dur, ease } from "../lib/motion";
import { useWritingJob } from "../lib/job";
import { useBreakpoint } from "../lib/useMediaQuery";
import { useFocusTrap } from "../lib/useFocusTrap";
import { bookStepPath } from "../screens";
import { CommandPalette } from "./CommandPalette";
import { useSettings } from "../api/hooks";
import { Banner } from "../components/ui";
import { useWorkspaceEvents } from "../api/events";
import { toWiredBook, useApiBooks, useRunningJobs, useWireMode, stepForJob } from "../api/wire-a";
import { ApiJobBar, JobBar } from "./JobBar";
import { Spine } from "./Spine";
import { NotConnectedBanner } from "./NotConnectedBanner";
import { TopBar } from "./TopBar";
import { useKeyChanged } from "../lib/useKeyChanged";

/** The frost sky and hills behind the whole app (navy at night). Decorative, fixed, drawn once. */
function Scene() {
  return (
    <div aria-hidden className="vol-scene">
      <svg viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" focusable="false">
        <path
          className="vol-hill-back"
          d="M0 330 L120 250 L210 290 L330 170 L450 260 L560 200 L700 120 L820 230 L930 180 L1060 260 L1180 150 L1300 240 L1440 190 L1440 600 L0 600Z"
        />
        <path
          className="vol-hill-mid"
          d="M0 400 L140 320 L260 380 L400 290 L520 360 L660 300 L780 380 L900 320 L1040 390 L1180 310 L1320 370 L1440 330 L1440 600 L0 600Z"
        />
        <path className="vol-hill-front" d="M0 470 L180 420 L340 470 L520 430 L700 480 L880 440 L1060 490 L1240 440 L1440 480 L1440 600 L0 600Z" />
      </svg>
    </div>
  );
}

/**
 * App shell from docs/03-design/DESIGN-SYSTEM.md, in the frost and glass look (studio redesign, stage 1):
 * a frosted side menu that floats 16 px from the window edges (240 px, or 64 px inside a book and on
 * tablets, a drawer on phones), a glass top bar, the screen, and the job bar while a job runs elsewhere.
 * The document scrolls; the side menu, top bar and job bar stay put. Screens with their own panes can use
 * the h-screen-fill utility for the space between the top bar and the job bar.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const bp = useBreakpoint();
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
  const apiBooks = useApiBooks(api);
  const demoBook = getBook(bookId);
  const apiRow = api && inBook && !demoBook ? apiBooks.data?.find((b) => b.id === bookId) : undefined;
  const book = demoBook ?? (apiRow ? toWiredBook(apiRow) : undefined);
  const demoJob = useWritingJob();
  const { job } = demoJob;
  // The demo writing job belongs to demo mode only, never to a server workspace (or while checking).
  const running = demoJob.running && mode === "mock";
  const serverJobs = useRunningJobs(api);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(drawerRef, drawerOpen);

  const phone = bp === "phone";
  const collapsed = bp === "tablet" || Boolean(book) || (api && inBook);
  const onLibrary = pathname === "/library";
  const onJobScreen = pathname.startsWith(bookStepPath(job.bookId, "writing"));
  // A server job's bar hides on the Library (its own live line) and on the screen that shows that job.
  const serverJob = serverJobs.find((j) => j.status === "failed" || !pathname.startsWith(bookStepPath(j.bookId, stepForJob(j.kind))));
  const showApiJobBar = api && !onLibrary && serverJob !== undefined;
  const showJobBar = (running && !onLibrary && !onJobScreen) || showApiJobBar;

  useEffect(() => {
    document.documentElement.setAttribute("data-jobbar", showJobBar ? "on" : "off");
  }, [showJobBar]);

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
    <div className={cn("isolate grid min-h-dvh", phone ? "grid-cols-1" : "grid-cols-[auto_minmax(0,1fr)]")}>
      <Scene />
      <a
        href="#main"
        className="fixed top-2 left-2 z-[80] -translate-y-20 rounded-sm bg-raised px-4 py-2 text-label font-semibold text-ink shadow-pop focus:translate-y-0"
      >
        Skip to content
      </a>

      {!phone && (
        <div className="sticky top-0 h-dvh py-(--vol-shell-inset) pl-(--vol-shell-inset)">
          <Spine collapsed={collapsed} book={book} />
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <TopBar phone={phone} onOpenMenu={() => setDrawerOpen(true)} menuButtonRef={menuButtonRef} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <NotConnectedBanner className="mx-6 mt-4" />
          {anthropicEmpty && (
            <Banner tone="attention" title="Anthropic credit has run out" className="mx-6 mt-4">
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
        {showApiJobBar && serverJob ? <ApiJobBar job={serverJob} more={serverJobs.length - 1} /> : showJobBar && <JobBar />}
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
              <Spine collapsed={false} book={book} variant="drawer" onNavigate={() => setDrawerOpen(false)} />
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
