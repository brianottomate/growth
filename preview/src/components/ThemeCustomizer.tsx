import type {
  BackgroundRole,
  Scales,
  SeedColors,
} from "@wandercom/design-system-tokens/color-engine";
import { resolveRole } from "@wandercom/design-system-tokens/color-engine";
import { Button } from "@wandercom/design-system-web/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@wandercom/design-system-web/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@wandercom/design-system-web/ui/select";
import { Separator } from "@wandercom/design-system-web/ui/separator";
import { Text } from "@wandercom/design-system-web/ui/text";
import { PaletteIcon } from "lucide-react";
import { BACKGROUND_ROLES, PRESET_ENTRIES, useColorTheme } from "../hooks/useColorTheme";

const SEED_FIELDS: { key: keyof SeedColors; label: string }[] = [
  { key: "brand", label: "Brand" },
  { key: "accentPrimary", label: "Accent Primary" },
  { key: "accentSecondary", label: "Accent Secondary" },
];

const NONE_VALUE = "__none__";

function PresetSelect({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <Select
      value={activeId ?? NONE_VALUE}
      onValueChange={(v) => onSelect(v === NONE_VALUE ? null : v)}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-60">
        <SelectItem value={NONE_VALUE}>Default</SelectItem>
        <SelectSeparator />
        {PRESET_ENTRIES.map(([name, seeds]) => (
          <SelectItem key={name} value={name}>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                <span
                  className="border-primary size-3 rounded-full border"
                  style={{ backgroundColor: seeds.brand }}
                />
                <span
                  className="border-primary size-3 rounded-full border"
                  style={{ backgroundColor: seeds.accentPrimary }}
                />
                <span
                  className="border-primary size-3 rounded-full border"
                  style={{ backgroundColor: seeds.accentSecondary }}
                />
              </div>
              <span>{name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SeedColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-surface-tertiary size-7 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
        aria-label={`${label} color`}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Text variant="body-sm" color="secondary" as="span">
          {label}
        </Text>
        <span className="text-tertiary font-mono text-[11px]">{value}</span>
      </div>
    </label>
  );
}

function SeedInputs({
  seeds,
  onChange,
}: {
  seeds: SeedColors;
  onChange: (seeds: SeedColors) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {SEED_FIELDS.map(({ key, label }) => (
        <SeedColorInput
          key={key}
          label={label}
          value={seeds[key]}
          onChange={(hex) => onChange({ ...seeds, [key]: hex })}
        />
      ))}
    </div>
  );
}

function RoleSelector({
  activeRole,
  scales,
  disabled,
  onSelect,
}: {
  activeRole: BackgroundRole;
  scales: Scales | null;
  disabled: boolean;
  onSelect: (role: BackgroundRole) => void;
}) {
  const getHex = (id: BackgroundRole) =>
    scales
      ? resolveRole(id, scales)
      : id === "white"
        ? "#ffffff"
        : id === "black"
          ? "#000000"
          : "#888888";

  return (
    <Select
      value={activeRole}
      onValueChange={(v) => onSelect(v as BackgroundRole)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-60">
        {BACKGROUND_ROLES.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            <div className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: getHex(role.id) }}
              />
              <span>{role.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ThemeCustomizer() {
  const theme = useColorTheme();

  const displaySeeds: SeedColors = theme.seeds ?? {
    brand: "#3b82f6",
    accentPrimary: "#10b981",
    accentSecondary: "#f59e0b",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={
            theme.isActive
              ? "bg-surface-secondary text-primary hover:bg-surface-tertiary hover:text-primary"
              : "text-tertiary hover:bg-surface-secondary hover:text-primary"
          }
          title="Customize theme colors"
        >
          <PaletteIcon className="size-3.5" />
          <span>Theme</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent side="top" align="start" sideOffset={8} className="w-72">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <Text variant="body" color="primary" weight="medium">
              Preset
            </Text>
            <PresetSelect
              activeId={theme.presetId !== "custom" ? theme.presetId : null}
              onSelect={theme.setPreset}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="body" color="primary" weight="medium">
              Surface
            </Text>
            <RoleSelector
              activeRole={theme.backgroundRole}
              scales={theme.scales}
              disabled={!theme.isActive}
              onSelect={theme.setBackgroundRole}
            />
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2 p-4">
          <Text variant="body" color="primary" weight="medium">
            Custom
          </Text>
          <SeedInputs seeds={displaySeeds} onChange={theme.setCustomSeeds} />
        </div>

        <div className="flex items-center justify-between px-4 pb-4">
          <Button
            variant="secondary"
            onClick={theme.reset}
            disabled={!theme.isActive}
            className="w-full"
            size="md"
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
