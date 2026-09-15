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

const sharedComponents = {
  CalloutBox,
  CtaCard,
  FeatureGrid,
  NewsletterCard,
  Quote,
  Stats,
  TLDR,
  Video,
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
}

// MDXContent component
export function MDXContent({ code, components }: MDXProps) {
  // oxlint-disable-next-line typescript/no-unsafe-assignment
  const Component = useMDXComponent(code);
  return <Component components={{ ...sharedComponents, ...components }} />;
}
