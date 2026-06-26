import { sincronizarDadosLocaisComFirebase } from "@/src/features/dados-locais/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const segredo = process.env.DADOS_LOCAIS_SYNC_TOKEN;
  if (process.env.NODE_ENV === "production" && !segredo) {
    return Response.json({ erro: "DADOS_LOCAIS_SYNC_TOKEN nao configurado." }, { status: 500 });
  }

  if (segredo) {
    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${segredo}`) {
      return Response.json({ erro: "Nao autorizado." }, { status: 401 });
    }
  }

  try {
    const resultado = await sincronizarDadosLocaisComFirebase();
    return Response.json(resultado, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar dados locais.";
    return Response.json({ erro: message }, { status: 500 });
  }
}
