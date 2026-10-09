import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { LucideProvider } from "lucide-react";
import { MotionConfig } from "motion/react";
import { queryClient } from "../api/queryClient";
import { CommandPaletteProvider } from "../lib/commandPalette";
import { JobProvider } from "../lib/job";
import { PenNameProvider } from "../lib/penName";
import { ThemeProvider } from "../lib/theme";
import { ToastProvider } from "../lib/toast";

/** Application services are composed once, in their existing dependency order. */
export function ApplicationProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <LucideProvider size={18} strokeWidth={1.75}>
            <PenNameProvider>
              <JobProvider>
                <ToastProvider>
                  <CommandPaletteProvider>{children}</CommandPaletteProvider>
                </ToastProvider>
              </JobProvider>
            </PenNameProvider>
          </LucideProvider>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
