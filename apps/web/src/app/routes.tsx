import { Navigate, type RouteObject } from "react-router";
import { AppShell } from "../shell/AppShell";
import { BookLayout } from "../shell/BookLayout";
import { NotFound } from "../shell/NotFound";
import { RouteError } from "../shell/RouteError";
import BookIndexRedirect from "../features/books/BookIndexRedirect";
import LibraryPage from "../features/library/LibraryPage";
import { screens } from "../screens";
import { hostedSignIn } from "../auth/HostedAuth";

/**
 * A pathless route whose error boundary catches its screens inside the layout above it, so a screen
 * error shows within the app shell (and the book layout) with a way back, not on a bare page.
 */
export function screenErrors(children: RouteObject[]): RouteObject {
  return { errorElement: <RouteError />, children };
}

// Screen paths and navigation share the same catalogue; preserve aliases and lazy chunks.
// The outer errorElement is the last resort, for an error in the shell itself.
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      screenErrors([
        { path: "/", element: <LibraryPage /> },
        { path: "/library", element: <LibraryPage /> },
        { path: screens.published.path, lazy: async () => ({ Component: (await import("../features/published/PublishedPage")).default }) },
        { path: screens.profiles.path, lazy: async () => ({ Component: (await import("../features/profiles/ProfilesPage")).default }) },
        { path: screens["profile-editor"].path, lazy: async () => ({ Component: (await import("../features/profiles/ProfileEditorPage")).default }) },
        { path: screens["new-book"].path, lazy: async () => ({ Component: (await import("../features/new-book/NewBookPage")).default }) },
        { path: "/new-book", element: <Navigate to="/books/new" replace /> },
        {
          path: "/books/:bookId",
          element: <BookLayout />,
          children: [
            screenErrors([
              { index: true, element: <BookIndexRedirect /> },
              {
                path: screens.research.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/research/ResearchPage")).default }),
              },
              {
                path: screens.titles.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/titles/TitlesPage")).default }),
              },
              {
                path: screens.blueprint.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/blueprint/BlueprintPage")).default }),
              },
              {
                path: screens.writing.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/writing/WritingPage")).default }),
              },
              {
                path: screens.editor.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/editor/EditorPage")).default }),
              },
              // Every claim of the book in one place (not a step); linked from the editor's Claims tab and preflight.
              { path: "claims", lazy: async () => ({ Component: (await import("../features/editor/ClaimsPage")).default }) },
              {
                path: screens.cover.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/cover/CoverPage")).default }),
              },
              {
                path: screens.export.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/export/ExportPage")).default }),
              },
              {
                path: screens.marketing.path.replace("/books/:bookId/", ""),
                lazy: async () => ({ Component: (await import("../features/marketing/MarketingPage")).default }),
              },
            ]),
          ],
        },
        { path: screens.settings.path, lazy: async () => ({ Component: (await import("../features/settings/SettingsPage")).default }) },
        { path: screens.volume.path, lazy: async () => ({ Component: (await import("../features/volume-mode/BatchesPage")).default }) },
        { path: "/volume/batches/:batchId", lazy: async () => ({ Component: (await import("../features/volume-mode/BatchDetailPage")).default }) },
        { path: screens.schedule.path, lazy: async () => ({ Component: (await import("../features/volume-mode/SchedulePage")).default }) },
        { path: screens.archive.path, lazy: async () => ({ Component: (await import("../features/archive/ArchivePage")).default }) },
        // The developer style guide is for local builds only; the hosted app answers it with Page not found.
        ...(hostedSignIn ? [] : [{ path: "/components", lazy: async () => ({ Component: (await import("../features/components/ComponentsPage")).default }) }]),
        { path: "*", element: <NotFound /> },
      ]),
    ],
  },
];
