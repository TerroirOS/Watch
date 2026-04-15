"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CASE_STATUS_LABELS,
  getAllowedCaseTransitions,
  getCaseStatusLabel,
} from "@/lib/case-workflow";
import { getErrorMessage } from "@/lib/errors";
import type { CaseStatus } from "@/lib/types";

export function ReviewActions({
  caseId,
  currentStatus,
}: {
  caseId: string;
  currentStatus: CaseStatus | null;
}) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<CaseStatus | "">("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedTransitions = getAllowedCaseTransitions(currentStatus);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStatus) {
      setError("Choose the next review status before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/cases/${caseId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: selectedStatus,
          note,
        }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };

      if (!response.ok) {
        throw new Error(payload.error?.message || "Unable to update case status.");
      }

      setSelectedStatus("");
      setNote("");
      router.refresh();
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError, "Unable to update case status."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--color-bg-secondary)",
        padding: "24px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
      }}
    >
      <h3 style={{ fontSize: "1.1rem", marginBottom: "10px" }}>Review Workflow</h3>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
          marginBottom: "16px",
        }}
      >
        Current state: <strong>{getCaseStatusLabel(currentStatus)}</strong>
      </p>

      {allowedTransitions.length === 0 ? (
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          This case has no further workflow actions available.
        </p>
      ) : (
        <>
          {error && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                background: "#FEE2E2",
                color: "#B91C1C",
                marginBottom: "16px",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <label
            htmlFor="next-status"
            style={{ display: "block", fontWeight: 600, marginBottom: "8px", fontSize: "0.9rem" }}
          >
            Next Status
          </label>
          <select
            id="next-status"
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value as CaseStatus | "")}
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              fontSize: "0.95rem",
              fontFamily: "var(--font-sans)",
              marginBottom: "14px",
              background: "#FFFFFF",
            }}
          >
            <option value="">Select an action</option>
            {allowedTransitions.map((status) => (
              <option key={status} value={status}>
                {CASE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <label
            htmlFor="review-note"
            style={{ display: "block", fontWeight: 600, marginBottom: "8px", fontSize: "0.9rem" }}
          >
            Review Note
          </label>
          <textarea
            id="review-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder="Required for hold, escalate, and reject actions."
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              fontSize: "0.95rem",
              fontFamily: "var(--font-sans)",
              resize: "vertical",
              marginBottom: "16px",
            }}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px 18px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent-green)",
              color: "#FFFFFF",
              fontWeight: 600,
              fontSize: "0.95rem",
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Updating Status..." : "Apply Review Action"}
          </button>
        </>
      )}
    </form>
  );
}
