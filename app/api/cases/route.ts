import { NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/errors";
import { caseRepository } from "@/lib/repositories";

export async function GET() {
  try {
    const cases = await caseRepository.list();
    return NextResponse.json({ cases });
  } catch (error: unknown) {
    console.error("Error fetching cases:", error);
    return createApiErrorResponse(error, {
      code: "internal_error",
      message: "Failed to fetch cases",
      status: 500,
      category: "internal",
      retryable: true,
    });
  }
}
