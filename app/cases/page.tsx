import Link from "next/link";
import { getCaseStatusLabel } from "@/lib/case-workflow";
import { caseRepository } from "@/lib/repositories";
import type { CaseListItem } from "@/lib/types";

export const revalidate = 0;

async function getAllCases(): Promise<CaseListItem[]> {
  try {
    return await caseRepository.list();
  } catch (error) {
    console.error(error);
    return [];
  }
}

const severityBadge: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "#FEE2E2", text: "#B91C1C", label: "High Risk" },
  medium: { bg: "#FEF3C7", text: "#92400E", label: "Medium Risk" },
  low: { bg: "#F8F4EA", text: "#5A4A2A", label: "Low Risk" },
};

export default async function CasesPage() {
  const cases = await getAllCases();

  return (
    <div className="container" style={{ padding: "60px 0 120px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "40px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-accent-gold)",
              marginBottom: "8px",
            }}
          >
            Open-Source Accountability
          </p>
          <h1 style={{ fontSize: "clamp(1.8rem, 3vw, 2.5rem)", marginBottom: "8px" }}>
            Watch Cases
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "1rem" }}>
            {cases.length} case{cases.length !== 1 ? "s" : ""} in the transparency record
          </p>
        </div>
        <Link
          href="/cases/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 24px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent-green)",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: "0.95rem",
          }}
        >
          + Open New Case
        </Link>
      </header>

      {cases.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 40px",
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--radius-lg)",
            border: "1px dashed var(--color-border-focus)",
          }}
        >
          <p
            style={{
              fontSize: "1.2rem",
              color: "var(--color-text-secondary)",
              marginBottom: "24px",
            }}
          >
            No cases yet. Upload documents to begin a transparency review.
          </p>
          <Link
            href="/cases/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "14px 28px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent-green)",
              color: "#FFFFFF",
              fontWeight: 600,
            }}
          >
            Open First Case
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {cases.map((caseItem) => {
            const badge = caseItem.highest_severity
              ? severityBadge[caseItem.highest_severity]
              : null;

            return (
              <Link
                key={caseItem.id}
                href={`/cases/${caseItem.id}`}
                style={{
                  display: "block",
                  padding: "24px 28px",
                  background: "var(--color-bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-sm)",
                  color: "inherit",
                  transition: "box-shadow 0.15s ease, border-color 0.15s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2
                      style={{
                        fontSize: "1.15rem",
                        marginBottom: "8px",
                        fontFamily: "var(--font-serif)",
                      }}
                    >
                      {caseItem.title}
                    </h2>
                    {caseItem.description && (
                      <p
                        style={{
                          color: "var(--color-text-secondary)",
                          fontSize: "0.9rem",
                          lineHeight: 1.6,
                          marginBottom: "16px",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {caseItem.description}
                      </p>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: "16px",
                        flexWrap: "wrap",
                        fontSize: "0.825rem",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <span>
                        {caseItem.document_count} doc{caseItem.document_count !== 1 ? "s" : ""}
                      </span>
                      <span>
                        {caseItem.discrepancy_count} issue
                        {caseItem.discrepancy_count !== 1 ? "s" : ""}
                      </span>
                      <span>
                        {new Date(caseItem.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "8px",
                      flexShrink: 0,
                    }}
                  >
                    {badge ? (
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.text,
                          padding: "4px 12px",
                          borderRadius: "999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {badge.label}
                      </span>
                    ) : (
                      <span
                        style={{
                          background: "#D1FAE5",
                          color: "#065F46",
                          padding: "4px 12px",
                          borderRadius: "999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        Clear
                      </span>
                    )}
                    <span
                      style={{
                        background:
                          caseItem.status === "open"
                            ? "#D1FAE5"
                            : caseItem.status === "approved"
                              ? "#DBEAFE"
                              : caseItem.status === "rejected"
                                ? "#FEE2E2"
                                : "var(--color-bg-tertiary)",
                        color:
                          caseItem.status === "open"
                            ? "#065F46"
                            : caseItem.status === "approved"
                              ? "#1D4ED8"
                              : caseItem.status === "rejected"
                                ? "#B91C1C"
                                : "var(--color-text-secondary)",
                        padding: "4px 12px",
                        borderRadius: "999px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {getCaseStatusLabel(caseItem.status)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
