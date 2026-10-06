import { Navigate, createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { LucideProvider } from "lucide-react";
import { MotionConfig } from "motion/react";
import { CommandPaletteProvider } from "./lib/commandPalette";
import { JobProvider } from "./lib/job";
import { PenNameProvider } from "./lib/penName";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";
import { AppShell } from "./shell/AppShell";
import { BookLayout } from "./shell/BookLayout";
import { NotFound } from "./shell/NotFound";
import { RouteError } from "./shell/RouteError";
import BookIndexRedirect from "./routes/books/BookIndexRedirect";
import LibraryPage from "./routes/library/LibraryPage";

/* Routes for every screen in docs/09-UX-FLOWS.md. "/" and "/library" both show the Library;
   "/published" is the Published shelf. Book screens sit under /books/:bookId/ inside BookLayout, which
   adds the one step bar and Back and Next (D-016). "/components" is the living style guide. */
const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <LibraryPage /> },
      { path: "/library", element: <LibraryPage /> },
      { path: "/published", lazy: async () => ({ Component: (await import("./routes/published/PublishedPage")).default }) },
      { path: "/profiles", lazy: async () => ({ Component: (await import("./routes/profiles/ProfilesPage")).default }) },
      { path: "/profiles/:profileId", lazy: async () => ({ Component: (await import("./routes/profiles/ProfileEditorPage")).default }) },
      { path: "/books/new", lazy: async () => ({ Component: (await import("./routes/new-book/NewBookPage")).default }) },
      { path: "/new-book", element: <Navigate to="/books/new" replace /> },
      {
        path: "/books/:bookId",
        element: <BookLayout />,
        children: [
          { index: true, element: <BookIndexRedirect /> },
          { path: "research", lazy: async () => ({ Component: (await import("./routes/research/ResearchPage")).default }) },
          { path: "titles", lazy: async () => ({ Component: (await import("./routes/titles/TitlesPage")).default }) },
          { path: "blueprint", lazy: async () => ({ Component: (await import("./routes/blueprint/BlueprintPage")).default }) },
          { path: "writing", lazy: async () => ({ Component: (await import("./routes/writing/WritingPage")).default }) },
          { path: "editor/:sectionId?", lazy: async () => ({ Component: (await import("./routes/editor/EditorPage")).default }) },
          { path: "cover", lazy: async () => ({ Component: (await import("./routes/cover/CoverPage")).default }) },
          { path: "export", lazy: async () => ({ Component: (await import("./routes/export/ExportPage")).default }) },
          { path: "marketing", lazy: async () => ({ Component: (await import("./routes/marketing/MarketingPage")).default }) },
        ],
      },
      { path: "/settings/:tab?", lazy: async () => ({ Component: (await import("./routes/settings/SettingsPage")).default }) },
      { path: "/archive", lazy: async () => ({ Component: (await import("./routes/archive/ArchivePage")).default }) },
      { path: "/components", lazy: async () => ({ Component: (await import("./routes/components/ComponentsPage")).default }) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <LucideProvider size={18} strokeWidth={1.75}>
          <PenNameProvider>
            <JobProvider>
              <ToastProvider>
                <CommandPaletteProvider>
                  <RouterProvider router={router} />
                </CommandPaletteProvider>
              </ToastProvider>
            </JobProvider>
          </PenNameProvider>
        </LucideProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
