import "server-only";

import {
  leadFormFromTemplate,
  type MetaLeadFormSpec,
  type MetaLeadFormTemplate,
} from "@/lib/meta-lead-forms";
import {
  createLeadForm,
  fetchPageAccessToken,
  isMetaLeadgenConfigured,
  listActiveLeadForms,
  type MetaLeadForm,
} from "@/server/clients/meta-leadgen.client";
import { resolveBrandMetaPage } from "@/server/services/ads-write.service";

// Meta instant forms for a brand's ads. A form is a Page asset Meta owns;
// Growth reads the Page's list, creates new ones from a house template or an
// explicit spec, and a Meta platform draft points at one by id. Nothing here
// touches an ad account.

function requireLeadgen() {
  if (!isMetaLeadgenConfigured)
    throw new Error(
      "META_LEADS_ACCESS_TOKEN is not configured, so Growth cannot reach Meta lead forms.",
    );
}

export type BrandLeadForm = {
  id: string;
  name: string;
  status: string;
  createdAt: string | null;
  questions: { key: string; label: string; type: string; options: string[] }[];
};

function presentForm(form: MetaLeadForm): BrandLeadForm {
  return {
    id: form.id,
    name: form.name,
    status: form.status,
    createdAt: form.created_time ?? null,
    questions: (form.questions ?? []).map((question) =>
      question.type === "CUSTOM"
        ? {
            key: question.key,
            label: question.label,
            type: question.type,
            options: question.options?.map((option) => option.value) ?? [],
          }
        : {
            key: question.type.toLowerCase(),
            label: question.type.replaceAll("_", " ").toLowerCase(),
            type: question.type,
            options: [],
          },
    ),
  };
}

/** The active forms on the Page the brand's Meta ads run as. */
export async function listBrandLeadForms(input: {
  organizationId: string;
  brandSlug: string;
}) {
  requireLeadgen();
  const { brand, pageId } = await resolveBrandMetaPage(input);
  const pageToken = await fetchPageAccessToken(pageId);
  const forms = await listActiveLeadForms(pageToken, pageId);
  return {
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
    pageId,
    forms: forms.map(presentForm),
  };
}

/**
 * Create a form on the brand's Page, from a template or a spec the caller
 * wrote. Meta's create is not idempotent and a form cannot be edited, so a
 * retry or a changed spec is one more form; the caller points the draft at
 * the id that comes back.
 */
export async function createBrandLeadForm(input: {
  organizationId: string;
  brandSlug: string;
  template?: MetaLeadFormTemplate;
  /** Owner form: the places offered as answers; the brand's market towns otherwise. */
  locations?: string[];
  /** Overrides the template's name; required without a template. */
  name?: string;
  spec?: Omit<MetaLeadFormSpec, "name"> & { name?: string };
}) {
  requireLeadgen();
  const { brand, pageId } = await resolveBrandMetaPage(input);
  const privacyPolicyUrl = brand.website
    ? `${brand.website.replace(/\/$/, "")}/privacy`
    : "https://www.wander.com/privacy";
  const locations =
    input.locations ??
    brand.markets?.markets.flatMap((market) =>
      market.towns.map((town) =>
        `${town}, ${market.label.split(", ").at(-1) ?? market.region ?? ""}`.replace(
          /, $/,
          "",
        ),
      ),
    ) ??
    [];
  const fromTemplate = input.template
    ? leadFormFromTemplate(input.template, {
        name: brand.name,
        website: brand.website,
        privacyPolicyUrl,
        locations,
      })
    : null;
  const spec: MetaLeadFormSpec | null = input.spec
    ? {
        ...fromTemplate,
        ...input.spec,
        name: input.name ?? input.spec.name ?? fromTemplate?.name ?? "",
      }
    : fromTemplate
      ? { ...fromTemplate, name: input.name ?? fromTemplate.name }
      : null;
  if (!spec) throw new Error("Choose a template or give the form's spec.");
  if (!spec.name.trim()) throw new Error("Give the form a name.");
  if (spec.questions.length === 0)
    throw new Error("A form needs at least one question.");
  const pageToken = await fetchPageAccessToken(pageId);
  const form = await createLeadForm(pageId, pageToken, spec);
  return {
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
    pageId,
    form: presentForm(form),
  };
}
