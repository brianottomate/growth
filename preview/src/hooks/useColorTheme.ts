import type {
  BackgroundRole,
  ResolvedTokens,
  Scales,
  SeedColors,
} from "@wandercom/design-system-tokens/color-engine";
import {
  CSS_VAR_MAP,
  generateExportCSS,
  generateScales,
  PRESETS,
  resolveRoleTokens,
} from "@wandercom/design-system-tokens/color-engine";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "blocks-preview-color-theme";

export interface ColorThemeState {
  presetId: string | null;
  customSeeds: SeedColors | null;
  backgroundRole: BackgroundRole;
}

const DEFAULT_STATE: ColorThemeState = {
  presetId: null,
  customSeeds: null,
  backgroundRole: "white",
};

const VALID_BACKGROUND_ROLES = new Set<string>([
  "white",
  "black",
  "theme-light",
  "theme-base",
  "theme-dark",
  "accent-primary-light",
  "accent-primary-base",
  "accent-secondary-light",
  "accent-secondary-base",
  "accent-secondary-dark",
]);

const VALID_SEED_KEYS: (keyof SeedColors)[] = ["brand", "accentPrimary", "accentSecondary"];

function isValidSeeds(value: unknown): value is SeedColors {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return VALID_SEED_KEYS.every((key) => typeof obj[key] === "string");
}

function loadState(): ColorThemeState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_STATE };
      const obj = parsed as Record<string, unknown>;

      const backgroundRole =
        typeof obj.backgroundRole === "string" && VALID_BACKGROUND_ROLES.has(obj.backgroundRole)
          ? (obj.backgroundRole as BackgroundRole)
          : DEFAULT_STATE.backgroundRole;

      const presetId =
        typeof obj.presetId === "string" && (obj.presetId === "custom" || obj.presetId in PRESETS)
          ? obj.presetId
          : DEFAULT_STATE.presetId;

      const customSeeds = isValidSeeds(obj.customSeeds)
        ? obj.customSeeds
        : DEFAULT_STATE.customSeeds;

      return { presetId, customSeeds, backgroundRole };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_STATE };
}

function saveState(state: ColorThemeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function tokensToCssVars(tokens: ResolvedTokens): [string, string][] {
  const pairs: [string, string][] = [];

  const categories: [string, Record<string, string>][] = [
    ["surface", tokens.surface],
    ["text", tokens.text],
    ["button.foreground", tokens.button.foreground],
    ["button.background", tokens.button.background],
    ["button.backgroundHover", tokens.button.backgroundHover],
    ["border", tokens.border],
    ["semantic", tokens.semantic],
  ];

  for (const [category, values] of categories) {
    const varMap = CSS_VAR_MAP[category];
    if (!varMap) continue;
    for (const [name, value] of Object.entries(values)) {
      const cssVar = varMap[name];
      if (cssVar) {
        pairs.push([cssVar, value]);
      }
    }
  }

  return pairs;
}

const ALL_CSS_VARS = Object.values(CSS_VAR_MAP).flatMap((group) => Object.values(group));

// V1 ThemeCustomizer vars that may still be set on the document
const LEGACY_VARS = ["--color-button-focus-primary", "--color-button-focus-secondary"];

export const PRESET_ENTRIES = Object.entries(PRESETS).filter(([name]) => name !== "Wander");

export const BACKGROUND_ROLES: {
  id: BackgroundRole;
  label: string;
  group: string;
}[] = [
  { id: "white", label: "Default", group: "Neutral" },
  { id: "black", label: "Black", group: "Neutral" },
  { id: "theme-light", label: "Theme Light", group: "Theme" },
  { id: "theme-base", label: "Theme Base", group: "Theme" },
  { id: "theme-dark", label: "Theme Dark", group: "Theme" },
  {
    id: "accent-primary-light",
    label: "Accent Primary Light",
    group: "Accent Primary",
  },
  {
    id: "accent-primary-base",
    label: "Accent Primary Base",
    group: "Accent Primary",
  },
  {
    id: "accent-secondary-light",
    label: "Accent Secondary Light",
    group: "Accent Secondary",
  },
  {
    id: "accent-secondary-base",
    label: "Accent Secondary Base",
    group: "Accent Secondary",
  },
  {
    id: "accent-secondary-dark",
    label: "Accent Secondary Dark",
    group: "Accent Secondary",
  },
];

export function useColorTheme() {
  const [state, setState] = useState<ColorThemeState>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_STATE };
    return loadState();
  });

  const seeds: SeedColors | null = useMemo(() => {
    if (state.presetId === "custom") return state.customSeeds;
    if (state.presetId) {
      const preset = PRESETS[state.presetId];
      if (preset) return preset;
    }
    return null;
  }, [state.presetId, state.customSeeds]);

  const scales: Scales | null = useMemo(() => {
    if (!seeds) return null;
    return generateScales(seeds);
  }, [seeds]);

  const tokens: ResolvedTokens | null = useMemo(() => {
    if (!scales) return null;
    return resolveRoleTokens(state.backgroundRole, scales).tokens;
  }, [scales, state.backgroundRole]);

  // Apply CSS variables to document
  useEffect(() => {
    const root = document.documentElement;

    if (tokens) {
      const vars = tokensToCssVars(tokens);
      for (const [property, value] of vars) {
        root.style.setProperty(property, value);
      }
      // Bridge focus vars
      const hoverPrimary = root.style.getPropertyValue("--color-button-hover-primary");
      if (hoverPrimary) root.style.setProperty("--color-button-focus-primary", hoverPrimary);
      const hoverSecondary = root.style.getPropertyValue("--color-button-hover-secondary");
      if (hoverSecondary) root.style.setProperty("--color-button-focus-secondary", hoverSecondary);
    } else {
      for (const prop of ALL_CSS_VARS) {
        root.style.removeProperty(prop);
      }
      for (const prop of LEGACY_VARS) {
        root.style.removeProperty(prop);
      }
    }
  }, [tokens]);

  // Inject per-role [data-theme="..."] CSS so components can opt into a
  // different background role via the data-theme attribute.
  useEffect(() => {
    const STYLE_ID = "color-theme-roles";
    if (scales) {
      let el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
      }
      el.textContent = generateExportCSS(scales);
    } else {
      document.getElementById(STYLE_ID)?.remove();
    }
    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }, [scales]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const setPreset = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, presetId: id, customSeeds: null }));
  }, []);

  const setCustomSeeds = useCallback((newSeeds: SeedColors) => {
    setState((prev) => ({
      ...prev,
      presetId: "custom",
      customSeeds: newSeeds,
    }));
  }, []);

  const setBackgroundRole = useCallback((role: BackgroundRole) => {
    setState((prev) => ({ ...prev, backgroundRole: role }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE });
  }, []);

  const isActive = state.presetId !== null;

  return {
    presetId: state.presetId,
    customSeeds: state.customSeeds,
    backgroundRole: state.backgroundRole,
    seeds,
    scales,
    tokens,
    isActive,
    setPreset,
    setCustomSeeds,
    setBackgroundRole,
    reset,
  };
}
