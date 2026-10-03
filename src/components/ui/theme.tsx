"use client";

import * as React from "react";
import * as z from "zod/v4";
import { Sun, Moon, Monitor } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ThemeModeSchema = z.enum(["light", "dark", "auto"]);

const themeKey = "theme-mode";

export type ThemeMode = z.output<typeof ThemeModeSchema>;
export type ResolvedTheme = Exclude<ThemeMode, "auto">;

const getStoredThemeMode = (): ThemeMode => {
  // No stored preference → follow the browser (prefers-color-scheme) via "auto",
  // rather than forcing dark. Only an explicit Light/Dark/System choice persists.
  if (typeof window === "undefined") return "auto";
  try {
    const storedTheme = localStorage.getItem(themeKey);
    return ThemeModeSchema.parse(storedTheme);
  } catch {
    return "auto";
  }
};

const setStoredThemeMode = (theme: ThemeMode) => {
  try {
    const parsedTheme = ThemeModeSchema.parse(theme);
    localStorage.setItem(themeKey, parsedTheme);
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

const getSystemTheme = () => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const updateThemeClass = (themeMode: ThemeMode) => {
  const root = document.documentElement;
  const newTheme = themeMode === "auto" ? getSystemTheme() : themeMode;
  root.setAttribute("data-theme", newTheme);
};

// Circular reveal from the bottom-left, where the theme switcher lives in the
// sidebar footer. Plain swap when the View Transitions API is missing or the
// user prefers reduced motion.
const withCircularReveal = (apply: () => void) => {
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply();
    return;
  }
  const x = 32;
  const y = window.innerHeight - 32;
  const radius = Math.hypot(window.innerWidth - x, y);
  const transition = document.startViewTransition(apply);
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 500,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      // Rapid toggles abort the previous transition; nothing to recover.
    });
};

const setupPreferredListener = () => {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => updateThemeClass("auto");
  mediaQuery.addEventListener("change", handler);
  return () => mediaQuery.removeEventListener("change", handler);
};

const getNextTheme = (current: ThemeMode): ThemeMode => {
  const themes: ThemeMode[] =
    getSystemTheme() === "dark"
      ? ["auto", "light", "dark"]
      : ["auto", "dark", "light"];

  return themes[(themes.indexOf(current) + 1) % themes.length]!;
};

interface ThemeContextProps {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  toggleMode: () => void;
}
const ThemeContext = React.createContext<ThemeContextProps | undefined>(
  undefined,
);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  // Initialize deterministically so the server-rendered HTML and the first
  // client render agree (both "dark"). Reading localStorage during the initial
  // render would diverge from the server and cause a hydration mismatch — the
  // client instrumentation corrects the visible theme before hydration.
  const [themeMode, setThemeMode] = React.useState<ThemeMode>("dark");

  // After mount, sync to the real stored preference.
  React.useEffect(() => {
    setThemeMode(getStoredThemeMode());
  }, []);

  React.useEffect(() => {
    if (themeMode !== "auto") return;
    return setupPreferredListener();
  }, [themeMode]);

  const resolvedTheme = themeMode === "auto" ? getSystemTheme() : themeMode;

  const setTheme = (newTheme: ThemeMode) => {
    setStoredThemeMode(newTheme);
    withCircularReveal(() => {
      setThemeMode(newTheme);
      updateThemeClass(newTheme);
    });
  };

  const toggleMode = () => {
    setTheme(getNextTheme(themeMode));
  };

  return (
    <ThemeContext
      value={{
        themeMode,
        resolvedTheme,
        setTheme,
        toggleMode,
      }}
    >
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const context = React.use(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function ThemeToggle() {
  const { setTheme, themeMode } = useTheme();

  return (
    <TooltipProvider>
      <ToggleGroup
        type="single"
        value={themeMode}
        onValueChange={(value) => {
          if (value) setTheme(value as ThemeMode);
        }}
        className="rounded-lg border border-primary"
        suppressHydrationWarning
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="light"
              aria-label="Light theme"
              suppressHydrationWarning
            >
              <Sun className="size-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <span className="text-xs">Light</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="dark"
              aria-label="Dark theme"
              suppressHydrationWarning
            >
              <Moon className="size-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <span className="text-xs">Dark</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="auto"
              aria-label="System theme"
              suppressHydrationWarning
            >
              <Monitor className="size-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            <span className="text-xs">System</span>
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}

export function ThemeToggleDropdown() {
  const { setTheme, themeMode } = useTheme();

  const themeConfig = {
    light: { icon: Sun, label: "Light" },
    dark: { icon: Moon, label: "Dark" },
    auto: { icon: Monitor, label: "System" },
  };

  const CurrentIcon = themeConfig[themeMode].icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Toggle theme"
          suppressHydrationWarning
        >
          <CurrentIcon className="size-4" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" suppressHydrationWarning>
        <DropdownMenuRadioGroup
          value={themeMode}
          onValueChange={(value) => setTheme(value as ThemeMode)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="auto">
            <Monitor className="size-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
