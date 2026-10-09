"use client";

import type {
  CopyLabBrand,
  CopyLabHome,
  CopyLabVariant,
  CopyLabRunResult,
  CopyLabAction,
} from "@/lib/copy-lab";
import { COPY_LAB_DIRECTIONS } from "@/lib/copy-lab";
import { CompositionBuilder } from "./composition-builder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function Layer({
  title,
  text,
  open = false,
}: {
  title: string;
  text: string;
  open?: boolean;
}) {
  return (
    <details open={open} className="rounded-lg border bg-background">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
        {title}
      </summary>
      <pre className="max-h-72 overflow-auto border-t p-3 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
        {text || "None"}
      </pre>
    </details>
  );
}

export function PromptInspector({
  brand,
  home,
  homes,
  variant,
  basePrompts,
  result,
  stale,
  onChange,
  onRun,
  busy,
  canRun,
  photos,
  photoUrl,
  onPhoto,
}: {
  brand: CopyLabBrand;
  home?: CopyLabHome;
  homes: CopyLabHome[];
  variant: CopyLabVariant;
  basePrompts: { ad: string; photo: string };
  result?: CopyLabRunResult;
  stale: boolean;
  onChange: (patch: Partial<CopyLabVariant>) => void;
  onRun: (action: CopyLabAction) => void;
  busy: boolean;
  canRun: boolean;
  photos: CopyLabHome["photos"];
  photoUrl?: string;
  onPhoto: (url: string) => void;
}) {
  const ideas = variant.ideas ?? {
    statusQuo: true,
    starter: true,
    homeOccasion: false,
    brandShowcase: false,
    occasion: "Friends’ reunion",
    featuredHomeIds: homes.slice(0, 3).map((h) => h.id),
  };
  const changeIdeas = (patch: Partial<typeof ideas>) =>
    onChange({
      ideas: { ...ideas, statusQuo: ideas.statusQuo ?? true, ...patch },
    });
  return (
    <aside className="min-w-0 self-start rounded-xl border bg-muted/30 p-4">
      <div className="mb-4 space-y-1">
        <h2 className="font-semibold">Prompt build</h2>
        <p className="text-xs text-muted-foreground">
          {variant.label} · {variant.model ?? "Production model"}
        </p>
        <p className="text-xs text-muted-foreground">
          Try a direction on this home. Runs stay in this browser; production
          prompts and records are unchanged.
        </p>
      </div>
      <div className="mb-5 space-y-3 border-b pb-4">
        <label className="block space-y-1 text-xs font-medium">
          <span>Prompt preset</span>
          <SimpleSelect
            aria-label="Prompt preset"
            value={
              COPY_LAB_DIRECTIONS.find((p) => p.label === variant.label)?.id ??
              "production"
            }
            options={[
              { value: "production", label: "Production-derived baseline" },
              ...COPY_LAB_DIRECTIONS.map((p) => ({
                value: p.id,
                label: p.label,
              })),
            ]}
            onValueChange={(id) => {
              const preset = COPY_LAB_DIRECTIONS.find((p) => p.id === id);
              onChange({
                label: preset?.label ?? "Production",
                appendix: preset?.text ?? "",
                adSystem: preset?.adSystem ?? null,
                photoSystem: preset?.photoSystem ?? null,
                compositions: preset?.compositions ?? variant.compositions,
                homeSystem: null,
                system: null,
              });
            }}
          />
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>Editable direction · appended to each call</span>
          <Textarea
            rows={5}
            value={variant.appendix}
            onChange={(event) => onChange({ appendix: event.target.value })}
            placeholder="Try a different opening, audience or story…"
          />
        </label>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="xs" variant="outline">
              Edit system prompts
            </Button>
          </DialogTrigger>
          <DialogContent size="lg" className="max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Local system prompt overrides</DialogTitle>
              <DialogDescription>
                Reset an override to use the production-derived baseline. Your
                direction is appended afterwards.
              </DialogDescription>
            </DialogHeader>
            {(["adSystem", "photoSystem"] as const).map((field) => (
              <div key={field} className="space-y-2 text-sm font-medium">
                <label htmlFor={`copy-lab-${field}`} className="block">
                  {field === "adSystem"
                    ? "Ad copy system prompt"
                    : "Photo copy system prompt"}
                </label>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    onChange({ [field]: null, homeSystem: null, system: null })
                  }
                >
                  Reset to baseline
                </Button>
                <Textarea
                  id={`copy-lab-${field}`}
                  rows={8}
                  value={
                    variant[field] ??
                    variant.homeSystem ??
                    variant.system ??
                    basePrompts[field === "adSystem" ? "ad" : "photo"]
                  }
                  onChange={(event) =>
                    onChange({ [field]: event.target.value || null })
                  }
                  placeholder="Production-derived baseline"
                />
              </div>
            ))}
          </DialogContent>
        </Dialog>
        <label className="block space-y-1 text-xs font-medium">
          <span>Photo selection</span>
          <SimpleSelect
            aria-label="Photo selection"
            value={variant.photoSelection ?? "model"}
            options={[
              { value: "model", label: "AI · choose hero + carousel" },
              { value: "selected", label: "Selected hero + next photos" },
            ]}
            onValueChange={(value) =>
              onChange({ photoSelection: value as "model" | "selected" })
            }
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {variant.photoSelection === "selected"
            ? "Use the selected hero and the next two fixture photos."
            : "AI reviews all fixture photos and chooses a hero and carousel sequence around the direction. Choices and reasons are saved with the run. Slide templates apply to the chosen sequence."}
        </p>
        <label className="flex items-start gap-2 rounded-lg border bg-background p-3 text-xs">
          <input
            type="checkbox"
            checked={ideas.statusQuo !== false}
            onChange={(e) => changeIdeas({ statusQuo: e.target.checked })}
          />
          <span>
            <strong>Status-quo comparison</strong>
            <span className="mt-1 block text-muted-foreground">
              Location and amenities first, on the same photos and layouts.
              Generated with Write both; experimental system prompts and
              directions do not apply.
            </span>
          </span>
        </label>
        <fieldset className="space-y-3 rounded-lg border bg-background p-3">
          <legend className="px-1 text-xs font-semibold">
            Ideas to generate
          </legend>
          {(
            [
              ["starter", "Experimental starter · static + home carousel"],
              ["homeOccasion", "One home · one occasion"],
              ["brandShowcase", "Brand showcase · multiple homes"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={ideas[key]}
                onChange={(e) => changeIdeas({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          {ideas.homeOccasion && (
            <label className="block space-y-1 text-xs">
              <span>One-home occasion</span>
              <Textarea
                aria-label="One-home occasion"
                rows={2}
                value={ideas.occasion}
                onChange={(e) => changeIdeas({ occasion: e.target.value })}
              />
            </label>
          )}
          {ideas.brandShowcase && (
            <div className="max-h-52 space-y-2 overflow-auto">
              <p className="text-xs text-muted-foreground">
                Featured homes · choose 2–4
              </p>
              {homes.map((h) => (
                <label key={h.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ideas.featuredHomeIds.includes(h.id)}
                    disabled={
                      !ideas.featuredHomeIds.includes(h.id) &&
                      ideas.featuredHomeIds.length >= 4
                    }
                    onChange={(e) =>
                      changeIdeas({
                        featuredHomeIds: e.target.checked
                          ? [...ideas.featuredHomeIds, h.id]
                          : ideas.featuredHomeIds.filter((id) => id !== h.id),
                      })
                    }
                  />
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={h.photos[0]?.thumbUrl ?? h.heroUrl ?? ""}
                    alt=""
                    className="size-9 rounded object-cover"
                  />
                  <span>{h.name}</span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Write both generates the selected ideas, each with its own copy and
            review tab. Expanded carousels include an opener and a closer.
          </p>
        </fieldset>
        <CompositionBuilder
          value={variant.compositions}
          home={home}
          photoUrl={photoUrl}
          automaticPhotos={variant.photoSelection !== "selected"}
          onChange={(compositions) => onChange({ compositions })}
        />
        <p className="text-xs text-muted-foreground">
          Fixture photos · click to choose a hero manually
        </p>
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          aria-label="Choose hero photo"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.url}
              type="button"
              disabled={busy}
              aria-label={`Use photo ${index + 1}`}
              aria-pressed={photo.url === photoUrl}
              onClick={() => {
                onChange({ photoSelection: "selected" });
                onPhoto(photo.url);
              }}
              className={`w-16 shrink-0 overflow-hidden rounded border ${photo.url === photoUrl ? "ring-2 ring-foreground" : ""}`}
            >
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                src={photo.thumbUrl ?? photo.url}
                alt=""
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canRun}
            onClick={() => onRun("ad")}
          >
            Write ad copy
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canRun}
            onClick={() => onRun("photo")}
          >
            Write photo copy
          </Button>
          <Button
            size="sm"
            className="col-span-2"
            disabled={
              busy ||
              !canRun ||
              (ideas.statusQuo === false &&
                !ideas.starter &&
                !ideas.homeOccasion &&
                !ideas.brandShowcase) ||
              (ideas.brandShowcase && ideas.featuredHomeIds.length < 2)
            }
            onClick={() => onRun("both")}
          >
            {busy ? "Writing…" : "Write both"}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Current ingredients
        </h3>
        <Layer
          title={`1 · Brand story ${variant.story ? "· included" : "· excluded"}`}
          text={
            variant.story
              ? (brand.story ?? "No story in fixture")
              : "Brand story is disabled for this variant."
          }
        />
        <Layer
          title="Brand voice · home ads"
          text={
            brand.fingerprint ?? "No brand voice fingerprint in this fixture."
          }
        />
        <Layer
          title="2 · Home facts and source material"
          text={
            home
              ? JSON.stringify(
                  {
                    name: home.name,
                    place: home.place,
                    bedrooms: home.bedrooms,
                    bathrooms: home.bathrooms,
                    guests: home.guests,
                    amenities: home.amenities,
                    description: home.description,
                  },
                  null,
                  2,
                )
              : "Choose a home."
          }
        />
        <Layer
          title="3 · Ad copy system prompt"
          text={
            variant.adSystem ??
            variant.homeSystem ??
            variant.system ??
            basePrompts.ad
          }
        />
        <Layer
          title="Photo copy system prompt · layout rules"
          text={
            variant.photoSystem ??
            variant.homeSystem ??
            variant.system ??
            basePrompts.photo
          }
        />
        <Layer
          title={`4 · Photos ${variant.images ? "· included" : "· excluded"}`}
          text={
            variant.images
              ? variant.photoSelection === "selected"
                ? "Selected hero and up to two more fixture photos. Actual attachments appear in the run trace."
                : "All fixture photos are reviewed on numbered contact sheets. The selected hero and carousel photos are then sent to the copy writer. The photo plan and attachments are saved with the run."
              : "Photo attachments are excluded."
          }
        />
        <Layer
          title="5 · Appended instructions"
          text={variant.appendix || "No appended instructions."}
        />
      </div>
      {result && (
        <div className="mt-5 space-y-3 border-t pt-4">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Actual run · message order
          </h3>
          {stale && (
            <p className="text-xs text-muted-foreground">
              Settings changed. The trace below belongs to the previous run.
            </p>
          )}
          {result?.promptTrace?.map((call, index) => (
            <details
              key={index}
              open={index === 0}
              className="rounded-lg border bg-background p-3"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {index + 1} · {call.label}
              </summary>
              <div className="mt-3 space-y-2">
                <Layer
                  title="System · base or replacement"
                  text={call.system}
                />
                {call.system !== call.baseSystem && (
                  <Layer
                    title="Original baseline system · replaced"
                    text={call.baseSystem}
                  />
                )}
                <Layer
                  title="System · appended instructions"
                  text={call.appendix}
                />
                {call.content.map((part, i) => (
                  <Layer
                    key={i}
                    title={`User block ${i + 1} · ${part.kind === "text" ? "text" : "image attachment"}`}
                    text={part.text}
                  />
                ))}
              </div>
            </details>
          ))}
          {result && !result.promptTrace && (
            <Layer
              title="Saved system prompt · older run"
              text={result.system}
            />
          )}
          {Boolean(result?.problems.length) && (
            <Layer
              title="Validation and retry feedback"
              text={result.problems.join("\n\n")}
            />
          )}
        </div>
      )}
    </aside>
  );
}
