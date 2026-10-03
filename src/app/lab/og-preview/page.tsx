import { posts } from "#velite";
import { DEFAULT_OG_OPTIONS, OG_PRESETS, type OgPreset } from "@/lib/og-studio";
import { OgStudio } from "./og-studio";

export const metadata = { title: "OG Studio" };

export default function OgPreviewPage() {
  const blogPresets: OgPreset[] = posts
    .filter((post) => post.isPublished)
    .map((post) => ({
      label: post.h1,
      path: post.permalink,
      options: {
        ...DEFAULT_OG_OPTIONS,
        title: post.metaTitle,
        description: post.metaDescription,
        eyebrow: "Blog",
        footer: "Wander growth team",
      },
    }));
  return <OgStudio presets={[...OG_PRESETS, ...blogPresets]} />;
}
