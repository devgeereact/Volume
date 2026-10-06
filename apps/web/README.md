# apps/web: the Volume app screens

Vite, React, TypeScript strict, React Router, Tailwind v4, motion/react and TanStack Query. Moved here from `prototype/` on 5 October 2026. Talks only to `apps/server` over `/api/v1` (client in `src/api/`, see its README); never holds an API key. When the server is off, screens fall back to the demo data in `src/data/`. Dev and preview both run on 127.0.0.1:5180; the server owns 5181.

## Live and demo modes

The app has API-backed screens and a demo fallback. It began as the phase 0 prototype. It follows the fused Volume direction (D-014): `docs/08-DESIGN-GUIDE.md`, the tokens in `packages/ui`, and the board at `design/final/volume-direction.html`. Its shared components now support the built application.

The shell shows a "Demo data" badge in fallback mode. API mode uses the local server for stored books, jobs and exports. The browser never reads the key or calls OpenRouter directly.

## Run it

From the repository root:

```sh
npm install                      # once; installs the workspaces
npm run dev -w apps/web         # http://127.0.0.1:5180 (strict port, 127.0.0.1 only)
npm run typecheck -w apps/web   # tsc --noEmit, TypeScript strict
npm run build -w apps/web       # typecheck, then vite build into apps/web/dist
npm run preview -w apps/web     # serves the build on http://127.0.0.1:5180
npm run screenshot -w apps/web  # see below
npm run smoke -w apps/web       # walks the main flow, fails on console errors (see below)
```

The dev server is `vite` on 127.0.0.1:5180 with `strictPort`, so it stops with an error rather than moving to another port. This project never uses ports 5173 to 5175. Stop the dev server (Ctrl C) when you finish.

Run `npm run lint` and `npm run format:check` from the repository root. ESLint and Prettier are installed (D-023).

**Workspaces.** Root package.json lists packages/ui, packages/core, packages/ai, packages/export, apps/server and apps/web. The web app imports shared tokens and theme from @volume/ui.

### Screenshots

```sh
npm run screenshot -w apps/web                                  # every route (21, see below)
npm run screenshot -w apps/web -- /library /components          # chosen routes
npm run screenshot -w apps/web -- --no-build /books/handover/writing
```

`scripts/screenshot.mjs` builds the app (skip with `--no-build`), starts its own `vite preview` on 127.0.0.1:5182 (strict, it refuses to run if the port is busy and never uses another one), visits each route in light and dark at 1440 x 900 and 390 x 844, and saves full-page PNGs to `apps/web/screenshots/` (git-ignored) as `<route>-<theme>-<width>.png`. It prints console errors and horizontal overflow (the element where the overflow starts), stops the server, and exits 1 if any route had either.

The default list is every screen plus a few states: `/library`, `/library?view=ledger`, `/profiles`, `/profiles/harni-muharami`, `/profiles/new`, `/books/new`, `/new-book` (redirect), `/books/night-shift-survival/research` (running), `/books/the-calm-ward/research`, `/books/the-calm-ward/titles`, `/books/the-calm-ward/blueprint`, `/books/handover/writing`, `/books/the-new-charge-nurse/editor`, `/books/speaking-up-safely/cover`, `/books/sourdough-on-a-weeknight/export`, `/books/handover/marketing`, `/settings`, `/settings/models`, `/archive`, `/components` and `/nope` (not found). `SCREENSHOT_PORT` and `SCREENSHOT_OUTDIR` change the port and build folder when two runs must not collide.

Full-page shots show the sticky job bar where the first viewport ends, part way down long pages. That is how Chromium captures sticky elements, not a layout bug.

### Smoke test

```sh
npm run smoke -w apps/web                  # builds, then walks the flow
npm run smoke -w apps/web -- --no-build    # reuse apps/web/dist
npm run smoke -w apps/web -- --headed      # watch it run
```

`scripts/smoke.mjs` starts its own `vite preview` on 127.0.0.1:5182 (`SMOKE_PORT` to change; strict, refuses a busy port), runs Chromium at 1440 x 900 and walks: Library, open The Calm Ward, Research, Titles (choose a title), Blueprint (select chapter 4, Approve dialog, approve), Writing (pause, resume), Editor (select text, Expand, Accept), Cover (page count changes the spine width), Export (royalty calculator), Marketing (Copy shows a toast), Settings (theme to dark), and the command menu (Ctrl K, type, Enter, then Escape). It prints PASS or FAIL per step, fails on any console error, stops the server and exits 1 on failure. Screenshot and smoke both use 5182, so run them one after the other.

## Folder map

```
apps/web/
  index.html               theme set before first paint (same rule as src/lib/theme.tsx)
  vite.config.ts           React, Tailwind v4 (@tailwindcss/vite), ports
  scripts/screenshot.mjs   Playwright screenshots, own preview server on 5182
  scripts/smoke.mjs        Playwright walk through the main flow, own preview server on 5182
  src/
    main.tsx, App.tsx      providers and the router (every route is listed in App.tsx)
    screens.ts             every screen: title, purpose line, route, owner, empty state, icon
    styles/app.css         imports tailwindcss + @volume/ui tokens and theme, base layer, cover, caret, nib
    styles/fonts.css       self-hosted Fontsource files under the token family names
    components/ui/         shared components, one per file, index.ts re-exports them
    data/                  typed mock data (index.ts re-exports everything)
    lib/                   hooks and providers: theme, toast, job, pen name, command menu, focus trap, format, motion
    shell/                 app shell: Spine, TopBar, CommandPalette, JobBar, BookLayout, ScreenPlaceholder, NotFound
    routes/<screen>/       one folder per screen (see ownership)
```

## Historical screen ownership

The three screen agents have finished. Since the integration pass (4 October 2026) one owner holds the whole of `apps/web/`; the table below is kept for the next time screens are built in parallel.

| Owner | Folders under `src/routes/` | Screens |
|---|---|---|
| Agent A | `library/`, `profiles/`, `settings/`, `archive/` | Library, Profiles, Profile editor, Settings, Archive |
| Agent B | `new-book/`, `research/`, `titles/`, `blueprint/` | New book wizard, Research, Titles, Blueprint |
| Agent C | `writing/`, `editor/`, `cover/`, `export/`, `marketing/` | Writing, Editor, Cover studio, Export, Marketing |
| Foundation | everything else in `src/` (`components/ui`, `shell`, `lib`, `data`, `styles`, `App.tsx`, `screens.ts`), `scripts/` | Shell, shared components, mock data, style guide (`routes/components/`) |

Rules:

- Each screen agent edits only its own route folders. Screen-only components go in that folder (for example `routes/blueprint/OutlineRail.tsx`).
- Keep the default export of each page file; `App.tsx` imports it.
- Need a change to a shared component, the shell or the data? Ask the foundation owner, or add a new file in your folder and say so in your report. Do not fork a shared component.
- New mock data that only one screen needs can live in that screen's folder; data two screens share belongs in `src/data/`.

## Routes

| Route | Screen | File |
|---|---|---|
| `/` and `/library` | Library (covers view; `?view=ledger` for the ledger table) | `routes/library/LibraryPage.tsx` |
| `/published` | Published shelf: books live on Amazon, grouped by month, with formats, list prices and dates | `routes/published/PublishedPage.tsx` (foundation) |
| `/profiles` | Profiles | `routes/profiles/ProfilesPage.tsx` |
| `/profiles/:profileId` (`/profiles/new` to add) | Profile editor (tabs Identity, Voice DNA, Publishing defaults, Models, Memory) | `routes/profiles/ProfileEditorPage.tsx` |
| `/books/new` | New book wizard | `routes/new-book/NewBookPage.tsx` |
| `/new-book` | Redirects to `/books/new` | `App.tsx` |
| `/books/:bookId` | Opens the book at its current step | `routes/books/BookIndexRedirect.tsx` |
| `/books/:bookId/research` | Research | `routes/research/ResearchPage.tsx` |
| `/books/:bookId/titles` | Titles | `routes/titles/TitlesPage.tsx` |
| `/books/:bookId/blueprint` | Blueprint | `routes/blueprint/BlueprintPage.tsx` |
| `/books/:bookId/writing` | Writing | `routes/writing/WritingPage.tsx` |
| `/books/:bookId/editor/:sectionId?` | Editor | `routes/editor/EditorPage.tsx` |
| `/books/:bookId/cover` | Cover studio | `routes/cover/CoverPage.tsx` |
| `/books/:bookId/export` | Export | `routes/export/ExportPage.tsx` |
| `/books/:bookId/marketing` | Marketing | `routes/marketing/MarketingPage.tsx` |
| `/settings/:tab?` | Settings, see the tabs below | `routes/settings/SettingsPage.tsx` |
| `/archive` | Archive | `routes/archive/ArchivePage.tsx` |
| `/components` | Living style guide, both themes | `routes/components/ComponentsPage.tsx` |
| anything else | Page not found | `shell/NotFound.tsx` |

Settings tabs, in screen order (`settingsTabs` in `screens.ts`; Settings, the breadcrumbs and this table read it). `/settings` opens the first one; the others are `/settings/<id>`, and an unknown id redirects to `/settings`.

| Id | Label |
|---|---|
| `key` | OpenRouter |
| `models` | Models |
| `budgets` | Budgets |
| `book-defaults` | Book defaults |
| `appearance` | Appearance |
| `backups` | Data and backups |
| `house-style` | House style |
| `kdp-rules` | KDP rules |
| `about` | About |

Several screens take `?state=loading`, `?state=empty` or `?state=error` to show their other states (a "Prototype only" control at the foot of the screen sets it).

Book ids (13, each with its own interior theme and cover style): `milo-and-the-moon-kite` (Tobi Rhymes, idea), `night-shift-survival` (Harni, research), `the-calm-ward` (Harni, blueprint), `handover` (Harni, writing, the running job), `the-new-charge-nurse` (Harni, editing), `the-ninth-lock` (J. R. Kade, editing), `speaking-up-safely` (Harni, cover), `ai-for-absolute-beginners` (Gideon, cover), `sourdough-on-a-weeknight` (Gideon, export, demo book), `summer-at-gull-cottage` (Elena Marsh, published), `pip-and-the-sleepy-stars` (Tobi Rhymes, published), `the-honest-side-hustle` (Gideon, published), `windowsill-herbs` (Gideon, published, demo book).

Profile ids (from `config/profiles/`): `gideon-akinlotan`, `harni-muharami`, `elena-marsh`, `tobi-rhymes`, `jr-kade`. The old `ada-fenwick` and `sam-rowe` no longer exist.

## How a screen is built

Every page starts as `<ScreenPlaceholder screen="..." />` (title, purpose line, empty state). Replace it with the real screen. A typical book screen:

```tsx
import { useBook } from "../../lib/useBook";
import { NotFound } from "../../shell/NotFound";
import { calmWardBlueprint } from "../../data";
import { Button, Inspector, InspectorSection, PageHeader, StageTrack } from "../../components/ui";

export default function BlueprintPage() {
  const { book, penName } = useBook();
  if (!book) return <NotFound what="book" />;
  return (
    <div className="grid h-screen-fill grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)_auto]">
      {/* outline rail, galley sheet, Inspector with footer actions */}
    </div>
  );
}
```

Layout notes:

- The shell is a grid: spine (240 px; 64 px inside a book and on tablets; a drawer on phones), then a column with the 56 px top bar, `<main>` and the job bar. The document scrolls.
- **Book screens (D-016).** Every `/books/:bookId/<step>` route renders inside `shell/BookLayout.tsx`, which adds, once: the **book bar** (56 px: mini cover, and on wide screens the title and profile, then `BookSteps`) above the screen, and the **StepFooter** (64 px: "Back: <previous step>", "Step n of 8", "Next: <next step>") below it. Do not render your own step bar, stage track, mini cover row, breadcrumb or "Library" back link.
- **Your screen's main action goes in the footer.** Call `useStepAction({ label: "Approve blueprint", onClick, estimate, disabledReason })` (from `lib/stepAction`) and the footer's Next becomes that gilt button, with a quiet "Skip to <next step>" link beside it. Then remove the screen's own copy of that primary button, so there is one gilt button per screen. Pass `to` instead of `onClick` for a link. Pass null (or do not call it) to keep the plain "Next: <step>" link. Only label, link, estimate and disabled reason trigger an update; the click handler can change every render.
- For screens with their own scrolling panes (Blueprint, Writing, Editor), use `h-screen-fill` (or `min-h-screen-fill`): the height between the top bar (and book bar) and the step footer (and job bar). They are Tailwind `@utility` rules, so variants work: `lg:h-screen-fill`, `xl:min-h-screen-fill`. CSS variables: `--shell-topbar`, `--shell-bookbar`, `--shell-stepfooter`, `--shell-jobbar` (the book ones are 0 outside a book; `data-book="on"` on `<html>` switches them on).
- **Navigation (D-016).** Left nav: Library, Published, Profiles, New book, Archive, Settings (`globalNav` in `screens.ts`; the command menu reads it too). No book steps in the spine. Breadcrumbs: Library, then the book title only. One global search: the top bar (Cmd K or Ctrl K). Page-level lists use `FilterField` (labelled "Filter"), never a second search box. One small "Demo" badge in the top bar; screens do not add their own demo strips.
- Page padding: `px-4 sm:px-8 lg:px-10`, `py-6 lg:py-7`. Grids that hold wide content need `grid-cols-1` (or `minmax(0,1fr)`) so they do not overflow on phones.
- One `h1` per screen (`PageHeader`, or `titleHidden` when the book title is the visual heading). One gilt `variant="primary"` button per screen.

## Styling conventions

- **Tokens only.** Colours, type, radii, shadows and motion come from `@volume/ui`. `theme.css` clears Tailwind's defaults, so only Volume tokens exist: `bg-canvas`, `bg-sheet`, `bg-sunken`, `bg-raised`, `bg-spine`, `text-ink`, `text-ink-secondary`, `text-ink-tertiary`, `border-border`, `border-border-strong`, `bg-accent text-on-accent`, `text-accent-text`, `bg-accent-wash`, `bg-progress`, `text-select`, `bg-select-wash`, `text-claim`, `bg-claim-wash`, `text-success`, `bg-success-wash`; type `text-display`, `text-title`, `text-figure`, `text-heading`, `text-subhead`, `text-body`, `text-label`, `text-small`, `text-caption`, `text-prose`, `text-prose-sm`; fonts `font-book` (Literata), `font-ui` (Schibsted Grotesk), `font-mono` (JetBrains Mono, model IDs and keys only); radii `rounded-xs/sm/md/lg/pill/cover`; shadows `shadow-button/sheet/pop/modal/cover`; durations `duration-(--vol-dur-fast|base|slow)`; easing `ease-out`, `ease-in`, `ease-page`; animations `animate-page-turn`, `animate-ink-fill`, `animate-ink-in`, `animate-pencil`, `animate-pencil-x`.
- **Figures.** `.num` gives lining figures. Schibsted Grotesk's tabular figures also space out commas and full stops ("21 ,340"), so `.num` stays proportional in the interface font and is tabular inside Literata. Use `.tnum` only for columns that must line up.
- **Helpers in `styles/app.css`:** `h-screen-fill`, `min-h-screen-fill` and `hit-44` (44 px hit area for compact controls) are `@utility` rules and take variants (`lg:`, `xl:`, `sm:hit-44`); `print-indent` (indent paragraphs after the first), `vol-pencil-edge` (blue pencil stroke on the selected item), `vol-claim-mark`, `vol-caret`, `vol-nib`, `opsz-display`, `opsz-title`.
- **`cn()` joins, it does not merge.** `lib/cn.ts` only joins class names and skips falsy values; there is no tailwind-merge (no new package). A `className` you pass to a shared component is added after the component's own classes, and when two utilities set the same property Tailwind's stylesheet order decides, not the order in the string. So a conflicting override may not win. To override: use the component's prop when there is one (`Inspector width`, `Button fullWidth`, `Switch nowrap`); otherwise add Tailwind's important modifier at the end of the class (`w-full!`, `lg:border-l-0!`); or wrap the component in an element you style. Avoid passing a second value for something the component already sets unless you use one of these.
- **Icons:** `lucide-react`. `LucideProvider` sets 18 px and stroke 1.75; use 16 px inline and 14 px with stroke 2 in chips. Icons are `aria-hidden`; icon-only buttons use `IconButton` (label and tooltip).
- **Motion:** `motion/react` with presets from `lib/motion.ts` (`popover`, `dialog`, `scrim`, `fadeOnly`, `inkIn`, `dur`, `ease`). Transform and opacity only. `MotionConfig reducedMotion="user"` is set at the root; check `useReducedMotion()` for anything that moves on its own.
- **Copy:** plain British English, sentence case, no em dashes, none of the AGENTS.md avoid words, cost before the click ("about $0.04"), dates as "4 October 2026" (`lib/format.ts`). AI money is in dollars, KDP money in pounds.

## Shared components (`src/components/ui`)

| Component | Use |
|---|---|
| `Button` | `variant` primary (gilt, one per screen), secondary, ghost (the guide's quiet), danger; `size` sm, md, lg; `icon`, `iconRight`, `estimate` ("about $0.04"), `loading` with `loadingLabel` (keeps width), `disabledReason` (focusable, tooltip says why), `fullWidth` |
| `IconButton` | `icon`, `label` (required), `variant` secondary, ghost, spine; `size` md (44) or sm (32 with 44 hit area); `pressed`; `shortcut`; `disabledReason` (aria-disabled, stays focusable, the tooltip adds the reason) |
| `Input`, `Textarea` | `label`, `hint`, `error`, `disabledReason`; Input `icon`, `maxCount`; Textarea `prose` (Literata), `showWordCount` |
| `Select` | custom listbox: `label`, `options` ({value, label, hint}), `value`, `onChange`. Arrow keys pressed while the list opens are queued and applied once it has focus |
| `Checkbox`, `Switch` | `label`, `description`, `checked`, `onChange(checked)`. Switch labels wrap; pass `nowrap` for a short label in a toolbar |
| `Tabs` | `label`, `idBase`, `items` ({id, label, count, countTone: "claim"}), `value`, `onChange`; pair panels with `tabPanelProps(idBase, id)` |
| `SegmentedControl` | radio group with a sliding thumb (Covers or Ledger) |
| `Chip` | filter chip: `pressed`, `count` |
| `StatusChip` | `status` writing, attention, claim, passed, queued, locked, demo; children override the word |
| `StageChip` | `stage` (any of the nine stages), `live` |
| `StageTrack` | `current`, `loading`, `stages`, `hrefFor(stage)` (makes links with arrow keys), `compact` |
| `ProgressBar` | `value`, `max`, `label`, `valueText`, `live` (gilt nib), `size` thin, `tone` spine |
| `ChapterBars` | `segments` ({state: done, current, queued; progress}) |
| `Card` | `as`, `padding`, `tone`, `selected` |
| `Inspector`, `InspectorSection` | right panel with optional `footer` and `width` (any CSS length from 1024 px up, default the 320 px token; `"100%"` when the grid column sets it). Its scroll area is `relative`, so `.sr-only` text inside never lengthens the page. Sections with `title`, `icon`, `tone` claim or attention, `aside` |
| `KeyValueList`, `Figure` | key and value rows; big Literata number with a unit |
| `Modal` | `open`, `onClose`, `title`, `description`, `footer`, `initialFocus`, `size`; focus trap, Escape, focus returns |
| `Toast` | presentational; show one with `useToast().show({ tone, title, body, action })` |
| `Tooltip` | wraps a focusable trigger: `content`, `side`, `shortcut` |
| `EmptyState` | `title`, `body`, `action`, `drawing` (books, pen, search, box, archive, page), `headingLevel` |
| `Skeleton` | `variant` line, block, cover, circle; wrap groups in `role="status"` with a label |
| `Banner` | `tone` error, attention, success, info; `title`, `action` |
| `ModelPicker`, `ModelPickerRow` | radio table of models with example prices; `modelPrice(model)`. Long slugs wrap (never cut off) and carry the full slug in `title` |
| `Cover` | typographic cover from `book.cover` data: `title`, `subtitle`, `author`, `design` (null draws "No cover yet"), `width`, `lift` (needs a `group` ancestor), `hideSubtitle`, `decorative`. Designs come from `config/cover-styles.json` through `coverFromStyle(styleId, paletteId, titleLines, overrides)` in `data/covers.ts`: 16 OFL title faces (`CoverTypeface`), 16 motifs (`CoverMotif`), plus optional `align`, `titleTracking`, `accentFamily`, `authorStyle`, `frame` and `band`. Hand-built designs (Cover studio concepts) still work |
| `BookSteps` | the one step bar for a book: `book`, `current` (the page you are on, highlighted with the pencil underline and `aria-current="page"`), `runningBookId`. Markers show each step's state from the book (done, in progress, needs attention, not started). The shell renders it; screens do not |
| `FilterField` | page filter, 44 px, filter icon, clear button, Escape clears: `value`, `onChange`, `label` (default "Filter", screen-reader only unless `showLabel`), `placeholder`, `count` (announced as "4 shown") |
| `ModelName` | friendly model name with the exact slug in a tooltip: `slug`, `withProvider`. Use it (or `formatModel`) wherever a model is named; never print raw slugs or the "~" prefix. `KeyValueList` items with `mono: true` and a slug value render through it automatically |
| `buttonClasses(variant, size)` | classes that make a router `Link` look like a `Button` (StepFooter, Published shelf) |
| `ClaimFlag`, `ClaimMark` | proof red flag with count; wavy underline on a claim sentence |
| `OutlineItem` | numbered outline row, at least 44 px tall: `current` (blue pencil), `claims`, `meta`, `subheadings`, `to` or `onSelect` |
| `GalleySheet`, `MarginNote` | the white page with meta line; margin notes kind profile, selection, claim |
| `StreamText` | ink-in streamed chunks with the gilt caret (`aria-live="off"`). Chunks reset `text-indent`, so inside `print-indent` only the paragraph's first line is indented |
| `PageHeader` | the screen's h1, summary and actions |
| `Kbd`, `modKey()`, `Loader`, `LiveDot` | keys, ⌘ or Ctrl, pen-stroke loader, gilt live dot |

See every one in both themes at `/components`.

## Hooks and providers (`src/lib`)

- `useBook()`: the book and pen name for `/books/:bookId/...`.
- `useStepAction(action)` (`lib/stepAction.tsx`): register the screen's main action as the footer's Next button (see Layout notes).
- `useWritingJob()`: the mock Handover job: `job`, `running`, `paused`, `chunksShown`, `wordsWritten`, `chapterWords`, `costSpent`, `progress`, `chapterProgress`, `pause()`, `resume()`, `cancel()`. The job bar, spine and command menu read it, so pausing anywhere pauses everywhere.
- `useToast()`: `show({ tone: "success" | "attention" | "error", title, body, action, persist })`. Toasts are for background work that finished elsewhere.
- `useTheme()`: `theme`, `preference`, `setTheme`, `followSystem`, `toggle`. Saved in localStorage as `volume.theme`, follows the system when unset.
- `usePenNameFilter()`: the spine's pen name switcher (`selectedId`, null for all).
- `useCommandPalette()`: `open`, `setOpen`, `toggle`. Cmd K or Ctrl K opens it anywhere.
- `useBreakpoint()`: phone, tablet or laptop (640 and 1024 px).
- `lib/format.ts`: `formatModel(slug)` ("Claude Sonnet (latest)") and `describeModel(slug)` (`name`, `provider`, `slug`, `latestAlias`), `formatGbp` ("£8.99", KDP prices), `formatMonthYear`, `formatNumber`, `formatUsd`, `formatDate`, `formatDayMonth`, `formatTime`, `formatRelative` (relative to the demo's today, 4 October 2026), `formatDuration`, `formatWordsOf`, `formatPerMillion`, `formatContext`.

## Mock data (`src/data`, import from `../../data`)

| Module | Exports |
|---|---|
| `types.ts` | all the types (Book, PenName, Blueprint, ResearchRun, TitleOption, WritingJob, ModelInfo, ExportState, MarketingPack and more) |
| `config.ts` | Typed imports of the repository's `config/` (alias `@config`, set in `vite.config.ts` and `tsconfig.json`): `profiles`, `getProfile`, `bookTypes`, `bookCategories`, `getBookType`, `bookTypesIn`, `interiorThemes`, `getInteriorTheme`, `coverStyles`, `getCoverStyle`, and the types `AuthorProfile`, `BookType`, `InteriorTheme`, `CoverStyle`. TypeScript checks each JSON file against these types at typecheck; union fields are checked at load and throw a clear error |
| `covers.ts` | `coverFromStyle(styleId, paletteId, titleLines, overrides)` |
| `penNames.ts` | `penNames`, `getPenName`, built from `config/profiles/*.json`. The `PenName` shape is unchanged for screens (`voice` is readable lines); the full record is `penName.profile` (structured voice, publishing defaults, per-stage models, status). Real people (Gideon, Harni) have `bioStatus: "sample-owner-to-confirm"`; pen names have `"pen-name"` |
| `books.ts` | `books` (13), `getBook`, `booksForPenName`, `publishedBooks` (newest first), `stageOrder`, `stageLabels`, `libraryColumns`, `bookSteps`, `stepState`, `currentStep`, `activity` (Today strip), `DEMO_NOW` |
| `blueprint.ts` | `calmWardBlueprint`: title, subtitle, summary, audience, USPs, tone notes, word targets, front matter, 10 chapters with subheadings, summaries and targets, back matter, Amazon description, 3 categories, 7 keywords, 3 claims, margin notes, versions, cost |
| `research.ts` | `calmWardResearch` (6 mock sources on example.org, labelled "example source"), `nightShiftResearchStatus` |
| `titles.ts` | `topicDirections` (5), `titleOptions` (10, one invalid to show the greyed state), `titleLength`, `TITLE_SUBTITLE_MAX` |
| `writingJob.ts` | `handoverJob`: 12 sections, chapter 6 streaming, checks on chapter 5, needs attention |
| `models.ts` | `models` with example prices, `stageDefaults` (from `config/models.defaults.json`), `getModel`, `examplePricesNote` |
| `exportPack.ts` | `sourdoughExport`: preflight (2 warnings), formats, royalty lines with `config/kdp-rules` rule ids |
| `marketing.ts` | `handoverMarketing`: 3 TikTok scripts with hooks, 2 Instagram captions, 1 launch email |
| `workspace.ts` | `workspace` (OpenRouter status, October spend $4.82 of $40, backups in `~/Projects/volume/data/backups` as in `docs/02-ARCHITECTURE.md`, house style, KDP rules), `archivedItems` |

Rules for mock data: realistic, British English, no lorem ipsum, no invented statistics, studies, quotes or reviews; sources are example.org placeholders marked mock; prices are labelled example prices.

## Known gaps and deliberate differences

- Book-content fonts (16 OFL families for covers and interior themes) are installed from Fontsource and loaded in `styles/book-fonts.css` (Latin only). The list and licences are in `assets/fonts/README.md`. The interface still uses only Literata, Schibsted Grotesk and JetBrains Mono.
- The top bar (breadcrumb, search, demo badge, theme) is not on the board; it was asked for in the prototype brief. It holds the only search (D-016).
- Screenshots go to `apps/web/screenshots/` (this brief) rather than `test-results/screens/` (the frontend agent file).
- No ESLint or Prettier yet (needs approval). No unit tests; typecheck, the screenshot script and the smoke script are the checks.
- Deferred prototype items (shared helpers still in screen folders, blueprint data, claim marks in editable text, cover fonts, lint, real TipTap, zip and server) are listed as K-P01 to K-P06 in `KNOWN-ISSUES.md`.

## Route follow-ups for the screen agents (round 2, D-016)

The foundation (shell, shared components, data) is done. These duplicates and stale bits are still inside route files, which the foundation does not edit:

- **Second step bar:** `blueprint/BlueprintPage.tsx:355` renders its own `StageTrack`; delete it. `cover/CoverPage.tsx:189` has a "Cover steps" sub-stepper (brief, concepts, choose, build); turn it into status text or section headings, not a second stepper.
- **Page-level Library links:** `blueprint/OutlineRail.tsx:99` and `writing/SectionList.tsx:33` (`to="/library"`). The breadcrumb and the footer's Back cover this.
- **Second search box:** `library/LibraryPage.tsx` with `library/SearchField.tsx` ("Search titles and pen names", with its own Cmd K hint) and `archive/ArchivePage.tsx`. Replace with `FilterField` (label "Filter", placeholder "Filter by title or profile"). The Library chip "All pen names" should read "All profiles" to match the spine.
- **Primary actions into the footer:** call `useStepAction` on each book screen and drop the screen's own gilt button: Research "Choose titles", Titles "Use this title", Blueprint "Approve blueprint" (`BlueprintPage.tsx:608`; Regenerate part at `:570` is also gilt and should be secondary), Writing "Write book", Editor "Mark edit done", Cover "Use this cover", Export "Build pack", Marketing "Generate scripts".
- **Editor word counts:** the section's words appear in the toolbar line (`editor/EditorPage.tsx:386`), in the manuscript tree and again in the inspector. Keep one per place: the total in the tree, the section count in the inspector.
- **Raw model slugs:** replace with `<ModelName slug={...} />` or `formatModel()`: `library/LivePanel.tsx:89`, `research/ResearchPage.tsx:326`, `blueprint/BlueprintInspector.tsx:151`, `writing/WritingInspector.tsx:85` and `:87`, `writing/RetryDialog.tsx:57`, `settings/ModelsPanel.tsx:87` and `:97`, `settings/ModelStageDialog.tsx:91`, `profiles/ModelsTab.tsx:47`, `components/ComponentsPage.tsx:349`.
- **Profiles store:** `profiles/profileStore.ts` still has seed data keyed by `ada-fenwick` and `sam-rowe` (lines 103, 123, 183, 236) and maps only the old `PenName` fields, so the editor shows empty legal name and location and the copyright preview prints the screen's own disclaimer. Read `penName.profile`: `legalName`, `location`, `voice` (tone, pov, rhythm, vocabulary, readingLevel, dialogueStyle, sampleParagraph, bannedPhrases), `publishing` (copyrightTemplate, copyrightName, disclaimer, illustrativeLine, defaultBookType, defaultWordTarget, defaultTrim, defaultInteriorTheme, defaultCoverStyle), `models` and `status`. Placeholders naming Sam Rowe or Larder Lane Books (`IdentityTab.tsx:89`, `PublishingTab.tsx:42`) need new examples.
- **New book wizard:** offer the 35 book types by category (`bookTypes`, `bookCategories` in `data/config.ts`) instead of four template cards, and preselect the profile's default book type, interior theme, cover style, trim and word target. `TemplateId` now also has `cookbook`, `journal` and `poetry`. Wizard Back and Next stay in the wizard.
- **Style guide (`/components`):** the Ink in card clips the newest line and the caret: the wrapper `div.h-24.overflow-hidden` at `components/ComponentsPage.tsx:548`. Drop the fixed height or show fewer chunks. `getPenName("ada-fenwick")` at line 88 now returns nothing; use `harni-muharami`.
