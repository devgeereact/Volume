import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BookCheck,
  CalendarDays,
  Compass,
  FilePlus,
  Image,
  Layers,
  Library,
  ListTree,
  Megaphone,
  Package,
  PenLine,
  SlidersHorizontal,
  SquarePen,
  Type,
  UserPen,
  Users,
} from "lucide-react";
import type { EmptyDrawing } from "./components/ui/EmptyState";
import type { BookStepId } from "./demo/types";

/* Every screen in docs/03-design/UX-SPEC.md, with its purpose line and empty state. The router, the
   placeholders, the command menu and the breadcrumbs all read this list. Owners: A = library,
   profiles, settings, archive. B = new book, research, titles, blueprint. C = writing, editor,
   cover, export, marketing. F = foundation (published shelf). */

export type ScreenId =
  | "library"
  | "published"
  | "profiles"
  | "profile-editor"
  | "new-book"
  | "research"
  | "titles"
  | "blueprint"
  | "writing"
  | "editor"
  | "cover"
  | "export"
  | "marketing"
  | "settings"
  | "archive"
  | "volume"
  | "schedule";

export interface ScreenDef {
  id: ScreenId;
  title: string;
  purpose: string;
  /** Route pattern, as in 09-UX-FLOWS (":bookId" for book screens). */
  path: string;
  folder: string;
  owner: "A" | "B" | "C" | "F" | "V";
  step: BookStepId | null;
  icon: LucideIcon;
  primaryAction: string;
  empty: { title: string; body: string; action: string | null; estimate: string | null; drawing: EmptyDrawing };
  prdModule: string;
}

/* The Settings sections, in the order the Settings screen shows them. "/settings" opens the first one
   (key); the others are "/settings/<id>". Settings, the breadcrumbs and the README read this list. */
export const settingsTabs = [
  { id: "key", label: "OpenRouter" },
  { id: "models", label: "Models" },
  { id: "budgets", label: "Budgets" },
  { id: "book-defaults", label: "Book defaults" },
  { id: "appearance", label: "Appearance" },
  { id: "backups", label: "Data and backups" },
  { id: "house-style", label: "House style" },
  { id: "kdp-rules", label: "KDP rules" },
  { id: "members", label: "Members" },
  { id: "account", label: "Your account" },
  { id: "about", label: "About" },
] as const;
export type SettingsTab = (typeof settingsTabs)[number]["id"];

export const screens: Record<ScreenId, ScreenDef> = {
  library: {
    id: "library",
    title: "Library",
    purpose: "See every book by pen name and status; open or start one.",
    path: "/",
    folder: "features/library",
    owner: "A",
    step: null,
    icon: Library,
    primaryAction: "New book",
    empty: { title: "No books yet", body: "Start one from an idea or a working title.", action: "New book", estimate: null, drawing: "books" },
    prdModule: "M2",
  },
  published: {
    id: "published",
    title: "Published",
    purpose: "Books that are live on Amazon, with their formats, prices and dates.",
    path: "/published",
    folder: "features/published",
    owner: "F",
    step: null,
    icon: BookCheck,
    primaryAction: "Open export pack",
    empty: {
      title: "Nothing published yet",
      body: "When a book goes live on Amazon, mark it published in Export and it moves to this shelf.",
      action: "Open the Library",
      estimate: null,
      drawing: "books",
    },
    prdModule: "M11",
  },
  profiles: {
    id: "profiles",
    title: "Profiles",
    purpose: "Manage pen names and real-person profiles.",
    path: "/profiles",
    folder: "features/profiles",
    owner: "A",
    step: null,
    icon: Users,
    primaryAction: "Add pen name",
    empty: {
      title: "No pen names yet",
      body: "Add your first one. Each pen name keeps its own bio, voice and templates.",
      action: "Add pen name",
      estimate: null,
      drawing: "pen",
    },
    prdModule: "M1",
  },
  "profile-editor": {
    id: "profile-editor",
    title: "Profile editor",
    purpose: "Edit one profile's identity, bio, voice, brand, templates and models.",
    path: "/profiles/:profileId",
    folder: "features/profiles",
    owner: "A",
    step: null,
    icon: UserPen,
    primaryAction: "Save profile",
    empty: {
      title: "No voice samples yet",
      body: "Paste a few paragraphs that sound like this author.",
      action: "Add a sample",
      estimate: null,
      drawing: "pen",
    },
    prdModule: "M1",
  },
  "new-book": {
    id: "new-book",
    title: "New book",
    purpose: "Start a book in under a minute.",
    path: "/books/new",
    folder: "features/new-book",
    owner: "B",
    step: null,
    icon: FilePlus,
    primaryAction: "Start research",
    empty: {
      title: "Pick a pen name",
      body: "Step 1 of 5. The book is written in this author's voice and uses their templates.",
      action: "Next",
      estimate: null,
      drawing: "page",
    },
    prdModule: "M3",
  },
  research: {
    id: "research",
    title: "Research",
    purpose: "Understand audience and gaps with real sources.",
    path: "/books/:bookId/research",
    folder: "features/research",
    owner: "B",
    step: "research",
    icon: Compass,
    primaryAction: "Choose titles",
    empty: {
      title: "Research has not run yet",
      body: "Research finds the audience, their problems, angles and gaps, with cited sources you can tick.",
      action: "Run research",
      estimate: "about $0.30",
      drawing: "search",
    },
    prdModule: "M4",
  },
  titles: {
    id: "titles",
    title: "Titles",
    purpose: "Pick a title and subtitle.",
    path: "/books/:bookId/titles",
    folder: "features/titles",
    owner: "B",
    step: "titles",
    icon: Type,
    primaryAction: "Use this title",
    empty: {
      title: "No title options yet",
      body: "Generate five directions with two options each, checked against the KDP length limit and the house style.",
      action: "Generate title options",
      estimate: "about $0.04",
      drawing: "page",
    },
    prdModule: "M5",
  },
  blueprint: {
    id: "blueprint",
    title: "Blueprint",
    purpose: "Shape and approve the whole plan.",
    path: "/books/:bookId/blueprint",
    folder: "features/blueprint",
    owner: "B",
    step: "blueprint",
    icon: ListTree,
    primaryAction: "Approve blueprint",
    empty: {
      title: "No blueprint yet",
      body: "The blueprint plans the front matter, every chapter with its subheadings, the back matter and the listing.",
      action: "Build the blueprint",
      estimate: "about $0.05",
      drawing: "page",
    },
    prdModule: "M6",
  },
  writing: {
    id: "writing",
    title: "Writing",
    purpose: "Watch the book being written and handle anything that needs attention.",
    path: "/books/:bookId/writing",
    folder: "features/writing",
    owner: "C",
    step: "writing",
    icon: PenLine,
    primaryAction: "Write book",
    empty: {
      title: "Ready to write 12 sections",
      body: "The writer works through each section in order and checks it as it goes. You can leave and come back.",
      action: "Write book",
      estimate: "about $2.40 to $3.60",
      drawing: "pen",
    },
    prdModule: "M7",
  },
  editor: {
    id: "editor",
    title: "Editor",
    purpose: "Read, edit and polish every section.",
    path: "/books/:bookId/editor/:sectionId?",
    folder: "features/editor",
    owner: "C",
    step: "editor",
    icon: SquarePen,
    primaryAction: "Save version",
    empty: {
      title: "This section has no text yet",
      body: "Write it with the writer, or paste your own text.",
      action: "Write this section",
      estimate: "about $0.25",
      drawing: "page",
    },
    prdModule: "M9",
  },
  cover: {
    id: "cover",
    title: "Cover studio",
    purpose: "From brief to final eBook cover and paperback wrap.",
    path: "/books/:bookId/cover",
    folder: "features/cover",
    owner: "C",
    step: "cover",
    icon: Image,
    primaryAction: "Write brief",
    empty: {
      title: "Write a cover brief",
      body: "The brief sets the mood, colours and type. Concepts come next, and the app sets every word on the cover.",
      action: "Write brief",
      estimate: "about $0.02",
      drawing: "box",
    },
    prdModule: "M10",
  },
  export: {
    id: "export",
    title: "Export",
    purpose: "Build files, check them and download the pack.",
    path: "/books/:bookId/export",
    folder: "features/export",
    owner: "C",
    step: "export",
    icon: Package,
    primaryAction: "Build pack",
    empty: {
      title: "Nothing built yet",
      body: "Run preflight, fix anything that blocks, then build the KDP pack.",
      action: "Run preflight",
      estimate: null,
      drawing: "box",
    },
    prdModule: "M11",
  },
  marketing: {
    id: "marketing",
    title: "Marketing",
    purpose: "Launch content per book.",
    path: "/books/:bookId/marketing",
    folder: "features/marketing",
    owner: "C",
    step: "marketing",
    icon: Megaphone,
    primaryAction: "Generate scripts",
    empty: {
      title: "No scripts yet for this book",
      body: "Generate TikTok scripts with hooks, Instagram captions and a launch email.",
      action: "Generate scripts",
      estimate: "about $0.03",
      drawing: "page",
    },
    prdModule: "M12",
  },
  settings: {
    id: "settings",
    title: "Settings",
    purpose: "Key status, models, budgets, book defaults, appearance, data and backups, house style and KDP rules.",
    path: "/settings/:tab?",
    folder: "features/settings",
    owner: "A",
    step: null,
    icon: SlidersHorizontal,
    primaryAction: "Save",
    empty: {
      title: "No OpenRouter key yet",
      body: "Add OPENROUTER_API_KEY to the server .env file, then restart. Volume runs with the mock writer until then.",
      action: "Check again",
      estimate: null,
      drawing: "box",
    },
    prdModule: "M13",
  },
  archive: {
    id: "archive",
    title: "Archive",
    purpose: "Find and restore archived books, profiles and marketing items.",
    path: "/archive",
    folder: "features/archive",
    owner: "A",
    step: null,
    icon: Archive,
    primaryAction: "Restore",
    empty: {
      title: "Nothing archived",
      body: "Archived books, pen names and marketing items appear here, ready to restore.",
      action: null,
      estimate: null,
      drawing: "archive",
    },
    prdModule: "M2",
  },
  volume: {
    id: "volume",
    title: "Volume mode",
    purpose: "Plan and run batches of books across pen names, with a quality gate for each book.",
    path: "/volume",
    folder: "features/volume-mode",
    owner: "V",
    step: null,
    icon: Layers,
    primaryAction: "New batch",
    empty: {
      title: "No batches yet",
      body: "A batch runs several books one at a time with the usual pipeline. Each book still passes preflight and claims review.",
      action: "New batch",
      estimate: null,
      drawing: "books",
    },
    prdModule: "Phase 8",
  },
  schedule: {
    id: "schedule",
    title: "Release schedule",
    purpose: "Plan release dates per format inside KDP's limit on new titles.",
    path: "/volume/schedule",
    folder: "features/volume-mode",
    owner: "V",
    step: null,
    icon: CalendarDays,
    primaryAction: "Plan a release",
    empty: {
      title: "Nothing planned this week",
      body: "Plan a release to hold a slot for a book and format.",
      action: "Plan a release",
      estimate: null,
      drawing: "page",
    },
    prdModule: "Phase 8",
  },
};

/** Left nav, in order (D-016). Settings links to "/settings". The command menu reads the same list. */
export const globalNav: ScreenDef[] = [
  screens.library,
  screens.published,
  screens.volume,
  screens.profiles,
  screens["new-book"],
  screens.archive,
  screens.settings,
];

/** Book screens in nav order, keyed by step. */
export const stepScreens: Record<BookStepId, ScreenDef> = {
  research: screens.research,
  titles: screens.titles,
  blueprint: screens.blueprint,
  writing: screens.writing,
  editor: screens.editor,
  cover: screens.cover,
  export: screens.export,
  marketing: screens.marketing,
};

/** URL of a book step. */
export function bookStepPath(bookId: string, step: BookStepId): string {
  return `/books/${bookId}/${step}`;
}
