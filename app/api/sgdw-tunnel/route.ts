import { NextResponse } from "next/server";

const TOKEN = "6ad74bc2cdc8d84953ea21ad89c25715d49ad614757b8aea5c599050b5d6e6dc";
// Firebase Realtime Database — persiste sem precisar de regras Firestore
const RTDB = "https://beto-58a10-default-rtdb.firebaseio.com/sgdw-tunnel.json";
// URL de producao — usada como fallback quando rodando localmente (dev server)
const PROD_API = "https://analisebeto.vercel.app/api/sgdw-tunnel";

// Cache em memoria — sobrevive enquanto o container Vercel / dev server estiver quente
let memCache: { url: string; at: number } | null = null;

async function rtdbRead(): Promise<string | null> {
  try {
    const r = await fetch(RTDB, { cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as { url?: string } | null;
    return d?.url ?? null;
  } catch {
    return null;
  }
}

async function rtdbWrite(url: string): Promise<void> {
  try {
    await fetch(RTDB, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, at: new Date().toISOString() }),
    });
  } catch {
    // Falha silenciosa — RTDB pode estar com regras restritas
  }
}

// Chamado apenas no dev local (evita loop infinito no Vercel)
async function prodRead(): Promise<string | null> {
  try {
    const r = await fetch(PROD_API, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { tunnelUrl?: string | null };
    return d?.tunnelUrl ?? null;
  } catch {
    return null;
  }
}

const isLocal = !process.env.VERCEL_URL;

export async function GET() {
  // 1. Cache em memoria (mesmo container — mais rapido)
  if (memCache && Date.now() - memCache.at < 3_600_000) {
    return NextResponse.json({ tunnelUrl: memCache.url });
  }
  // 2. Firebase Realtime Database (persistente entre containers)
  const rtdbUrl = await rtdbRead();
  if (rtdbUrl) {
    memCache = { url: rtdbUrl, at: Date.now() };
    return NextResponse.json({ tunnelUrl: rtdbUrl });
  }
  // 3. Dev local: lê da API de producao como fallback (server-to-server, sem CORS)
  if (isLocal) {
    const prodUrl = await prodRead();
    if (prodUrl) {
      memCache = { url: prodUrl, at: Date.now() };
      return NextResponse.json({ tunnelUrl: prodUrl });
    }
  }
  return NextResponse.json({ tunnelUrl: null });
}

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  let body: { tunnelUrl?: string };
  try {
    body = (await request.json()) as { tunnelUrl?: string };
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }
  const url = body.tunnelUrl?.trim();
  if (!url) {
    return NextResponse.json({ error: "tunnelUrl obrigatorio." }, { status: 400 });
  }

  memCache = { url, at: Date.now() };
  await rtdbWrite(url);

  return NextResponse.json({ ok: true });
}
