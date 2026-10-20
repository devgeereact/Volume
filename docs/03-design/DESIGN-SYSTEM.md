# 08 Design guide

This guide has two parts. **Foundations** (below) hold no matter which visual direction the owner picks. **Visual direction** (at the end) describes the fused Volume direction (D-014), built from the three boards in `design/directions/`. Tokens and components live in `packages/ui`; the prototype proves them first.

## Product feel

Volume is a calm studio for long work. A book takes hours of machine time and days of the owner's attention, so the app should feel steady, quiet and trustworthy, never busy.

1. **Calm studio for long work.** Muted surroundings, one accent used sparingly, no flashing badges. Long jobs run in the background and the owner can leave and come back.
2. **Content first.** The manuscript, the blueprint and the cover are the heroes. Chrome recedes: thin borders, generous margins, readable line lengths.
3. **Progress always visible.** Every long job shows where it is (section, words, checks, cost) in the place the owner is looking, and in the Library card. Nothing spins without saying what it is doing.
4. **One primary action per screen.** Each screen has one obvious next step ("Approve blueprint", "Write book", "Build pack"). Everything else is secondary or tucked into menus.
5. **Honest about cost and risk.** Buttons that spend money show the estimate. Warnings name the problem and the fix.
6. **Nothing is lost.** Versions, undo and "restore" are always one step away, so the owner can try things without fear.

## Layout system

### App shell

```
+------------+-------------------------------------+---------------+
| Left nav   | Main canvas                         | Inspector     |
| 240 px     | fluid, content max 760 px for prose | 320 px        |
|            |                                     | (collapsible) |
| Library    | Page header: title, status, primary |               |
| Profiles   | action, secondary actions           | Context for   |
| Archive    |                                     | the selection:|
| Settings   | Screen content                      | checks, versions,
|            |                                     | sources, cost |
| Book steps |                                     |               |
| (in a book)|                                     |               |
+------------+-------------------------------------+---------------+
| Job bar (only when a job runs): label, progress, cost, open, pause|
+------------------------------------------------------------------+
```

- **Left nav:** global items, then the open book's steps in order (Research, Titles, Blueprint, Writing, Editor, Cover, Export, Marketing) with a state dot each (not started, in progress, needs attention, done). Collapses to 64 px icons.
- **Main canvas:** the screen. Prose at 60 to 75 characters per line (max 760 px); tables and grids may use the full width.
- **Inspector:** details for the current selection. Closed by default on small screens; opens as a sheet.
- **Job bar:** fixed at the bottom while any job runs; never covers primary actions (content gets bottom padding).

### Spacing grid

- 8 px base. Steps: 4, 8, 12, 16, 24, 32, 48, 64, 96. Use 4 only inside dense controls.
- Component padding: 12 or 16. Card gap: 16 or 24. Section gap: 48. Page side padding: 32 desktop, 16 phone.
- Radii and shadow depth are set in "Visual direction" below.

### Breakpoints

| Name | Width | Shell behaviour |
|---|---|---|
| phone | under 640 px | Nav in a drawer, inspector as bottom sheet, single column. For checking progress and reading, not long editing |
| tablet | 640 to 1023 px | Nav collapsed to icons, inspector as overlay |
| laptop | 1024 to 1439 px | Nav open, inspector collapsible |
| desktop | 1440 px and up | All three regions open |

The prototype is checked at 1440 and 390 px wide.

## Accessibility floor

Target: WCAG 2.2 AA everywhere, no exceptions for "internal tools".

- **Contrast:** body and UI text 4.5:1 or more; large text (24 px, or 18.5 px bold) and icons that carry meaning 3:1; focus indicators 3:1 against neighbours.
- **Focus visible:** a 2 px outline with 2 px offset on every interactive element, never removed. Focus order follows reading order. Focus is not hidden behind the job bar or sticky headers (WCAG 2.4.11).
- **Targets:** 44 x 44 px minimum for anything clickable or tappable, including icon buttons and chips (exceeds the 24 px AA minimum on purpose).
- **Keyboard:** every action reachable by keyboard. Shortcuts shown in tooltips and menus: `Cmd K` command menu, `Cmd S` save version, `Cmd F` find, `Cmd Shift F` find and replace across the book, `Esc` closes overlays. No single-key shortcuts while typing.
- **Screen readers:** landmarks (`nav`, `main`, `aside`), one `h1` per screen, labelled controls, live regions for job progress (`aria-live="polite"`, at most one announcement every 10 seconds) and errors (`assertive`).
- **Colour is never alone:** state dots and badges also have an icon or text.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, transitions become instant or a short fade, streamed text appears in paragraph steps instead of word by word, and nothing moves on its own.
- **Text resize:** layouts hold at 200% zoom; no text in images.
- **Forms:** labels above fields, errors next to the field in text and announced, never only red borders. No time limits.

## Motion principles

- Durations 150 to 300 ms. 150 for hovers and small state changes, 200 for menus and popovers, 300 for panels and page transitions.
- Animate `transform` and `opacity` only. No animating width, height, top or left.
- Ease out on enter, ease in on exit. No bounces or springs on working screens.
- Motion explains a change (a panel slides from where it lives, a new version fades in). It is never decoration.
- Streaming text: appended in small chunks at most every 250 ms, without moving the reader's scroll position unless they are at the bottom.
- Use `motion/react` with a shared set of presets in `packages/ui`. The exception is the public pages (`apps/web/src/site/`), which use GSAP and Lenis (D-053). Reduced motion is respected there too.

## States every component needs

| State | Rule |
|---|---|
| Default | |
| Hover | Subtle change, never the only cue |
| Focus visible | 2 px outline, 2 px offset |
| Active or pressed | |
| Selected | Clear, and announced (`aria-selected` or `aria-pressed`) |
| Disabled | Lower contrast but still readable; tooltip says why it is disabled |
| Loading | Skeleton for content, inline spinner with label for actions; button keeps its width |
| Empty | Short explanation and the one action that fills it |
| Error | What went wrong in plain words, what to do, and a retry when it makes sense |
| Success | Short, inline confirmation; toasts only for background work that finished elsewhere |
| Needs attention | Distinct from error: work finished but the owner must look (open claims, checks) |
| Read only or locked | Approved blueprints and locked versions show a lock and how to make changes |
| Running | For anything tied to a job: progress, label, cost so far |

## Writing tone for UI copy

- Plain British English, short sentences, sentence case for labels and headings.
- No em dashes, and none of the avoided words listed in `AGENTS.md` ("Writing for people").
- Buttons are verbs that say what happens: "Write book", "Approve blueprint", "Build pack", not "Submit" or "Continue".
- Name the cost before the click: "Write book (about $2.40 to $3.60)".
- Errors say what happened and what to do: "OpenRouter is busy. We will try again in 10 seconds." Never blame the owner, never show raw stack traces.
- Empty states invite one action: "No pen names yet. Add your first one."
- Be calm about AI. Say "the writer" or the stage name, not "magic". Never claim the text is human-written.
- Numbers in figures, money with the currency sign, dates as "4 October 2026".

## Visual direction: Volume (D-014)

**Status:** Fused direction is implemented in the app and accepted by the owner on 7 October 2026 (D-014). Board: `design/final/volume-direction.html` (open it and use the Light and Dark switch). Screenshots: `design/final/screenshots/`. Research behind it: `design/research/inspiration.md`. Tokens: `packages/ui/tokens.json`, with `tokens.css` and `theme.css` generated from it by `node design/final/src/build.mjs`, which also checks every contrast pair below and rebuilds the board.

### The idea

1. Paper and cloth by day: a navy spine with a gilt edge (A), white galley sheets on warm grey paper, and a blue pencil for every choice (B).
2. The night desk after dark (C): the same layout on deep indigo, with the live writing job at the top of the library.
3. One brand accent, gilt, in both themes. It marks the one primary action per screen, the live job and the current stage. Nothing else.
4. Literata for everything that belongs to the book, Schibsted Grotesk for the interface. Covers are the only images, and they sit on the page like objects.
5. Quiet motion with five signatures: page turn, ink fill, cover lift, ink in and blue pencil.

### Colour

Light is the default. Dark applies with `data-theme="dark"` on `<html>`, or follows the system when no theme is set. Every value is opaque so contrast can be measured. The scrim is used at 40% (light) or 60% (dark) opacity.

| Token | Light | Dark | Role |
|---|---|---|---|
| `canvas` | #F3F2EE | #16172A | App background behind the main canvas (paper) |
| `sheet` | #FFFEFB | #1E2033 | Cards, panels, the galley sheet, inputs |
| `sunken` | #EBE9E3 | #121322 | Progress tracks, hover rows, skeletons, segmented control track |
| `raised` | #FFFFFF | #282B41 | Menus, popovers, modal, command menu |
| `spine` | #1A2238 | #10111F | Left nav (the cloth spine) and the tooltip |
| `spine-raised` | #283252 | #23263A | Selected nav item, pen name switcher on the spine |
| `border` | #E1DFD7 | #2F3249 | Hairlines and card edges (decorative) |
| `border-strong` | #8A877C | #6D7190 | Input and control boundaries (3:1 non-text) |
| `ink` | #1A2033 | #EDEBF4 | Primary text and headings |
| `ink-secondary` | #4A5064 | #B3B5CA | Secondary text, labels, metadata |
| `ink-tertiary` | #5E6375 | #9599B2 | Hints, captions, placeholders (still 4.5:1) |
| `ink-disabled` | #8E909B | #6A6E88 | Disabled labels (exempt, kept readable) |
| `ink-on-spine` | #EEECF4 | #EDEBF4 | Text on the spine |
| `ink-on-spine-muted` | #AFB6CD | #A9ACC3 | Secondary text on the spine |
| `accent` | #EBB241 | #EBB241 | Gilt: the one primary action per screen, live markers, current stage |
| `accent-hover` | #F2C35F | #F2C35F | Primary button hover |
| `accent-pressed` | #D9A030 | #D9A030 | Primary button pressed |
| `on-accent` | #1A2238 | #16172A | Text and icons on gilt |
| `accent-text` | #7F5B0B | #F0C362 | Gilt as text: live labels, needs attention |
| `accent-wash` | #FAF0D7 | #2C2A2E | Live panel tint, needs attention background |
| `progress` | #1A2238 | #EBB241 | Progress fill (ink on paper) |
| `select` | #2747B8 | #9EB2FF | Blue pencil: selection, focus ring, links |
| `select-wash` | #E8ECFA | #252C4E | Selected row and selected outline item |
| `claim` | #B42318 | #FF9D91 | Proof red: claims to verify and errors only |
| `claim-wash` | #FBEAE7 | #35202E | Claim note and error banner background |
| `on-claim` | #FFFFFF | #16172A | Text on proof red (destructive button) |
| `success` | #2C6A4B | #86D2A8 | Checks passed, done stages |
| `success-wash` | #E4F1E9 | #1B2F2E | Success toast and passed-check background |
| `scrim` | #1A2238 | #07070F | Modal backdrop, used at 40% opacity |

Rules for colour:

- **Gilt (`accent`)** fills the one primary button per screen, the live dot and the current stage marker. Gilt as text uses `accent-text`, never `accent`. Gilt on white is decorative only (about 1.8:1), so it never carries meaning alone.
- **Blue pencil (`select`)** is selection, focus and links. Selected rows and outline items get `select-wash` plus a 2 px pencil stroke on the leading edge.
- **Proof red (`claim`)** is only for claims to verify, errors and the destructive button. Never for decoration, never for a count that is not a problem.
- **Needs attention** (finished work the owner must look at) uses `accent-text` on `accent-wash` with a flag icon, so it reads apart from errors.
- **Progress** is ink on paper by day (`progress` is navy) and lamp light at night (`progress` is gilt). Done stage markers and ledger ticks use `ink`, so in both themes they stay distinct from the gilt current stage.
- **Surfaces:** `canvas` behind everything, `sheet` for cards, panels and the galley sheet, `sunken` for tracks and hovers, `raised` for menus and dialogs, `spine` for the left nav and tooltips. Depth comes from these steps first, borders second, shadow last.

### Type

| Font | Role | Licence | Source |
|---|---|---|---|
| Literata (variable, opsz 7 to 72, roman and italic) | Book text, screen titles, big figures, chapter titles, the live stream, margin notes in italic | SIL OFL 1.1 | Google Fonts or Fontsource `@fontsource-variable/literata` |
| Schibsted Grotesk (variable, 400 to 700) | Interface: nav, labels, buttons, tables, form text | SIL OFL 1.1 | Google Fonts or Fontsource `@fontsource-variable/schibsted-grotesk` |
| JetBrains Mono (400, 500) | Model IDs and keyboard keys only | SIL OFL 1.1 | Google Fonts or Fontsource `@fontsource/jetbrains-mono` |

The app self-hosts the WOFF2 files in `assets/fonts/` with each font's `OFL.txt`. No font loads from a CDN at run time. Adding the Fontsource packages needs the owner's OK (AGENTS.md rule 5); copying the files into `assets/fonts/` does not.

| Style | Font | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display` | Literata | 48px / 52px | 500 | -0.02em | Book title on the galley sheet |
| `title` | Literata | 36px / 42px | 500 | -0.015em | Screen title (one h1 per screen) |
| `figure` | Literata | 30px / 36px | 500 | -0.01em | Big numbers: words, cost |
| `heading` | Literata | 22px / 28px | 500 | -0.005em | Panel headings, chapter titles, live panel title |
| `subhead` | Schibsted Grotesk | 16px / 22px | 600 | 0 | Card titles, section labels in the inspector |
| `body` | Schibsted Grotesk | 15px / 22px | 400 | 0 | Interface body text |
| `label` | Schibsted Grotesk | 14px / 20px | 500 | 0 | Buttons, nav items, field labels, tabs |
| `small` | Schibsted Grotesk | 13px / 18px | 400 | 0.005em | Metadata, table secondary lines |
| `caption` | Schibsted Grotesk | 12px / 16px | 500 | 0.01em | Counts, chip numbers, key hints. Never for sentences |
| `prose` | Literata | 18px / 30px | 400 | 0 | Manuscript and summaries, max 68ch |
| `prose-sm` | Literata | 16px / 26px | 400 | 0 | Live stream, chapter summaries in cards |

Type rules:

- Sentence case everywhere. No all-caps labels, no tracked-out eyebrows. Section labels in the inspector are 13 px Schibsted 600 in `ink-secondary`.
- Numbers use tabular lining figures (`font-variant-numeric: tabular-nums lining-nums`). Big figures (words, cost) are Literata at 30 px with the unit in 14 px Schibsted beside them.
- Prose holds 60 to 75 characters a line (max 760 px; the writing page uses 640 px). Paragraphs after the first are indented 1.5 em, as in print.
- One `h1` per screen. On book screens it can be visually hidden when the book title is the visual heading.
- Mono is never used for labels, prices or counts.

### Spacing

8 px grid from the foundations: 4, 8, 12, 16, 24, 32, 48, 64, 96 (`--vol-space-*`). In Tailwind the default 4 px step already matches (`p-2` is 8 px, `p-6` is 24 px). Library page padding is 40 px at 1440; panel padding 20 to 24 px; inspector sections are separated by a hairline and 16 px.

### Radii

| Token | Value | Use |
|---|---|---|
| `xs` | 4 px | Keyboard keys, small badges, skeleton lines |
| `sm` | 6 px | Buttons, inputs, selects, segmented items, nav items, outline items |
| `md` | 10 px | Cards, inspector panels, toasts, menus, the ledger |
| `lg` | 16 px | Modal, command menu, live panel, galley sheet |
| `pill` | 999 px | Filter chips, status chips, avatars, switches |
| `cover` | 3 px | Book covers |

### Elevation

| Level | Light | Dark | Use |
|---|---|---|---|
| 0 Flat | no shadow | no shadow | Canvas, cards, panels: borders do the work |
| 1 Button | inset top highlight plus faint ring | same, stronger | Primary gilt button only |
| 2 Sheet | soft 1 px plus long low shadow | hairline plus deep shadow | Galley sheet and live panel |
| 3 Pop | `shadow-pop` | `shadow-pop` | Menus, popovers, toasts |
| 4 Modal | `shadow-modal` over the scrim | same | Modal and command menu |
| Cover | `shadow-cover` | `shadow-cover` | Book covers only |

Exact values are in `tokens.json` under `shadow`.

### Iconography

One set: **Lucide** (ISC licence), outline style, stroke 1.75, round caps and joins. Sizes: 18 px in nav and buttons, 16 px inline and in compact buttons, 14 px (stroke 2) in chips and status lines. Icons inherit `currentColor`. Icon-only buttons have an `aria-label` and a tooltip. Use `lucide-react` once the owner approves the package; until then the prototype inlines the few SVGs it needs. Do not mix in another set.

### Components and their states

Every component also follows "States every component needs" above. Board section 4 shows these.

| Component | Anatomy | States and rules |
|---|---|---|
| Button, primary | Gilt fill, `on-accent` label, `shadow-button`, 40 px tall, 6 px radius, 44 px hit area | Hover `accent-hover`; pressed `accent-pressed` and 1 px down; focus 2 px pencil ring with 2 px offset; disabled `sunken` with `ink-disabled` and a tooltip saying why; loading keeps width, pen-stroke loader plus a verb ("Building"). One per screen. Spending buttons show the estimate ("Regenerate part, about $0.04") |
| Button, secondary | `sheet` fill, `border-strong` edge, `ink` label | Hover `sunken`; same press, focus, disabled and loading rules |
| Button, quiet | No fill, `ink-secondary` label | Hover `sunken` with `ink` label. For Cancel, Open, Dismiss |
| Button, destructive | `claim` fill, `on-claim` label | Only for deleting or discarding. Always confirms first |
| Icon button | 44 x 44, secondary or quiet style | Needs `aria-label` and tooltip |
| Text field | Label above (14 px 500), 44 px field, `border-strong` edge, hint below in `ink-tertiary` | Focus: pencil border plus the 2 px ring; error: proof red border and a message with an icon beside it; disabled: `sunken`, `ink-disabled`, hint says why |
| Select and menu | Field with chevron; menu on `raised`, `shadow-pop`, 40 px rows with a hint on the right | Selected option: `select-wash`, pencil text, check icon, `aria-selected` |
| Switch | 40 x 24 track, knob slides 16 px | On: track fills with `progress` (opacity), knob moves (transform). Label to the right, whole row clickable, 44 px tall |
| Segmented control | `sunken` track, `sheet` thumb that slides | Used for Covers and Ledger. Radio semantics, arrow keys move |
| Tabs | 44 px, label plus count pill | Selected: `ink` label and a 2 px pencil underline drawn left to right. Claims count uses proof red |
| Filter chip | 30 px pill (44 px hit area), label plus count | Pressed: `select-wash`, pencil border and text, `aria-pressed` |
| Status chip | 24 px pill, icon plus word | Writing (gilt dot), Needs attention (flag), Claim to verify (proof red flag), Checks passed (check, success), Queued (clock), Approved and locked (lock), Demo book (outline) |
| Stage track | Marker plus label per stage, joined by short rules | Done: `ink` marker with a check; current: gilt marker with a dot, page-turn entrance, `aria-current="step"`; upcoming: outlined. Book screens show Research to Export |
| Progress bar | 6 px track (`sunken`), fill in `progress` | Fill uses `scaleX`, never width. The live edge gets a 3 px gilt nib. Always paired with text ("21,340 of 38,000 words"). `role="progressbar"` with values |
| Chapter segments | One 6 px segment per chapter, 4 px gaps | Done segments full, current segment partial with the nib, queued empty |
| Live panel | Cover, "Writing now" line, book and chapter, last two lines of streamed text with a gilt caret, chapter segments, figures, Pause and Open live view | `sheet` with a 3 px gilt leading edge and `shadow-sheet`. Only one live panel, at the top of the Library, while a job runs |
| Book card | Cover, title (14 px 600), pen name and one status line | Hover or focus: cover lift. Writing books add a thin progress bar. Missing cover: dashed frame with the title in italic |
| Ledger row | Mini cover, title in Literata with subtitle, pen name, stage ticks plus words, numbers right-aligned | Selected: `select-wash` with a 3 px pencil edge, `aria-selected` |
| Outline item | Number, title, claim flag | Current: `select-wash`, pencil text, pencil stroke. Subheadings indent under a hairline |
| Galley sheet | White sheet (dark: `sheet`), 16 px top radius, 44 px by 52 px padding | Selected part: `select-wash` with a pencil stroke; claims: proof red wavy underline with a margin note |
| Margin note | Literata italic 14 px with a Schibsted label, 2 px rule on the left | Profile and general notes use `border-strong`; selection notes pencil; claim notes proof red. Notes line up with the text they describe |
| Inspector section | 13 px label, content, hairline above | Figures in Literata; key and value rows right-aligned with tabular numbers |
| Model row | Mark, model ID in mono, source line, price per million tokens in and out, context, capability tags, cost for this book | Selected: radio on, `select-wash`, 3 px pencil edge. Prices come from OpenRouter with the date read |
| Cost badge | "$1.92 of $15.00" plus a thin bar | Over 80% of budget: needs attention style. At budget: the job pauses and the banner says how much more is needed |
| Toast | `raised`, `shadow-pop`, icon in a wash circle, title, one line, one action or dismiss | Only for background work that finished elsewhere. Success or needs attention. Stays until dismissed if it needs action |
| Modal | `raised`, 16 px radius, `shadow-modal`, title in Literata 22 px | Scrim behind. Primary action names the result ("Regenerate chapter 4"). Esc and Cancel close it. Focus is trapped and returns to the trigger |
| Command menu | Search line with count, grouped results, keys on the right, footer with key hints | Combobox plus listbox with `aria-activedescendant`; the highlight follows arrow keys and pointer movement (not hover alone); matches in pencil bold; the count is announced politely |
| Tooltip | `spine` background, 13 px text, arrow | Shows on hover and focus after 400 ms. Disabled controls explain what is missing |
| Empty state | Line drawing, Literata heading, one sentence, one primary action | Copy from 09-UX-FLOWS ("No pen names yet. Add your first one.") |
| Skeleton | `sunken` blocks in the shape of the content, on a `sheet` panel | Breathes with opacity only; holds still with reduced motion |
| Job bar | 56 px, live dot, job label, thin bar, words and cost, Open, Pause | Fixed to the bottom of book screens while a job runs elsewhere. Content gets 56 px bottom padding |

Not on the board yet, built from the same parts: version compare (two galley sheets side by side, changes underlined in pencil), suggestion card (original, proposed, reason, accept, reject), source card (title, domain, link, "use in book" check).

### Layout per screen

- **Library** (1440 by 900): spine 240 px. Header row: screen title, one-line summary, search with the Cmd K hint, Covers or Ledger toggle, New book. Below it the live panel when a job runs. Cover view arranges books along the pipeline in eight columns (Idea to Published), each headed by the stage and its count; the column with live work gets a gilt underline. Ledger view is a table: book, pen name, stage ticks, words, AI spend, updated. A "Today" strip of the latest four events closes the page.
- **Blueprint:** spine collapsed to 64 px with the book's steps and their state dots. Outline rail 272 px. Canvas with the stage track on top and the galley sheet (560 px) with a 176 px margin-note column. Inspector 320 px: version, word targets, model with price, cost so far, claims to verify, then a fixed footer with the selected part, Regenerate part (with estimate) and Approve blueprint.
- **Writing:** collapsed spine, section list 340 px (number, title, status with icon and words; the current row on `accent-wash` with a bar and the nib), the live page (640 px measure, chapter title in Literata, streamed text with the gilt caret, Follow the writer switch, Pause, Cancel), inspector with words, time, checks on the last chapter, cost, model and needs attention.
- **Other screens** reuse these patterns: Editor puts TipTap on the galley sheet with inspector tabs (Checks, Claims, Suggestions, Versions); Research and Titles use cards on paper with sources in the inspector; Cover studio puts concepts on paper as covers; Export uses the ledger for preflight and formats; Settings uses the ledger for the model table.

### Motion

Durations, easing and the rule (transform and opacity only) come from "Motion principles" above. Tokens: `--vol-dur-fast` 150 ms, `--vol-dur-base` 200 ms, `--vol-dur-slow` 300 ms; `--vol-ease-out`, `--vol-ease-in`, `--vol-ease-page`. Tailwind exposes them as `ease-out`, `ease-in`, `ease-page` and `animate-page-turn`, `animate-ink-fill`, `animate-ink-in`, `animate-pencil`, `animate-pencil-x`.

| Signature | Trigger | Movement | Duration and easing | Reduced motion |
|---|---|---|---|---|
| Page turn | A stage completes and the next becomes current | Marker turns in from `rotateY(-80deg)` with opacity 0 to 1, hinged on its left edge | 300 ms, `ease-page` | 120 ms fade |
| Ink fill | Progress changes | Fill `scaleX(old)` to `scaleX(new)` from the left; the gilt nib fades between full and 35% while the job runs | 300 ms, `ease-out` | Jumps to the value; the nib holds still |
| Cover lift | Hover or keyboard focus on a book | Cover `translateY(-4px) rotateY(-8deg)` hinged on the spine, soft shadow fades in under it | 200 ms, `ease-out` | No movement; focus ring only |
| Ink in | New streamed text | Each chunk fades in and settles 2 px; a gilt caret blinks at 1 s steps | 200 ms, `ease-out`; chunks at most every 250 ms | Whole paragraphs appear; the caret does not blink |
| Blue pencil | Selection changes | A 2 px stroke draws down the leading edge (`scaleY`), the wash fades in; tab underlines draw left to right (`scaleX`) | 200 ms stroke, 150 ms wash | Appears at once |

Everyday motion: buttons press 1 px down in 150 ms; menus and popovers fade and settle in 200 ms; panels and sheets slide from where they live in 300 ms. Nothing moves on its own except live job indicators, and those stop with reduced motion and when the tab is hidden.

### Imagery and covers

- Covers are the only pictures in the app. They keep a 2:3 shape, a 3 px radius, a soft spine shade on the left edge and `shadow-cover`, so they read as objects on a table. Never crop or recolour a cover.
- Books without a cover show a dashed frame with the title in Literata italic and "No cover yet".
- The interface never sits text on top of a cover. No stock photos, no gradients as decoration, no illustrations except the simple line drawings in empty states.
- The board's sample covers use OFL display fonts (DM Serif Display, Libre Franklin, Big Shoulders Display, Bodoni Moda, Young Serif). They are book content; the interface never uses them.

### Do and don't

| Do | Don't |
|---|---|
| One gilt button per screen, for the next step | Gilt on secondary actions, badges or decoration |
| Blue pencil for whatever is selected or focused | Pencil blue as a brand colour or for headings |
| Proof red only for claims, errors and deleting | Red counts, red for "new", red for warnings that are not problems |
| Literata for anything that belongs to the book | Serif labels, serif buttons, serif table headers |
| Sentence case, plain verbs, cost before the click | All-caps eyebrows, "Submit", arrows on buttons, middle-dot metadata |
| Borders and surface steps for structure | The same soft shadow under every card |
| Tabular figures for words, money and times | Mono for prices or counts |
| Covers as the only images, with their shadow | Stock imagery or gradient washes |
| Motion that answers an action or shows live progress | Looping or decorative motion; animating width, height, top or left |
| Both themes from the same tokens | Hard-coded hex values in components |

### Accessibility checks for this direction

All 45 pairs below are computed from `tokens.json` by `design/final/src/contrast.mjs` (WCAG 2.2 relative luminance), 90 checks across both themes. Every text pair is at least 4.5:1: the lowest is `ink-tertiary` on `sunken` at 4.92:1 (light) and `ink-tertiary` on `raised` at 4.94:1 (dark). Non-text pairs (control edges, focus ring, progress fill, live dot) are at least 3:1. Disabled text is exempt under WCAG and kept near 3.2:1 so it stays readable.

| Text on background | Use | Light | Dark | Need |
|---|---|---|---|---|
| `ink` on `canvas` | Body text on paper | 14.44 PASS | 14.95 PASS | 4.5:1 |
| `ink` on `sheet` | Body text on sheet | 16.04 PASS | 13.58 PASS | 4.5:1 |
| `ink` on `sunken` | Text on sunken rows | 13.32 PASS | 15.58 PASS | 4.5:1 |
| `ink` on `raised` | Text in menus and modal | 16.17 PASS | 11.77 PASS | 4.5:1 |
| `ink-secondary` on `canvas` | Secondary on paper | 7.15 PASS | 8.72 PASS | 4.5:1 |
| `ink-secondary` on `sheet` | Secondary on sheet | 7.94 PASS | 7.93 PASS | 4.5:1 |
| `ink-secondary` on `sunken` | Secondary on sunken | 6.60 PASS | 9.09 PASS | 4.5:1 |
| `ink-secondary` on `raised` | Secondary in menus | 8.01 PASS | 6.86 PASS | 4.5:1 |
| `ink-tertiary` on `canvas` | Hints on paper | 5.33 PASS | 6.28 PASS | 4.5:1 |
| `ink-tertiary` on `sheet` | Hints and placeholders on sheet | 5.92 PASS | 5.71 PASS | 4.5:1 |
| `ink-tertiary` on `raised` | Hints in menus | 5.97 PASS | 4.94 PASS | 4.5:1 |
| `ink-tertiary` on `sunken` | Hints on sunken | 4.92 PASS | 6.55 PASS | 4.5:1 |
| `ink-on-spine` on `spine` | Nav text | 13.49 PASS | 15.86 PASS | 4.5:1 |
| `ink-on-spine` on `spine-raised` | Selected nav item | 10.75 PASS | 12.62 PASS | 4.5:1 |
| `ink-on-spine-muted` on `spine` | Nav secondary | 7.82 PASS | 8.36 PASS | 4.5:1 |
| `ink-on-spine-muted` on `spine-raised` | Nav secondary on selected | 6.23 PASS | 6.65 PASS | 4.5:1 |
| `on-accent` on `accent` | Primary button label | 8.25 PASS | 9.22 PASS | 4.5:1 |
| `on-accent` on `accent-hover` | Primary button hover | 9.59 PASS | 10.71 PASS | 4.5:1 |
| `on-accent` on `accent-pressed` | Primary button pressed | 6.78 PASS | 7.58 PASS | 4.5:1 |
| `accent-text` on `canvas` | Live label on paper | 5.51 PASS | 10.66 PASS | 4.5:1 |
| `accent-text` on `sheet` | Live label on sheet | 6.12 PASS | 9.69 PASS | 4.5:1 |
| `accent-text` on `accent-wash` | Needs attention note | 5.44 PASS | 8.59 PASS | 4.5:1 |
| `ink` on `accent-wash` | Body text in live panel | 14.26 PASS | 12.04 PASS | 4.5:1 |
| `ink-secondary` on `accent-wash` | Secondary in live panel | 7.06 PASS | 7.02 PASS | 4.5:1 |
| `select` on `sheet` | Link and selection text | 7.77 PASS | 7.84 PASS | 4.5:1 |
| `select` on `canvas` | Link on paper | 7.00 PASS | 8.63 PASS | 4.5:1 |
| `select` on `select-wash` | Selected item label | 6.65 PASS | 6.63 PASS | 4.5:1 |
| `ink` on `select-wash` | Body text on selected row | 13.72 PASS | 11.49 PASS | 4.5:1 |
| `claim` on `sheet` | Claim and error text | 6.52 PASS | 8.01 PASS | 4.5:1 |
| `claim` on `canvas` | Error on paper | 5.87 PASS | 8.81 PASS | 4.5:1 |
| `claim` on `claim-wash` | Claim note | 5.64 PASS | 7.50 PASS | 4.5:1 |
| `ink` on `claim-wash` | Body text in claim note | 13.88 PASS | 12.73 PASS | 4.5:1 |
| `on-claim` on `claim` | Destructive button label | 6.57 PASS | 8.81 PASS | 4.5:1 |
| `success` on `sheet` | Check passed text | 6.37 PASS | 9.01 PASS | 4.5:1 |
| `success` on `success-wash` | Success toast text | 5.52 PASS | 7.90 PASS | 4.5:1 |
| `ink` on `success-wash` | Body text in success toast | 13.91 PASS | 11.92 PASS | 4.5:1 |
| `ink-on-spine` on `spine` | Tooltip text | 13.49 PASS | 15.86 PASS | 4.5:1 |
| `ink-disabled` on `sheet` | Disabled label (exempt, info) | 3.15 (exempt) | 3.21 (exempt) | none |
| `border-strong` on `sheet` | Input boundary (non-text) | 3.57 PASS | 3.37 PASS | 3:1 |
| `border-strong` on `canvas` | Control boundary on paper (non-text) | 3.21 PASS | 3.71 PASS | 3:1 |
| `select` on `canvas` | Focus ring on paper (non-text) | 7.00 PASS | 8.63 PASS | 3:1 |
| `select` on `sheet` | Focus ring on sheet (non-text) | 7.77 PASS | 7.84 PASS | 3:1 |
| `progress` on `sunken` | Progress fill vs track (non-text) | 13.01 PASS | 9.61 PASS | 3:1 |
| `progress` on `sheet` | Progress fill vs sheet (non-text) | 15.66 PASS | 8.38 PASS | 3:1 |
| `accent` on `spine` | Live dot on spine (non-text) | 8.25 PASS | 9.78 PASS | 3:1 |

Other checks that apply to this direction:

- Focus is a 2 px `select` outline with 2 px offset everywhere, including on the gilt button and inside the spine (7.0:1 or more against paper and sheet in both themes).
- Compact controls (40 px buttons, 30 px chips) extend their hit area to 44 px with an invisible layer.
- Every colour signal also has an icon or a word: status chips, stage markers (check, dot, ring), claim flags, success checks.
- The live stream sits in a region with `aria-live="off"`. Progress is announced through the job bar's polite status at most every 10 seconds, so screen reader users are not flooded with words.
- The theme follows the system setting until the owner picks one in Settings. Both themes pass the same checks.
