import { AppError } from "@/lib/errors";
import type { CaseStatus } from "@/lib/types";

export const DEFAULT_CASE_STATUS: CaseStatus = "open";

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  under_review: "Under Review",
  on_hold: "On Hold",
  escalated: "Escalated",
  approved: "Approved",
  rejected: "Rejected",
  exported: "Exported",
};

const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["under_review", "on_hold", "escalated", "rejected"],
  under_review: ["approved", "rejected", "on_hold", "escalated"],
  on_hold: ["under_review", "rejected", "escalated"],
  escalated: ["under_review", "approved", "rejected", "on_hold"],
  approved: ["exported", "on_hold", "escalated"],
  rejected: ["under_review", "on_hold", "escalated"],
  exported: [],
};

const NOTE_REQUIRED_STATUSES = new Set<CaseStatus>(["on_hold", "escalated", "rejected"]);

export function isCaseStatus(value: string): value is CaseStatus {
  return value in CASE_TRANSITIONS;
}

export function getAllowedCaseTransitions(status: CaseStatus | null | undefined): CaseStatus[] {
  return CASE_TRANSITIONS[status ?? DEFAULT_CASE_STATUS] ?? [];
}

export function getCaseStatusLabel(status: CaseStatus | null | undefined): string {
  return CASE_STATUS_LABELS[status ?? DEFAULT_CASE_STATUS];
}

export function validateCaseStatusTransition(params: {
  currentStatus: CaseStatus | null | undefined;
  nextStatus: string;
  note?: string | null;
}) {
  const currentStatus = params.currentStatus ?? DEFAULT_CASE_STATUS;

  if (!isCaseStatus(params.nextStatus)) {
    throw new AppError(`Unsupported case status: ${params.nextStatus}.`, {
      status: 400,
      code: "validation_error",
      category: "validation",
      details: {
        nextStatus: params.nextStatus,
        allowedStatuses: Object.keys(CASE_TRANSITIONS),
      },
    });
  }

  if (params.nextStatus === currentStatus) {
    throw new AppError(`Case is already ${getCaseStatusLabel(currentStatus).toLowerCase()}.`, {
      status: 409,
      code: "validation_error",
      category: "validation",
      details: {
        currentStatus,
        nextStatus: params.nextStatus,
      },
    });
  }

  const allowedTransitions = getAllowedCaseTransitions(currentStatus);

  if (!allowedTransitions.includes(params.nextStatus)) {
    throw new AppError(
      `Cannot move a case from ${getCaseStatusLabel(currentStatus).toLowerCase()} to ${getCaseStatusLabel(params.nextStatus).toLowerCase()}.`,
      {
        status: 409,
        code: "validation_error",
        category: "validation",
        details: {
          currentStatus,
          nextStatus: params.nextStatus,
          allowedTransitions,
        },
      },
    );
  }

  const trimmedNote = params.note?.trim() ?? "";

  if (NOTE_REQUIRED_STATUSES.has(params.nextStatus) && !trimmedNote) {
    throw new AppError(`A review note is required when moving a case to ${getCaseStatusLabel(params.nextStatus).toLowerCase()}.`, {
      status: 400,
      code: "validation_error",
      category: "validation",
      details: {
        currentStatus,
        nextStatus: params.nextStatus,
      },
    });
  }

  return {
    currentStatus,
    nextStatus: params.nextStatus,
    note: trimmedNote || null,
    allowedTransitions,
  };
}
