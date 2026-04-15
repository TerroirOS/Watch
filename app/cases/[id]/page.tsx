import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaseStatusLabel } from "@/lib/case-workflow";
import { caseRepository } from "@/lib/repositories";
import type {
  AuditLogRecord,
  CaseRecord,
  DiscrepancyRecord,
  DocumentRecord,
  ExtractedClaimRecord,
} from "@/lib/types";
import { ReviewActions } from "./ReviewActions";

export const revalidate = 0;

interface CaseDetails {
  caseData: CaseRecord;
  documents: DocumentRecord[];
  claims: ExtractedClaimRecord[];
  discrepancies: DiscrepancyRecord[];
  auditLogs: AuditLogRecord[];
}

async function getCaseDetails(id: string): Promise<CaseDetails | null> {
  try {
    return await caseRepository.getDetail(id);
  } catch (error) {
    console.error(error);
    return null;
  }
}

const severityColor: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "#FEE2E2", text: "#B91C1C", border: "#B91C1C" },
  medium: { bg: "#FEF3C7", text: "#92400E", border: "#D97706" },
  low: { bg: "#F8F4EA", text: "#5A4A2A", border: "#C4A235" },
};

export default async function WatchReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCaseDetails(id);

  if (!data) {
    return notFound();
  }

  const { caseData, documents, claims, discrepancies, auditLogs } = data;
  const highCount = discrepancies.filter((item) => item.severity === "high").length;

  return (
    <div className="container" style={{ padding: "60px 0 120px" }}>
      <header
        style={{
          marginBottom: "40px",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "24px",
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
              Terroir Watch Report
            </p>
            <h1 style={{ fontSize: "clamp(1.8rem, 3vw, 2.5rem)", marginBottom: "8px" }}>
              {caseData.title}
            </h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
              Case ID:{" "}
              <code
                style={{
                  fontSize: "0.85rem",
                  background: "var(--color-bg-tertiary)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                {caseData.id}
              </code>
              {" | "}Created:{" "}
              {new Date(caseData.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                fontSize: "0.85rem",
                fontWeight: 600,
                background:
                  caseData.status === "open"
                    ? "#D1FAE5"
                    : "var(--color-bg-tertiary)",
                color:
                  caseData.status === "open"
                    ? "#065F46"
                    : "var(--color-text-secondary)",
              }}
            >
              {getCaseStatusLabel(caseData.status)}
            </span>
            <Link
              href="/cases"
              style={{
                padding: "10px 20px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
                fontSize: "0.9rem",
              }}
            >
              Back to cases
            </Link>
          </div>
        </div>
      </header>

      {caseData.ai_summary && (
        <section
          style={{
            marginBottom: "40px",
            padding: "28px 32px",
            background: "linear-gradient(135deg, #F8F4EA 0%, #FCFBF8 100%)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border-focus)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--color-accent-green)",
                flexShrink: 0,
              }}
            />
            <p
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--color-accent-green)",
                margin: 0,
              }}
            >
              AI Analysis Summary
            </p>
          </div>
          <p style={{ color: "var(--color-text-primary)", lineHeight: 1.75, fontSize: "1.05rem", margin: 0 }}>
            {caseData.ai_summary}
          </p>
        </section>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        {[
          { label: "Documents Ingested", value: documents.length, color: "var(--color-accent-green)" },
          { label: "Claims Extracted", value: claims.length, color: "var(--color-accent-gold)" },
          {
            label: "Issues Found",
            value: discrepancies.length,
            color: discrepancies.length > 0 ? "#D97706" : "#059669",
          },
          { label: "High Severity", value: highCount, color: highCount > 0 ? "#B91C1C" : "#059669" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "20px 24px",
              background: "var(--color-bg-secondary)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                color: stat.color,
                fontFamily: "var(--font-sans)",
                lineHeight: 1.1,
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--color-text-secondary)",
                marginTop: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <main
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: "40px",
        }}
      >
        <div>
          <section style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "20px" }}>
              Discrepancy Analysis
              <span
                style={{
                  marginLeft: "12px",
                  background: discrepancies.length > 0 ? "#FEE2E2" : "#D1FAE5",
                  color: discrepancies.length > 0 ? "#B91C1C" : "#065F46",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "0.85rem",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                }}
              >
                {discrepancies.length} issue{discrepancies.length !== 1 ? "s" : ""}
              </span>
            </h2>

            {discrepancies.length === 0 ? (
              <div
                style={{
                  padding: "32px",
                  background: "#D1FAE5",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #6EE7B7",
                  textAlign: "center",
                }}
              >
                <p style={{ color: "#065F46", fontWeight: 500 }}>
                  No conflicts or significant discrepancies were detected across the provided documents.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {discrepancies.map((discrepancy) => {
                  const colors = severityColor[discrepancy.severity] || severityColor.low;

                  return (
                    <div
                      key={discrepancy.id}
                      style={{
                        padding: "24px",
                        background: "#FDFBF5",
                        borderRadius: "var(--radius-md)",
                        borderLeft: `4px solid ${colors.border}`,
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "12px",
                          marginBottom: "10px",
                        }}
                      >
                        <h3 style={{ fontSize: "1.05rem", color: "var(--color-text-primary)", margin: 0 }}>
                          {discrepancy.title}
                        </h3>
                        <span
                          style={{
                            background: colors.bg,
                            color: colors.text,
                            padding: "3px 10px",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            flexShrink: 0,
                            fontFamily: "var(--font-sans)",
                          }}
                        >
                          {discrepancy.severity}
                        </span>
                      </div>
                      <p
                        style={{
                          color: "var(--color-text-secondary)",
                          lineHeight: 1.65,
                          margin: 0,
                          fontSize: "0.95rem",
                        }}
                      >
                        {discrepancy.plain_language_summary}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "20px" }}>Extracted Claims</h2>
            <div
              style={{
                overflowX: "auto",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "var(--color-bg-tertiary)" }}>
                  <tr>
                    <th style={tableHeaderStyle}>Claim Type</th>
                    <th style={tableHeaderStyle}>Claim Value</th>
                    <th style={tableHeaderStyle}>Confidence</th>
                  </tr>
                </thead>
                <tbody style={{ background: "#FFFFFF" }}>
                  {claims.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: "32px", textAlign: "center", color: "var(--color-text-secondary)" }}>
                        No entities extracted.
                      </td>
                    </tr>
                  )}
                  {claims.map((claim) => (
                    <tr key={claim.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "14px 16px", fontWeight: 500, fontSize: "0.9rem" }}>
                        {claim.claim_type}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
                        {claim.claim_value}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div
                            style={{
                              height: "6px",
                              width: "60px",
                              background: "var(--color-bg-tertiary)",
                              borderRadius: "3px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.round(claim.confidence_score * 100)}%`,
                                background:
                                  claim.confidence_score > 0.8
                                    ? "#2D5A27"
                                    : claim.confidence_score > 0.5
                                      ? "#C4A235"
                                      : "#B91C1C",
                                borderRadius: "3px",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              background: claim.confidence_score > 0.8 ? "#D1FAE5" : "#FEF3C7",
                              color: claim.confidence_score > 0.8 ? "#065F46" : "#92400E",
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                              fontFamily: "var(--font-sans)",
                              fontWeight: 600,
                            }}
                          >
                            {Math.round(claim.confidence_score * 100)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside>
          <div
            style={{
              position: "sticky",
              top: "100px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            <div
              style={{
                background: "var(--color-bg-secondary)",
                padding: "24px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", marginBottom: "12px" }}>Source Documents</h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--color-text-secondary)",
                  marginBottom: "20px",
                  lineHeight: 1.6,
                }}
              >
                The following files were ingested to generate this report.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {documents.map((document) => (
                  <li
                    key={document.id}
                    style={{
                      padding: "12px 16px",
                      background: "#FFFFFF",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "0.875rem",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: "2px", wordBreak: "break-all" }}>
                      {document.filename}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                      {document.file_type || "Unknown type"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {caseData.description && (
              <div
                style={{
                  background: "var(--color-bg-secondary)",
                  padding: "24px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <h3 style={{ fontSize: "1.1rem", marginBottom: "12px" }}>Case Context</h3>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {caseData.description}
                </p>
              </div>
            )}

            <ReviewActions caseId={caseData.id} currentStatus={caseData.status} />

            <div
              style={{
                background: "var(--color-bg-secondary)",
                padding: "24px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", marginBottom: "12px" }}>Audit Trail</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {auditLogs.length === 0 ? (
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    No audit activity recorded yet.
                  </p>
                ) : (
                  auditLogs.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        background: "#FFFFFF",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        padding: "12px 14px",
                      }}
                    >
                      <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{entry.message}</p>
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--color-text-secondary)",
                          margin: 0,
                          lineHeight: 1.5,
                        }}
                      >
                        {entry.event_type} {" | "}
                        {new Date(entry.created_at).toLocaleString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Link
              href="/cases/new"
              style={{
                display: "block",
                padding: "14px 20px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-accent-green)",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: "0.95rem",
                textAlign: "center",
              }}
            >
              + Open New Case
            </Link>
          </div>
        </aside>
      </main>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: "14px 16px",
  textAlign: "left",
  borderBottom: "1px solid var(--color-border)",
  fontSize: "0.85rem",
  fontFamily: "var(--font-sans)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
