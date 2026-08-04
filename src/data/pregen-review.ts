export type ReviewMode = "side-by-side" | "revision" | "swap";

export type CompositionOperation = "preserve" | "reframe" | "split" | "insert";

export type EvaluationPipeId =
  | "source-fidelity"
  | "grounding"
  | "responsive-composition"
  | "human-review";

export type EvaluationPipeStatus = "fixture-pass" | "fixture-review";

export interface SourceEvidence {
  label: string;
  value: string;
  origin: string;
}

export interface ReviewComment {
  id: string;
  title: string;
  observation: string;
  decision: string;
  evidence: string[];
  confidence: "high" | "medium";
}

export interface CompositionSection {
  id: string;
  eyebrow: string;
  sourceTitle: string;
  sourceBody: string;
  proposedTitle: string;
  proposedBody: string;
  operation: CompositionOperation;
  sourceGeometry: string;
  proposedGeometry: string;
  evidence: SourceEvidence[];
  comments: ReviewComment[];
}

export interface PregenReviewFixture {
  id: string;
  prospect: {
    name: string;
    market: string;
    sourceUrl: string;
  };
  run: {
    id: string;
    createdAt: string;
    status: "fixture";
  };
  sections: CompositionSection[];
}

export interface CandidatePipelineStep {
  id: string;
  label: string;
  detail: string;
  output: string;
}

export interface EvaluationPipe {
  id: EvaluationPipeId;
  label: string;
  question: string;
  evaluator: string;
  input: string;
  receipt: string;
  status: EvaluationPipeStatus;
  checks: Array<{
    label: string;
    result: string;
  }>;
}

export const PREGEN_REVIEW_FIXTURE: PregenReviewFixture = {
  id: "fixture-driftwood-stays-v1",
  prospect: {
    name: "Driftwood Stays",
    market: "Oregon Coast",
    sourceUrl: "driftwood-stays.example",
  },
  run: {
    id: "lab_C8W4D2",
    createdAt: "2026-08-03T21:45:00.000Z",
    status: "fixture",
  },
  sections: [
    {
      id: "hero",
      eyebrow: "01 · First impression",
      sourceTitle: "A better way to stay on the Oregon Coast",
      sourceBody:
        "Vacation homes in Cannon Beach and Manzanita. Browse our properties and book your next trip.",
      proposedTitle: "The coast, without the compromise",
      proposedBody:
        "Design-led homes in Cannon Beach and Manzanita, cared for by a local team and ready for the way you actually travel.",
      operation: "reframe",
      sourceGeometry: "Centered hero · text over image · two actions",
      proposedGeometry: "Split hero · editorial copy · availability card",
      evidence: [
        {
          label: "Inventory",
          value: "18 coastal homes",
          origin: "Source property index",
        },
        {
          label: "Guest signal",
          value: "4.9 average rating",
          origin: "142 source reviews",
        },
        {
          label: "Coverage",
          value: "Cannon Beach + Manzanita",
          origin: "Source navigation",
        },
      ],
      comments: [
        {
          id: "hero-positioning",
          title: "Lead with the differentiated promise",
          observation:
            "The source headline is interchangeable with any regional rental operator and delays the strongest proof.",
          decision:
            "Use an editorial promise, then place inventory and rating proof inside the first viewport.",
          evidence: ["18 homes", "4.9 rating", "Two-town coverage"],
          confidence: "high",
        },
        {
          id: "hero-conversion",
          title: "Turn browsing into a concrete next step",
          observation:
            "Two equal-weight buttons force a decision before the visitor has chosen dates.",
          decision:
            "Preserve a single browse action and introduce a compact availability affordance.",
          evidence: ["Source CTA geometry", "Wander booking pattern"],
          confidence: "medium",
        },
      ],
    },
    {
      id: "properties",
      eyebrow: "02 · Property discovery",
      sourceTitle: "Featured vacation rentals",
      sourceBody:
        "A mixed grid of homes ordered manually, with nightly prices and bedroom counts presented as equal-weight metadata.",
      proposedTitle: "Find your place on the coast",
      proposedBody:
        "A calmer, location-led collection that helps guests choose by trip shape before comparing individual homes.",
      operation: "split",
      sourceGeometry: "Four-card grid · uniform cards · six metadata points",
      proposedGeometry: "Two collection stories · horizontal property rail",
      evidence: [
        {
          label: "Collection",
          value: "8 Cannon Beach homes",
          origin: "Source property cards",
        },
        {
          label: "Collection",
          value: "10 Manzanita homes",
          origin: "Source property cards",
        },
        {
          label: "Amenity",
          value: "11 pet-friendly homes",
          origin: "Source filters",
        },
      ],
      comments: [
        {
          id: "property-ia",
          title: "Choose a trip before choosing a SKU",
          observation:
            "The source immediately asks guests to compare eighteen properties with no decision frame.",
          decision:
            "Split the section into destination stories, then reveal property-level choice within each collection.",
          evidence: ["18-card inventory", "Two distinct towns"],
          confidence: "high",
        },
      ],
    },
    {
      id: "trust",
      eyebrow: "03 · Trust and service",
      sourceTitle: "Locally owned and operated",
      sourceBody:
        "A short paragraph about the team appears near the footer without operational proof or guest context.",
      proposedTitle: "Local when it matters",
      proposedBody:
        "Real people nearby, thoughtful arrival details, and help that does not disappear after the booking confirmation.",
      operation: "insert",
      sourceGeometry: "Text block · footer-adjacent · no supporting media",
      proposedGeometry: "Service promise · three proof points · guest quote",
      evidence: [
        {
          label: "Response",
          value: "Local guest support",
          origin: "Source about page",
        },
        {
          label: "Proof",
          value: "142 public reviews",
          origin: "Source review feed",
        },
        {
          label: "Service",
          value: "Direct-booking assistance",
          origin: "Source FAQ",
        },
      ],
      comments: [
        {
          id: "trust-proof",
          title: "Make local service legible",
          observation:
            "The source claims local ownership but does not explain what that changes for a guest.",
          decision:
            "Translate ownership into observable service promises and attach existing review proof.",
          evidence: ["About page", "FAQ", "Review feed"],
          confidence: "high",
        },
      ],
    },
  ],
};

/**
 * Produces one candidate artifact. Evaluation is deliberately not embedded in
 * this chain: every evaluator below reads the same immutable candidate and
 * emits its own receipt.
 */
export const CANDIDATE_PIPELINE = [
  {
    id: "snapshot",
    label: "Source snapshot",
    detail: "HTML, images, or crawled pages become an immutable input receipt.",
    output: "source-snapshot/v1",
  },
  {
    id: "geometry",
    label: "Geometry inventory",
    detail:
      "Sections, hierarchy, media roles, and responsive behavior are extracted.",
    output: "geometry-inventory/v1",
  },
  {
    id: "plan",
    label: "Composition plan",
    detail:
      "Typed operations preserve, reframe, split, merge, insert, or omit sections.",
    output: "composition-plan/v1",
  },
  {
    id: "ground",
    label: "Grounded generation",
    detail:
      "Copy and structure are constrained by evidence from the source corpus.",
    output: "candidate-content/v1",
  },
  {
    id: "render",
    label: "Registry render",
    detail:
      "The proposal resolves through the current responsive website registry.",
    output: "candidate-artifact/v1",
  },
] as const satisfies readonly CandidatePipelineStep[];

/** Independent, parallel evaluation pipes over the same candidate artifact. */
export const EVALUATION_PIPES = [
  {
    id: "source-fidelity",
    label: "Source fidelity",
    question:
      "Did the candidate preserve the source facts and visual identity?",
    evaluator: "Deterministic source diff",
    input: "source-snapshot/v1 + candidate-artifact/v1",
    receipt: "eval_source_C8W4D2",
    status: "fixture-pass",
    checks: [
      { label: "Source sections represented", result: "3 / 3" },
      { label: "Source facts contradicted", result: "0" },
      { label: "Identity-breaking changes", result: "0 flagged" },
    ],
  },
  {
    id: "grounding",
    label: "Claim grounding",
    question: "Can every material proposed claim be traced to source evidence?",
    evaluator: "Claim-to-evidence matcher",
    input: "source-snapshot/v1 + candidate-content/v1",
    receipt: "eval_ground_C8W4D2",
    status: "fixture-pass",
    checks: [
      { label: "Evidence groups attached", result: "9" },
      { label: "Unsupported numeric claims", result: "0" },
      { label: "Low-confidence decisions", result: "1 visible" },
    ],
  },
  {
    id: "responsive-composition",
    label: "Responsive composition",
    question: "Does the proposed geometry survive the supported viewports?",
    evaluator: "Registry render checks",
    input: "composition-plan/v1 + candidate-artifact/v1",
    receipt: "eval_layout_C8W4D2",
    status: "fixture-pass",
    checks: [
      { label: "Desktop frames inspected", result: "3 / 3" },
      { label: "Mobile frames inspected", result: "3 / 3" },
      { label: "Overflow findings", result: "0" },
    ],
  },
  {
    id: "human-review",
    label: "Editorial review",
    question: "Are the changes strategically useful enough to keep?",
    evaluator: "Human reviewer",
    input: "all evaluator receipts + side-by-side candidate",
    receipt: "eval_human_C8W4D2",
    status: "fixture-review",
    checks: [
      { label: "Decision notes prepared", result: "4" },
      { label: "Sections approved", result: "not requested" },
      { label: "Final disposition", result: "awaiting review" },
    ],
  },
] as const satisfies readonly EvaluationPipe[];
