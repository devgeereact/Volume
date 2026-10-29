import { Moon, Sun } from "lucide-react";
import { IconButton } from "../components/ui/IconButton";
import { useTheme } from "../lib/theme";

/**
 * Light and dark switch in the top bar: a moon by day, a sun at night. Follows the system until the owner
 * picks one; the choice is remembered. Settings and the command menu also set the theme or follow the system.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      variant="glass"
      label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    />
  );
}
