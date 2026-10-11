import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** Icono de la PWA generado con la paleta (sin binarios en el repo). */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(req.url).searchParams.has("maskable");
  const pad = maskable ? size * 0.18 : size * 0.1;
  const inner = size - pad * 2;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#2C2153" }}>
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: inner * 0.22,
            background: "linear-gradient(160deg, #FFCF9C 0%, #FF8C6B 45%, #E8543F 75%, #7C3F82 100%)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ height: inner * 0.24, background: "rgba(44,33,83,0.85)", display: "flex" }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#2C2153", fontSize: inner * 0.42, fontWeight: 800 }}>
            ✓
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
