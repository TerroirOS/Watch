import Link from "next/link";

export default function Home() {
  return (
    <div className="container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header handled by global nav */}
      
      <main style={{ flex: 1, padding: "80px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <p style={{
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-accent-gold)",
          marginBottom: "16px"
        }}>
          Open-Source Accountability
        </p>
        
        <h2 style={{
          fontSize: "clamp(2.5rem, 5vw, 4rem)",
          lineHeight: 1.1,
          maxWidth: "800px",
          marginBottom: "24px"
        }}>
          An AI transparency engine for agricultural origin claims.
        </h2>
        
        <p style={{
          fontSize: "1.2rem",
          color: "var(--color-text-secondary)",
          maxWidth: "700px",
          marginBottom: "48px"
        }}>
          Watch compares certification records, shipment data, and public documents to flag inconsistencies and surface risk, making institutional decisions understandable to producers, buyers, and the public.
        </p>
        
        <div style={{ display: "flex", gap: "16px" }}>
          <Link href="/cases/new" style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 32px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent-green)",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: "1rem"
          }}>
            Open a New Case
          </Link>
          <Link href="/schema" style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 32px",
            borderRadius: "var(--radius-md)",
            background: "transparent",
            border: "1px solid var(--color-border-focus)",
            color: "var(--color-text-primary)",
            fontWeight: 600,
            fontSize: "1rem"
          }}>
            View Documentation
          </Link>
        </div>
      </main>
      
      <footer style={{ padding: "40px 0", borderTop: "1px solid var(--color-border)", textAlign: "center", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
        <p>© {new Date().getFullYear()} Terroir Watch — Open Source Ecosystem</p>
      </footer>
    </div>
  );
}
