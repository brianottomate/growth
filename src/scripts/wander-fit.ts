import { getJson } from "serpapi";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { scrapeBasicContent } from "@/server/clients/firecrawl.client";

interface OrganicResult {
  position: number;
  title: string;
  link: string;
  redirect_link: string;
  displayed_link: string;
  snippet: string;
  snippet_highlighted_words: string[];
  source: string;
  favicon?: string;
}

interface GoogleSearchResponse {
  organic_results: OrganicResult[];
  search_metadata: {
    id: string;
    status: string;
    json_endpoint: string;
    created_at: string;
    processed_at: string;
    google_url: string;
    raw_html_file: string;
    total_time_taken: number;
  };
  search_parameters: {
    engine: string;
    q: string;
    google_domain: string;
    device: string;
  };
  search_information: {
    query_displayed: string;
    total_results: number;
    time_taken_displayed: number;
    organic_results_state: string;
  };
}

// Configuration
const MAX_SITES_TO_PROCESS = 3;

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = "appi3yQTj7eXkuNNv";
const AIRTABLE_TABLE_ID = "tblEm2zM5tFGWoaIH";

// Field IDs from Airtable
const AIRTABLE_FIELDS = {
  name: "fldamsT9b8IgwSy0z",
  url: "fld2m5Kf3o7nDeZWN",
  propertyCount: "fldordB2ImPwcbdNk",
  hotelGradeAmenities: "fldcPuMdk86JwNTXV",
  fitScore: "fldRZmAibSnnS1vMl",
  reasoning: "fldOKRLf594yhDvwe",
  recommendation: "fldvtEr7WUkeLrISH",
} as const;

type WanderFitAnalysis = {
  companyName: string;
  location: string;
  propertyCount: number | null;
  propertyQuality: "luxury" | "premium" | "mid-range" | "budget" | "mixed" | "unknown";
  hasHotelGradeAmenities: boolean;
  fitScore: number;
  reasoning: string;
  recommendation: "strong_invite" | "maybe_invite" | "not_a_fit";
};

async function writeToAirtable(
  analysis: WanderFitAnalysis,
  url: string,
): Promise<boolean> {
  if (!AIRTABLE_API_TOKEN) {
    console.error("⚠️  No Airtable token, skipping write to Airtable");
    return false;
  }

  try {
    // Map recommendation values
    const recommendationMap = {
      strong_invite: "Strong invite",
      maybe_invite: "Maybe invite",
      not_a_fit: "Not a fit",
    };

    const fields = {
      [AIRTABLE_FIELDS.name]: analysis.companyName,
      [AIRTABLE_FIELDS.url]: url,
      [AIRTABLE_FIELDS.propertyCount]: analysis.propertyCount,
      [AIRTABLE_FIELDS.hotelGradeAmenities]: analysis.hasHotelGradeAmenities,
      [AIRTABLE_FIELDS.fitScore]: analysis.fitScore,
      [AIRTABLE_FIELDS.reasoning]: analysis.reasoning,
      [AIRTABLE_FIELDS.recommendation]: recommendationMap[analysis.recommendation],
    };

    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ Failed to write to Airtable:", error);
      return false;
    }

    const result = (await response.json()) as { id: string };
    console.log(`✅ Written to Airtable (Record ID: ${result.id})`);
    return true;
  } catch (error) {
    console.error("❌ Error writing to Airtable:", error);
    return false;
  }
}

const wanderFitAnalysisSchema = z.object({
  companyName: z.string().describe("The name of the property management company"),
  location: z.string().describe("Primary location(s) they operate in"),
  propertyCount: z
    .number()
    .nullable()
    .describe("Estimated number of properties they manage"),
  propertyQuality: z
    .enum(["luxury", "premium", "mid-range", "budget", "mixed", "unknown"])
    .describe("Overall quality tier of their properties"),
  hasHotelGradeAmenities: z
    .boolean()
    .describe(
      "Do properties have hotel-grade amenities (hot tubs, pools, high-end kitchens, etc.)?",
    ),
  fitScore: z
    .number()
    .describe(
      "Score from 0-10 on how well this fits Wander's brand (luxury vacation homes with hotel-grade amenities)",
    ),
  reasoning: z
    .string()
    .describe(
      "Brief explanation of the fit score and whether they should be invited to list on Wander",
    ),
  recommendation: z
    .enum(["strong_invite", "maybe_invite", "not_a_fit"])
    .describe("Final recommendation on whether to reach out"),
});

async function main() {
  // Google Serp API response
  const response = (await getJson({
    engine: "google",
    api_key: process.env.SERP_API_KEY,
    q: "site:guestybookings.com",
  })) as GoogleSearchResponse;

  console.log("Search Results:");
  console.log(
    JSON.stringify(
      response.organic_results?.slice(0, MAX_SITES_TO_PROCESS),
      null,
      2,
    ),
  );

  console.log("\n---\n");
  console.log(`Total results found: ${response.organic_results?.length || 0}`);
  console.log(`Processing first ${MAX_SITES_TO_PROCESS} sites...\n`);

  console.log("\n--- Wander Fit Analysis ---\n");

  // Process each result with AI
  for (const result of response.organic_results.slice(0, MAX_SITES_TO_PROCESS)) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`${result.position}. ${result.title}`);
    console.log(`Link: ${result.link}`);
    console.log(`${"=".repeat(80)}\n`);

    // Scrape the site content
    console.log("🔵 Scraping site content with Firecrawl...");
    const scrapedContent = await scrapeBasicContent({ url: result.link });

    if (!scrapedContent?.content) {
      console.log("❌ Failed to scrape content, skipping AI analysis\n");
      continue;
    }

    console.log(
      `✅ Scraped ${scrapedContent.content.length} characters of content\n`,
    );

    // Analyze with AI
    console.log("🤖 Analyzing fit for Wander...");
    const { output } = await generateText({
      model: anthropic("claude-sonnet-4-5"),
      output: Output.object({
        name: "WanderFitAnalysis",
        description:
          "Analysis of whether a property management company is a good fit for Wander's platform",
        schema: wanderFitAnalysisSchema,
      }),
      prompt: `You are analyzing property management companies to see if they're a good fit for Wander.com.

Wander is a premium vacation rental platform featuring:
- Hotel-grade amenities (hot tubs, pools, high-end kitchens, etc.)
- Inspiring views and pristine locations
- 24/7 concierge service
- High guest satisfaction (96%+ with 52,000+ nights booked)
- Premium, luxury vacation homes

Analyze this property management company and determine if they should be invited to list on Wander:

Title: ${result.title}
Snippet: ${result.snippet}

Site Content:
${scrapedContent.content.slice(0, 8000)}

Provide a detailed analysis of their fit for Wander's platform.`,
    });

    console.log("\n📊 Analysis Result:");
    console.log(JSON.stringify(output, null, 2));

    // Write to Airtable
    console.log("\n💾 Writing to Airtable...");
    await writeToAirtable(output, result.link);

    console.log("\n");
  }
}

main().catch(console.error);
