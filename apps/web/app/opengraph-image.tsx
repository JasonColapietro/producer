import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "./site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "flex-start",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 55%, #422006 100%)",
          color: "#fafafa",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px 84px",
          width: "100%",
        }}
      >
        <div style={{ color: "#f59e0b", display: "flex", fontSize: 30, fontWeight: 700 }}>
          SUEDE LABS AI
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
          <div style={{ display: "flex", fontSize: 82, fontWeight: 700, letterSpacing: "-0.04em" }}>
            {SITE_NAME}
          </div>
          <div style={{ color: "#fbbf24", display: "flex", fontSize: 44 }}>
            {SITE_TAGLINE}
          </div>
          <div style={{ color: "#d4d4d8", display: "flex", fontSize: 27, lineHeight: 1.35 }}>
            {SITE_DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
