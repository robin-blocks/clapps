import Link from "next/link";

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "2rem",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.03em" }}>
        clapps
      </h1>
      <p style={{ color: "var(--muted)", maxWidth: "40ch", textAlign: "center" }}>
        Modular, intent-driven UI apps for OpenClaw agents.
      </p>
      <Link
        href="/c/workspace-viewer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.625rem 1.25rem",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          color: "var(--fg)",
          textDecoration: "none",
          fontSize: "0.875rem",
          transition: "background 0.15s",
        }}
      >
        Open Workspace Viewer
      </Link>
    </div>
  );
}
