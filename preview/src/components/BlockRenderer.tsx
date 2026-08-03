import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Separator } from "@wandercom/design-system-web/ui/separator";
import { BlogGallery } from "@wandercom/website-registry/components/BlogGallery";
import { BookDirect } from "@wandercom/website-registry/components/BookDirect/BookDirect";
import { CallToAction } from "@wandercom/website-registry/components/CallToAction";
import { CallToActionCards } from "@wandercom/website-registry/components/Cards/CallToActionCards";
import { ContentCards } from "@wandercom/website-registry/components/Cards/ContentCards";
import { FeatureImageCards } from "@wandercom/website-registry/components/Cards/FeatureImageCards";
import { FeaturesCards } from "@wandercom/website-registry/components/Cards/FeaturesCards";
import { Categories } from "@wandercom/website-registry/components/Categories/Categories";
import { CollectionGallery } from "@wandercom/website-registry/components/CollectionGallery";
import { Content } from "@wandercom/website-registry/components/Content/Content";
import { LargeContent } from "@wandercom/website-registry/components/Content/LargeContent";
import { FAQ } from "@wandercom/website-registry/components/FAQ";
import { FeatureList } from "@wandercom/website-registry/components/FeatureList";
import { ContactForm } from "@wandercom/website-registry/components/Form/ContactForm";
import { Form } from "@wandercom/website-registry/components/Form/Form";
import { Hero } from "@wandercom/website-registry/components/Hero/Hero";
import { Hero_BgImage } from "@wandercom/website-registry/components/Hero/Hero_BgImage";
import { Hero_Video } from "@wandercom/website-registry/components/Hero/Hero_Video";
import { HomepageHero } from "@wandercom/website-registry/components/HomepageHero/HomepageHero";
import { HtmlContent } from "@wandercom/website-registry/components/HtmlContent";
import { IntroText } from "@wandercom/website-registry/components/IntroText/IntroText";
import { KeySellingPoints } from "@wandercom/website-registry/components/KeySellingPoints";
import { LightboxGallery } from "@wandercom/website-registry/components/LightboxGallery/LightboxGallery";
import { LogoBar } from "@wandercom/website-registry/components/LogoBar";
import { Metrics } from "@wandercom/website-registry/components/Metrics";
import { PhotoCollage } from "@wandercom/website-registry/components/Photos/PhotoCollage";
import { Photos } from "@wandercom/website-registry/components/Photos/Photos";
import { PropertyGallery } from "@wandercom/website-registry/components/PropertyGallery/PropertyGallery";
import { Reviews_Fallback } from "@wandercom/website-registry/components/Reviews/ReviewsFallback/Reviews_Fallback";
import { Reviews_Grid } from "@wandercom/website-registry/components/Reviews/ReviewsGrid/Reviews_Grid";
import { Reviews_Highlighted } from "@wandercom/website-registry/components/Reviews/ReviewsHighlighted/Reviews_Highlighted";
import { Reviews_Default } from "@wandercom/website-registry/components/Reviews/ReviewsDefault/Reviews_Default";
import { Reviews_Summary } from "@wandercom/website-registry/components/Reviews/ReviewsSummary/Reviews_Summary";
import { Reviews_Testimonial } from "@wandercom/website-registry/components/Reviews/ReviewsTestimonial/Reviews_Testimonial";
import { resolveTestimonialQuotes } from "@wandercom/website-registry/components/Reviews/ReviewsTestimonial/resolveTestimonialQuotes";
import { SearchBar } from "@wandercom/website-registry/components/SearchBar/SearchBar";
import { Services } from "@wandercom/website-registry/components/Services/Services";
import { Team } from "@wandercom/website-registry/components/Team/Team";
import { SimpleTestimonials } from "@wandercom/website-registry/components/Testimonials/SimpleTestimonials";
import { VisualTestimonialsCarousel } from "@wandercom/website-registry/components/Testimonials/VisualTestimonialsCarousel";
import { Video } from "@wandercom/website-registry/components/Video";
import type { Layout } from "@wandercom/website-registry/shared/components/SectionContainer";
import type { ReactNode } from "react";

import type { MockExample } from "../data/mocks/index";
import { mockReviewMeta, mockReviews, mocks } from "../data/mocks/index";
import { MockCaptchaProvider } from "./MockCaptchaProvider";

const noopFormSubmit = async (_actionState: unknown, _formData: FormData) =>
  Promise.resolve({
    status: "success" as const,
    message: "Thank you! (Preview — form not submitted.)",
  });

// ─── Example shell ─────────────────────────────────────────────────────────────

function ExampleShell({
  index,
  label,
  count,
  children,
}: {
  index: number;
  label?: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 1) return <>{children}</>;
  return (
    <div className="pb-10">
      {index > 0 && <Separator />}
      <div className="flex items-center gap-1.5 px-6 py-5">
        <Heading variant="headline-sm">
          Example {index + 1} — {label}
        </Heading>
      </div>
      {children}
    </div>
  );
}

// ─── renderAll helper ──────────────────────────────────────────────────────────

function renderAll(examples: MockExample[], renderFn: (props: Record<string, any>) => ReactNode) {
  return (
    <>
      {examples.map((ex, i) => (
        <ExampleShell key={`${ex.label}-${i}`} index={i} label={ex.label} count={examples.length}>
          {renderFn(ex.props)}
        </ExampleShell>
      ))}
    </>
  );
}

// ─── renderBlock ───────────────────────────────────────────────────────────────
// Renders a single block instance for the given id and props. Shared between
// the all-mocks (sections) and single-mock (templates) render paths. `layout`
// mirrors the page-kind-derived `layout` threaded through `RenderPage.astro`.

function renderBlock(
  id: string,
  p: Record<string, any>,
  layout?: Layout,
  kind?: string,
): ReactNode {
  switch (id) {
    case "hero":
      return <Hero {...(p as any)} />;

    case "hero-bg-image":
      return <Hero_BgImage {...(p as any)} />;

    case "hero-video":
      return <Hero_Video {...(p as any)} />;

    case "homepage-hero":
      return <HomepageHero {...(p as any)} />;

    case "content":
      return <Content {...(p as any)} layout={layout} kind={kind ?? p.kind} />;

    case "large-content":
      return <LargeContent {...(p as any)} layout={layout} />;

    case "large-content-aside":
      return <LargeContent {...(p as any)} layout={layout} />;

    case "services":
      return <Services {...(p as any)} layout={layout} />;

    case "services-full":
      return <Services {...(p as any)} variant="full" layout={layout} />;

    case "categories":
      return <Categories {...(p as any)} layout={layout} />;

    case "reviews-default":
      return (
        <Reviews_Default
          eyebrow={p.eyebrow}
          title={p.title}
          showReviewsCount={p.showReviewsCount}
          theme={p.theme}
          reviews={mockReviews}
          meta={mockReviewMeta}
          layout={layout}
          fetchReviews={async ({ take }) => ({
            reviews: mockReviews.slice(0, take),
            meta: mockReviewMeta,
          })}
        />
      );

    case "reviews-testimonial":
      return (
        <Reviews_Testimonial
          title={p.title}
          quotes={resolveTestimonialQuotes({
            overrides: p.quotes,
            reviews: mockReviews,
            formatStayedAt: () => "Stayed May 2026",
          })}
          imageUrl={p.imageUrl}
          imageAlt={p.imageAlt}
          theme={p.theme}
          layout={layout}
        />
      );

    case "reviews-summary":
      return (
        <Reviews_Summary
          title={p.title}
          showReviewsCount={p.showReviewsCount}
          reviews={mockReviews}
          meta={mockReviewMeta}
          layout={layout}
          fetchReviews={async ({ take }) => ({
            reviews: mockReviews.slice(0, take),
            meta: mockReviewMeta,
          })}
        />
      );

    case "reviews-highlighted":
      return <Reviews_Highlighted reviews={mockReviews} meta={mockReviewMeta} />;

    case "reviews-grid":
      return <Reviews_Grid reviews={mockReviews} layout={layout} />;

    case "reviews-fallback":
      return <Reviews_Fallback {...(p as any)} layout={layout} />;

    case "metrics":
      return <Metrics {...(p as any)} layout={layout} />;

    case "metrics-feature":
      return <Metrics {...(p as any)} layout={layout} />;

    case "metrics-minimal":
      return <Metrics {...(p as any)} layout={layout} />;

    case "video":
      return <Video {...(p as any)} layout={layout} />;

    case "photos":
      return <Photos {...(p as any)} />;

    case "photo-collage":
      return <PhotoCollage {...(p as any)} />;

    case "logo-bar":
      return <LogoBar {...(p as any)} layout={layout} />;

    case "faqs":
      return (
        <FAQ
          eyebrow={p.eyebrow}
          title={p.title}
          faqs={(p.items as { question: string; answer: string }[]).map((faq, i) => ({
            id: `faq-${i}`,
            question: faq.question,
            answer: faq.answer,
          }))}
          layout={layout}
        />
      );

    case "feature-list":
      return <FeatureList {...(p as any)} layout={layout} />;

    case "key-selling-points": {
      return <KeySellingPoints {...(p as any)} layout={layout} />;
    }

    case "cta":
      return <CallToAction {...(p as any)} layout={layout} />;

    case "call-to-action-feature":
      return <CallToAction {...(p as any)} layout={layout} />;

    case "html":
      return (
        <div className="mx-auto max-w-7xl px-6">
          <HtmlContent id={p.id as string} html={p.html as string} />
        </div>
      );

    case "blog-gallery":
      return <BlogGallery {...(p as any)} layout={layout} />;

    case "collection-gallery":
      return <CollectionGallery {...(p as any)} layout={layout} />;

    case "content-cards":
      return <ContentCards {...(p as any)} layout={layout} />;

    case "feature-cards":
      return <FeaturesCards {...(p as any)} />;

    case "feature-image-cards":
    case "feature-image-cards-overlay":
    case "feature-image-cards-centered":
      return <FeatureImageCards {...(p as any)} />;

    case "team":
      return <Team {...(p as any)} />;

    case "simple-testimonials":
      return <SimpleTestimonials {...(p as any)} layout={layout} />;

    case "visual-testimonials-carousel":
      return <VisualTestimonialsCarousel {...(p as any)} layout={layout} />;

    case "intro-text":
      return <IntroText {...(p as any)} layout={layout} />;

    case "book-direct":
      return <BookDirect {...(p as any)} />;

    case "call-to-action-cards":
      return <CallToActionCards {...(p as any)} layout={layout} />;

    case "lightbox-gallery":
      return <LightboxGallery {...(p as any)} layout={layout} />;

    case "search-bar":
      return (
        <div className="px-12">
          <SearchBar
            className="@laptop:w-fit z-20 mx-auto w-full"
            wrapperClassName="@laptop:top-3 @laptop:pb-10 @max-laptop:top-0 sticky top-0 z-[60]"
          />
        </div>
      );

    case "property-gallery":
      return (
        <PropertyGallery
          properties={p.properties}
          title={p.title}
          showTitle={p.showTitle ?? true}
          titleLink={p.titleLink}
        />
      );

    case "form": {
      const schema = (
        p.fields as {
          name: string;
          label: string;
          type: string;
          required: boolean;
        }[]
      ).map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        required: f.required,
      }));
      return (
        <MockCaptchaProvider>
          <Form
            id={p.id}
            title={p.title}
            subtitle={p.description}
            schema={schema}
            confirmationMessage="Thank you! (Preview — form not submitted.)"
            submitButtonText={(p as { submitText?: string }).submitText ?? "Submit"}
            onSubmit={noopFormSubmit}
          />
        </MockCaptchaProvider>
      );
    }

    case "contact-form": {
      const contactSchema = [
        { name: "name", label: "Name", type: "text" as const, required: true },
        {
          name: "email",
          label: "Email",
          type: "email" as const,
          required: true,
        },
        {
          name: "message",
          label: "Message",
          type: "textarea" as const,
          required: true,
        },
      ];
      return (
        <MockCaptchaProvider>
          <ContactForm
            id={p.id}
            title={p.title}
            schema={contactSchema}
            confirmationMessage="Thank you! We'll be in touch."
            submitButtonText="Send message"
            onSubmit={noopFormSubmit}
          />
        </MockCaptchaProvider>
      );
    }

    default:
      return null;
  }
}

// ─── BlockRenderer ─────────────────────────────────────────────────────────────

export function BlockRenderer({ id }: { id: string }) {
  const examples = mocks[id];
  if (!examples) return null;
  return renderAll(examples, (p) => renderBlock(id, p));
}

// ─── TemplateBlockRenderer ─────────────────────────────────────────────────────

export function TemplateBlockRenderer({
  id,
  theme,
  layout,
  mockVariant,
  kind,
}: {
  id: string;
  theme?: string;
  layout?: Layout;
  mockVariant?: string;
  kind?: string;
}) {
  const examples = mocks[id];
  if (!examples || examples.length === 0) return null;
  const example = mockVariant
    ? (examples.find((e) => e.props.id === mockVariant) ?? examples[0])
    : examples[0];
  const rendered = renderBlock(id, example.props, layout, kind);
  if (theme) return <div data-theme={theme}>{rendered}</div>;
  return <>{rendered}</>;
}
