import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AI intake demo: the call, the matter it opens and the speed it does it at";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The social preview card, drawn on the demo's own palette. */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #0b0e13 0%, #12161d 60%, #1a1f28 100%)",
          color: "#f3f1ea",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg, #f6d27a, #e9b44c 55%, #e0862a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 800,
              color: "#1a1204",
            }}
          >
            H
          </div>
          <div style={{ fontSize: 28, color: "#b3b0a6" }}>Harbor Point Injury Law · AI client intake</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>AI Intake for Injury Law Firms</div>
          <div style={{ fontSize: 34, color: "#e9b44c" }}>Answers in seconds. Qualifies, checks conflicts, sends the retainer.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24, color: "#b3b0a6" }}>
          <span style={{ padding: "10px 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)" }}>Live call or web form</span>
          <span style={{ padding: "10px 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)" }}>Matter in Lawmatics</span>
          <span style={{ padding: "10px 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)" }}>Speed to lead</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
