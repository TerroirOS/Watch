import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createApiErrorResponse } from "@/lib/errors";
import type { CaseListItem } from "@/lib/types";

export async function GET() {
  try {
    const result = await db.query<CaseListItem>(`
      SELECT
        c.id,
        c.title,
        c.description,
        c.status,
        c.created_at,
        COUNT(DISTINCT d.id) AS document_count,
        COUNT(DISTINCT disc.id) AS discrepancy_count
      FROM cases c
      LEFT JOIN documents d ON d.case_id = c.id
      LEFT JOIN discrepancies disc ON disc.case_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    return NextResponse.json({ cases: result.rows });
  } catch (error: unknown) {
    console.error("Error fetching cases:", error);
    return createApiErrorResponse(error, {
      code: "internal_error",
      message: "Failed to fetch cases",
      status: 500,
    });
  }
}
