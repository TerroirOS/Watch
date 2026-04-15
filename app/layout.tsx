import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terroir Watch",
  description:
    "An open-source AI transparency engine that monitors agricultural origin claims, certification records, and public documents to flag inconsistencies and make institutional decisions understandable.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "rgba(245, 240, 232, 0.92)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div
            className="container"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              height: "60px",
            }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "inherit",
              }}
            >
              <Image
                src="/logo.png"
                alt="Terroir Watch"
                width={30}
                height={30}
                style={{ flexShrink: 0 }}
              />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "1rem",
                  letterSpacing: "-0.01em",
                }}
              >
                Terroir{" "}
                <span style={{ color: "var(--color-accent-green)" }}>Watch</span>
              </span>
            </Link>

            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <Link
                href="/cases"
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                }}
              >
                Cases
              </Link>
              <Link
                href="/schema"
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                }}
              >
                Docs
              </Link>
              <Link
                href="/cases/new"
                style={{
                  padding: "8px 18px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-accent-green)",
                  color: "#FFFFFF",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  marginLeft: "8px",
                }}
              >
                + New Case
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
