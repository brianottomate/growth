import { NextResponse, type NextRequest } from "next/server";
import {
  isMinervaConfigured,
  enrichByEmail,
  enrichPhone,
  batchEnrichIncome,
  enrichDebugByEmail,
} from "@/server/clients/minerva.client";

function parseCsvEmails(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((v) => v.trim().toLowerCase()))].filter(
    Boolean,
  );
}

/**
 * Minerva diagnostic endpoint.
 *
 * GET /api/test/minerva?email=user@example.com
 * GET /api/test/minerva?emails=a@example.com,b@example.com
 */
export async function GET(request: NextRequest) {
  const singleEmail = request.nextUrl.searchParams
    .get("email")
    ?.trim()
    .toLowerCase();
  const csvEmails = parseCsvEmails(request.nextUrl.searchParams.get("emails"));

  if (!isMinervaConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "Minerva not configured",
        expectedEnv: ["MINERVA_API_KEY", "MINERVA_API_URL (optional)"],
      },
      { status: 500 },
    );
  }

  if (!singleEmail && csvEmails.length === 0) {
    return NextResponse.json({
      success: true,
      service: "minerva-test",
      configured: true,
      usage: {
        single: "/api/test/minerva?email=user@example.com",
        batchIncome: "/api/test/minerva?emails=a@example.com,b@example.com",
      },
    });
  }

  try {
    if (singleEmail) {
      const [fullEnrichment, phoneOnly, debug] = await Promise.all([
        enrichByEmail(singleEmail),
        enrichPhone(singleEmail),
        enrichDebugByEmail(singleEmail),
      ]);

      return NextResponse.json({
        success: true,
        mode: "single",
        email: singleEmail,
        data: {
          fullEnrichment,
          phoneOnly,
          debug,
        },
      });
    }

    const incomeResults = await batchEnrichIncome(csvEmails);
    return NextResponse.json({
      success: true,
      mode: "batch_income",
      count: incomeResults.length,
      data: incomeResults,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
