import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Probe server-side — evita CORS e restricoes de rede do browser
// O Vercel faz a requisicao diretamente ao tunnel, sem passar pelo browser
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url")?.trim().replace(/\/$/, "");
  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const r = await fetch(`${url}/api/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ ok: r.ok, status: r.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
