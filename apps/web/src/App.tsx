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
import ArchivePage from "./routes/archive/ArchivePage";
import BlueprintPage from "./routes/blueprint/BlueprintPage";
import BookIndexRedirect from "./routes/books/BookIndexRedirect";
import ComponentsPage from "./routes/components/ComponentsPage";
import CoverPage from "./routes/cover/CoverPage";
import EditorPage from "./routes/editor/EditorPage";
import ExportPage from "./routes/export/ExportPage";
import LibraryPage from "./routes/library/LibraryPage";
import MarketingPage from "./routes/marketing/MarketingPage";
import NewBookPage from "./routes/new-book/NewBookPage";
import ProfileEditorPage from "./routes/profiles/ProfileEditorPage";
import ProfilesPage from "./routes/profiles/ProfilesPage";
import PublishedPage from "./routes/published/PublishedPage";
import ResearchPage from "./routes/research/ResearchPage";
import SettingsPage from "./routes/settings/SettingsPage";
import TitlesPage from "./routes/titles/TitlesPage";
import WritingPage from "./routes/writing/WritingPage";

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
      { path: "/published", element: <PublishedPage /> },
      { path: "/profiles", element: <ProfilesPage /> },
      { path: "/profiles/:profileId", element: <ProfileEditorPage /> },
      { path: "/books/new", element: <NewBookPage /> },
      { path: "/new-book", element: <Navigate to="/books/new" replace /> },
      {
        path: "/books/:bookId",
        element: <BookLayout />,
        children: [
          { index: true, element: <BookIndexRedirect /> },
          { path: "research", element: <ResearchPage /> },
          { path: "titles", element: <TitlesPage /> },
          { path: "blueprint", element: <BlueprintPage /> },
          { path: "writing", element: <WritingPage /> },
          { path: "editor/:sectionId?", element: <EditorPage /> },
          { path: "cover", element: <CoverPage /> },
          { path: "export", element: <ExportPage /> },
          { path: "marketing", element: <MarketingPage /> },
        ],
      },
      { path: "/settings/:tab?", element: <SettingsPage /> },
      { path: "/archive", element: <ArchivePage /> },
      { path: "/components", element: <ComponentsPage /> },
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
