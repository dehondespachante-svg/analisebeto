import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = process.env.SGDW_API_TOKEN || "";

const RTDB = "https://beto-58a10-default-rtdb.firebaseio.com/sgdw-tunnel.json";
const LOCAL_PORT = process.env.LOCAL_API_PORT || "8787";

let urlCache: { url: string; at: number } | null = null;
const URL_TTL = 15_000; // 15s — baixo para pegar nova URL rápido

async function fetchFromRtdb(): Promise<string | null> {
  try {
    const r = await fetch(RTDB, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { url?: string } | null;
    return d?.url?.trim() || null;
  } catch {
    return null;
  }
}

async function resolveBase(forceRefresh = false): Promise<string> {
  if (!process.env.VERCEL_URL) {
    return `http://localhost:${LOCAL_PORT}`;
  }
  if (!forceRefresh && urlCache && Date.now() - urlCache.at < URL_TTL) {
    return urlCache.url;
  }
  const url = await fetchFromRtdb();
  if (url) {
    urlCache = { url, at: Date.now() };
    return url;
  }
  throw new Error(
    "Nenhuma URL de tunnel no Firebase. Abra o iniciar.bat no servidor SGDW."
  );
}

async function callTunnel(base: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/sgdw-query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
}

function errorTunnel(status: number, base: string): NextResponse {
  const host = base.replace(/^https?:\/\//, "").split("/")[0];
  if (status === 404) {
    // Cloudflare retorna 404 quando o processo cloudflared parou
    return NextResponse.json(
      {
        error:
          `Tunnel expirou (${host}).\n` +
          "O cloudflared parou apos registrar a URL.\n" +
          "Solucao: reinicie o iniciar.bat no servidor SGDW.",
      },
      { status: 503 }
    );
  }
  if (status === 502 || status === 504) {
    // Tunnel OK mas localApi.js nao responde em localhost:8787
    return NextResponse.json(
      {
        error:
          `Tunnel ativo mas API local sem resposta (HTTP ${status}).\n` +
          "Verifique: logs\\local-api.log no servidor SGDW.",
      },
      { status: 503 }
    );
  }
  if (status === 503 || status === 530) {
    return NextResponse.json(
      { error: `Tunnel temporariamente indisponivel (HTTP ${status}). Tentando reconectar...` },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { error: `SGDW retornou HTTP ${status}.` },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  // ── 1. Resolve URL base ─────────────────────────────────────────────────────
  let base: string;
  try {
    base = await resolveBase();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "SGDW indisponivel." },
      { status: 503 }
    );
  }

  // ── 2. Primeira tentativa ───────────────────────────────────────────────────
  let r: Response;
  try {
    r = await callTunnel(base, body);
  } catch {
    // Erro de rede: tunnel sem resposta (timeout ou conexão recusada)
    urlCache = null;
    return NextResponse.json(
      {
        error:
          "Tunnel sem resposta de rede.\n" +
          "Verifique se o iniciar.bat esta rodando no servidor SGDW.",
      },
      { status: 503 }
    );
  }

  // ── 3. Sucesso ──────────────────────────────────────────────────────────────
  if (r.ok) return NextResponse.json(await r.json());
  if (r.status === 401) {
    return NextResponse.json(
      { error: "Token invalido — configure SGDW_API_TOKEN no Vercel." },
      { status: 401 }
    );
  }

  // ── 4. Erro do tunnel (4xx/5xx) → tenta URL fresca do RTDB ─────────────────
  const firstStatus = r.status;
  urlCache = null; // descarta cache imediatamente

  const freshUrl = await fetchFromRtdb();

  if (freshUrl && freshUrl !== base) {
    // URL diferente no RTDB — tunnel foi reiniciado, tenta nova URL
    urlCache = { url: freshUrl, at: Date.now() };
    try {
      const r2 = await callTunnel(freshUrl, body);
      if (r2.ok) return NextResponse.json(await r2.json());
      if (r2.status === 401) {
        return NextResponse.json(
          { error: "Token invalido — configure SGDW_API_TOKEN no Vercel." },
          { status: 401 }
        );
      }
      return errorTunnel(r2.status, freshUrl);
    } catch {
      urlCache = null;
      return NextResponse.json(
        { error: "Nova URL do tunnel sem resposta. Aguarde alguns segundos e tente novamente." },
        { status: 503 }
      );
    }
  }

  // URL do RTDB é a mesma (ou RTDB está vazio) — devolve erro específico
  return errorTunnel(firstStatus, base);
}

export async function GET() {
  const isLocal = !process.env.VERCEL_URL;
  try {
    const base = await resolveBase();
    return NextResponse.json({ ok: true, modo: isLocal ? "local" : "tunnel", tunnelAt: urlCache?.at ?? null });
  } catch {
    return NextResponse.json({ ok: false, modo: isLocal ? "local" : "tunnel" }, { status: 503 });
  }
}
