import { NextRequest, NextResponse } from "next/server";
import {
  getAllowedCaseTransitions,
  getCaseStatusLabel,
  validateCaseStatusTransition,
} from "@/lib/case-workflow";
import { db } from "@/lib/db";
import { createApiErrorResponse } from "@/lib/errors";
import { auditLogRepository, caseRepository } from "@/lib/repositories";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = (await req.json()) as {
      status?: string;
      note?: string | null;
      actorId?: string | null;
    };

    if (!payload.status?.trim()) {
      return createApiErrorResponse(
        new Error("A target case status is required."),
        {
          code: "validation_error",
          message: "Failed to update case status",
          status: 400,
          category: "validation",
        },
      );
    }

    const caseRecord = await caseRepository.findById(id);

    if (!caseRecord) {
      return createApiErrorResponse(
        new Error(`Case ${id} was not found.`),
        {
          code: "not_found",
          message: "Case not found",
          status: 404,
          category: "validation",
        },
      );
    }

    const transition = validateCaseStatusTransition({
      currentStatus: caseRecord.status,
      nextStatus: payload.status.trim(),
      note: payload.note,
    });

    await db.transaction(async (tx) => {
      await caseRepository.updateStatus(id, transition.nextStatus, tx);
      await auditLogRepository.create(
        {
          caseId: id,
          eventType: "case.status_changed",
          actorType: payload.actorId?.trim() ? "user" : "system",
          actorId: payload.actorId?.trim() || null,
          message: `Case moved from ${getCaseStatusLabel(transition.currentStatus)} to ${getCaseStatusLabel(transition.nextStatus)}.`,
          metadata: {
            previousStatus: transition.currentStatus,
            nextStatus: transition.nextStatus,
            note: transition.note,
          },
        },
        tx,
      );
    });

    return NextResponse.json({
      success: true,
      caseId: id,
      status: transition.nextStatus,
      statusLabel: getCaseStatusLabel(transition.nextStatus),
      allowedNextStatuses: getAllowedCaseTransitions(transition.nextStatus),
    });
  } catch (error: unknown) {
    console.error("Error updating case status:", error);
    return createApiErrorResponse(error, {
      code: "internal_error",
      message: "Failed to update case status",
      status: 500,
      category: "internal",
      retryable: true,
    });
  }
}
