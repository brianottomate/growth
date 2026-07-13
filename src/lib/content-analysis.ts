export const CONTENT_ANALYSIS_VERSION = 1;
export const CONTENT_ANALYSIS_MODEL = "claude-sonnet-4-6";

export const CONTENT_ARTIFACT_KINDS = [
  "website",
  "blog",
  "newsletter",
] as const;

export type ContentArtifactKind = (typeof CONTENT_ARTIFACT_KINDS)[number];

export type ContentAnalysis = {
  kind: ContentArtifactKind;
  summary: string;
  themes: string[];
  audience: string;
  purpose: string;
  funnelStage: "awareness" | "consideration" | "conversion" | "retention";
  tone: string[];
  keyTakeaways: string[];
  strengths: string[];
  risks: string[];
  recommendations: string[];
  website: {
    searchIntent: string;
    conversionPath: string[];
    metadataIssues: string[];
    ogAssessment: string;
  } | null;
  blog: {
    hook: string;
    thesis: string;
    evidenceAssessment: string;
    evergreenPotential: string;
    repurposingIdeas: string[];
  } | null;
  newsletter: {
    subjectAssessment: string;
    lifecycleRole: string;
    offer: string | null;
    ctaHierarchy: string[];
    scannability: string;
  } | null;
  version: number;
  model: string;
  analyzedAt: string;
  sourceHash: string;
  sourceUrl: string | null;
  steer?: string;
  handoffPrompt: string;
};

export type WebsitePortfolioAnalysis = {
  summary: string;
  health: {
    narrative: string;
    navigation: string;
    conversion: string;
    seo: string;
    visualConsistency: string;
  };
  strengths: string[];
  systemicIssues: string[];
  priorities: Array<{
    priority: "high" | "medium" | "low";
    title: string;
    rationale: string;
    affectedPages: string[];
    recommendedAction: string;
  }>;
  pageFindings: Array<{
    path: string;
    finding: string;
    recommendation: string;
  }>;
  opportunities: string[];
  version: number;
  model: string;
  analyzedAt: string;
  sourceHash: string;
  scope: {
    brandIds: string[];
    brandNames: string[];
    pagesAnalyzed: number;
    imagesAnalyzed: number;
    includedSavedPageAnalyses: boolean;
  };
  handoffPrompt: string;
};

export function readContentAnalysis(value: unknown): ContentAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const metadata = value as Record<string, unknown>;
  const candidate = metadata.aiAnalysis;
  if (!candidate || typeof candidate !== "object") return null;
  const analysis = candidate as Partial<ContentAnalysis>;
  if (
    !CONTENT_ARTIFACT_KINDS.includes(analysis.kind!) ||
    typeof analysis.summary !== "string" ||
    !Array.isArray(analysis.recommendations) ||
    typeof analysis.handoffPrompt !== "string"
  ) {
    return null;
  }
  return analysis as ContentAnalysis;
}

export function readWebsitePortfolioAnalysis(
  value: unknown,
): WebsitePortfolioAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>).portfolioAnalysis;
  if (!candidate || typeof candidate !== "object") return null;
  const analysis = candidate as Partial<WebsitePortfolioAnalysis>;
  if (
    typeof analysis.summary !== "string" ||
    !Array.isArray(analysis.priorities) ||
    typeof analysis.handoffPrompt !== "string" ||
    !analysis.scope
  ) {
    return null;
  }
  return analysis as WebsitePortfolioAnalysis;
}
