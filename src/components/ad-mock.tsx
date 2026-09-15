import { SocialPostMock, ctaLabel, domainOf } from "@/components/social-mock";
import { cn } from "@/components/ui/lib/utils";

export { ctaLabel, domainOf };

export type AdMockMedia = {
  url: string;
  thumbnail?: string | null;
  type?: string | null;
};

/**
 * Placements a creative can land in, with the crop each one applies. Local
 * previews render all three; Meta's own preview API renders the feed shapes
 * only from a pre-push draft, because story formats need the image uploaded
 * to the ad account first.
 */
export const AD_MOCK_SURFACES = [
  { id: "facebook", label: "Facebook feed", crop: "landscape" },
  { id: "instagram", label: "Instagram feed", crop: "square" },
  { id: "story", label: "Story / Reel", crop: "story" },
] as const;

export type AdMockSurface = (typeof AD_MOCK_SURFACES)[number]["id"];

/**
 * An ad as a feed would show it: the shared social mock with sponsored chrome,
 * the creative in the surface's crop, the domain strip and the button.
 * Instant, and nothing reaches a platform.
 */
export function AdMock({
  surface,
  brandName,
  brandLogo,
  body,
  headline,
  link,
  callToAction,
  media,
  card = 0,
  onCard,
  className,
}: {
  surface: AdMockSurface;
  brandName: string;
  brandLogo: string | null;
  body: string | null;
  headline: string | null;
  link: string | null;
  callToAction: string | null;
  media: AdMockMedia[];
  /** Which card of a carousel shows; pass `onCard` to let the viewer page. */
  card?: number;
  onCard?: (next: number) => void;
  /** Replaces the default width; the mock keeps its own radius and chrome. */
  className?: string;
}) {
  const option = AD_MOCK_SURFACES.find((entry) => entry.id === surface)!;
  const isStory = surface === "story";
  return (
    <SocialPostMock
      className={cn("shadow-lg", className ?? (isStory ? "w-64" : "w-80"))}
      crop={option.crop}
      card={card}
      // Without a pager the ad shows its first card, as before.
      onCard={onCard}
      clampText
      post={{
        platform: isStory ? "instagram" : surface,
        format: isStory ? "instagram.story" : null,
        name: brandName,
        // A wide lockup cropped to a circle shows three letters of the
        // middle of the brand's name, so the logo is contained.
        avatars: [{ url: brandLogo, fit: "contain" }],
        text: body,
        media: onCard ? media : media.slice(0, 1),
        sponsored: true,
        ad: { headline, link, callToAction },
      }}
    />
  );
}
