import Link from "next/link";

export default function SchemaPage() {
  return (
    <div className="container" style={{ padding: "80px 0" }}>
      <header style={{ marginBottom: "40px" }}>
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
          Open Documentation
        </p>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "16px" }}>Terroir Watch Data Schema</h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "1.2rem", maxWidth: "700px" }}>
          This page defines the ingestion pipeline, discrepancy taxonomy, and public data model used by
          the transparency engine to analyze agricultural claims.
        </p>
      </header>

      <main style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
            }}
          >
            <h2 style={{ fontSize: "1.8rem" }}>1. Public Data Model</h2>
            <Link href="/" style={{ fontSize: "0.9rem", color: "var(--color-accent-green)" }}>
              Back Home
            </Link>
          </div>
          <div
            style={{
              background: "var(--color-bg-secondary)",
              padding: "32px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h3 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>extracted_claims table</h3>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Stores entities identified across the document corpus with a calculated confidence score.
            </p>
            <pre
              style={{
                background: "#FFFFFF",
                padding: "16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
                overflowX: "auto",
                fontSize: "0.9rem",
                color: "var(--color-text-primary)",
              }}
            >
              {`{
  "id": "uuid",
  "case_id": "uuid",
  "document_id": "uuid",
  "claim_type": "string (producer_name | bottling_date | pdo_region | varietal)",
  "claim_value": "string",
  "confidence_score": "numeric(5,2)"
}`}
            </pre>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: "1.8rem", marginBottom: "24px" }}>2. Discrepancy Taxonomy</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "24px",
            }}
          >
            <div
              style={{
                padding: "24px",
                background: "#F8F4EA",
                borderRadius: "var(--radius-md)",
                borderTop: "4px solid var(--color-accent-gold)",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Missing Fields</h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem" }}>
                Required provenance proofs (for example, origin certification) are absent from the export
                or label documents.
              </p>
            </div>

            <div
              style={{
                padding: "24px",
                background: "#F8F4EA",
                borderRadius: "var(--radius-md)",
                borderTop: "4px solid #B91C1C",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Mismatched Region Claims</h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem" }}>
                The PDO or GI claimed on the label or digital passport contradicts the certified lab record.
              </p>
            </div>

            <div
              style={{
                padding: "24px",
                background: "#F8F4EA",
                borderRadius: "var(--radius-md)",
                borderTop: "4px solid #D97706",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Differing Dates</h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem" }}>
                Harvest or bottling dates conflict across shipment records and producer attestations.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: "1.8rem", marginBottom: "24px" }}>3. Model Limitations</h2>
          <div
            style={{
              background: "#FFFFFF",
              padding: "32px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
            }}
          >
            <ul
              style={{
                color: "var(--color-text-secondary)",
                paddingLeft: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <li>
                <strong>OCR Accuracy:</strong> Text extraction from poor-quality images or scans may
                introduce parsing errors, impacting the AI discrepancy analysis.
              </li>
              <li>
                <strong>Hallucinations:</strong> While the temperature is set to 0.1 for high determinism,
                the extraction layer still requires human review via the Watch Report to verify anomalies.
              </li>
              <li>
                <strong>Language Support:</strong> Currently optimized for English and Georgian (KA)
                institutional certificates.
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
