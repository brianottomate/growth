"use client";

import * as runtime from "react/jsx-runtime";

// Import all the custom components that might be used in MDX
import { CalloutBox } from "./CalloutBox";
import { CtaCard } from "./CtaCard";
import { FeatureGrid } from "./FeatureGrid";
import { NewsletterCard } from "./NewsletterCard";
import { Quote } from "./Quote";
import { Stats } from "./Stats";
import { TLDR } from "./TLDR";
import { Video } from "./Video";
import {
  ArticleNote,
  ArticleSplit,
  ArticleBanner,
  ArticleGallery,
  ArticlePlaces,
  ArticleItinerary,
  ArticleLinks,
  ArticleVideo,
  ArticleYouTube,
  ArticleHero,
} from "./ArticleBlocks";

import {
  ArticleQuickAnswers,
  ArticleComparison,
  ArticleTradeoffs,
  ArticleFigure,
  ArticleUpdate,
} from "./ArticleDecisions";

const sharedComponents = {
  ArticleQuickAnswers,
  ArticleComparison,
  ArticleTradeoffs,
  ArticleFigure,
  ArticleUpdate,
  CalloutBox,
  CtaCard,
  FeatureGrid,
  NewsletterCard,
  Quote,
  Stats,
  TLDR,
  Video,
  ArticleNote,
  ArticleSplit,
  ArticleBanner,
  ArticleGallery,
  ArticlePlaces,
  ArticleItinerary,
  ArticleLinks,
  ArticleVideo,
  ArticleYouTube,
  ArticleHero,
};

// Parse the Velite generated MDX code into a React component function
const useMDXComponent = (code: string) => {
  // oxlint-disable-next-line typescript/no-implied-eval
  const fn = new Function(code);
  // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-member-access, typescript/no-unsafe-call
  return fn({ ...runtime }).default;
};

interface MDXProps {
  code: string;
  components?: Record<string, React.ComponentType>;
  hideDraftEvidence?: boolean;
}

// MDXContent component
export function MDXContent({ code, components, hideDraftEvidence }: MDXProps) {
  // oxlint-disable-next-line typescript/no-unsafe-assignment
  const Component = useMDXComponent(code);
  const renderArticleNote = (
    props: React.ComponentProps<typeof ArticleNote>,
  ) =>
    hideDraftEvidence && props.title === "Draft evidence" ? null : (
      <ArticleNote {...props} />
    );
  return (
    <Component
      components={{
        ...sharedComponents,
        ArticleNote: renderArticleNote,
        ...components,
      }}
    />
  );
}
