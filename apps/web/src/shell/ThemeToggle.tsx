import { Moon, Sun } from "lucide-react";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { IconButton } from "../components/ui/IconButton";
import { useTheme, type Theme } from "../lib/theme";

/** Light and Dark switch. Follows the system until the owner picks one; the choice is remembered. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, toggle } = useTheme();
  if (compact) {
    return <IconButton icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle} />;
  }
  return (
    <SegmentedControl<Theme>
      label="Theme"
      size="sm"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "light", label: "Light", icon: Sun },
        { value: "dark", label: "Dark", icon: Moon },
      ]}
    />
  );
}
