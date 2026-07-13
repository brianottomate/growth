"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SOCIAL_PREVIEW_META,
  SOCIAL_PREVIEW_MODES,
  type SocialPreviewMode,
} from "@/lib/social-preview";

export function SocialPreviewSelect() {
  const [preview, setPreview] = useQueryState(
    "preview",
    parseAsStringLiteral(SOCIAL_PREVIEW_MODES)
      .withDefault("original")
      .withOptions({
        history: "push",
        shallow: false,
        scroll: false,
        clearOnDefault: true,
      }),
  );

  return (
    <Select
      value={preview}
      onValueChange={(value) => void setPreview(value as SocialPreviewMode)}
    >
      <SelectTrigger className="w-[165px]" aria-label="Preview social crop">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SOCIAL_PREVIEW_MODES.map((mode) => (
          <SelectItem key={mode} value={mode}>
            {SOCIAL_PREVIEW_META[mode].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
