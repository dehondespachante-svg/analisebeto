"use client";

import type { SgdwConfig, SgdwDados, SgdwLinhaBruta, SgdwPeriodo, SgdwServico } from "./types";

const URL_KEY = "sgdw:url";
const TOKEN_KEY = "sgdw:token";

const MESES: Record<number, string> = {
  1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
};

export function carregarConfigSgdw(): SgdwConfig {
  if (typeof window === "undefined") return { url: "http://localhost:8787", token: "" };
  return {
    url: localStorage.getItem(URL_KEY) || "http://localhost:8787",
    token: localStorage.getItem(TOKEN_KEY) || "",
  };
}

export function salvarConfigSgdw(config: SgdwConfig): void {
  localStorage.setItem(URL_KEY, config.url.replace(/\/$/, ""));
  localStorage.setItem(TOKEN_KEY, config.token.trim());
}

async function sgdwPost<T>(config: SgdwConfig, endpoint: string, body: unknown): Promise<T> {
  const base = config.url.replace(/\/$/, "");
  const resp = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (resp.status === 401) throw new Error("Token invalido ou nao autorizado.");
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`API retornou HTTP ${resp.status}${txt ? ": " + txt.slice(0, 120) : ""}.`);
  }

  return resp.json() as Promise<T>;
}

export async function testarConexaoSgdw(config: SgdwConfig): Promise<void> {
  const result = await sgdwPost<{ rows: unknown[] }>(config, "/api/sgdw-query", {
    sql: "SELECT 1 AS PING FROM RDB$DATABASE",
  });
  if (!Array.isArray(result.rows)) throw new Error("Resposta inesperada da API.");
}

export async function buscarHonorariosSgdw(
  config: SgdwConfig,
  anoInicio: number,
  anoFim: number
): Promise<SgdwDados> {
  const result = await sgdwPost<{ rows: SgdwLinhaBruta[] }>(config, "/api/sgdw-query", {
    sql: `SELECT FIRST 5000
       EXTRACT(YEAR FROM o.orddtemi) AS ANO,
       EXTRACT(MONTH FROM o.orddtemi) AS MES,
       COALESCE(s.sernumer, 0) AS CODIGO_SERVICO,
       COALESCE(TRIM(s.serdescr), 'SEM SERVICO') AS SERVICO,
       COUNT(*) AS QUANTIDADE,
       SUM(COALESCE(o.ordvltot, o.ordvalor, 0)) AS HONORARIOS,
       SUM(COALESCE(o.ordvlpag, o.ordvlpago, 0)) AS RECEBIDO
     FROM tbordse o
     LEFT JOIN tbservi s ON o.sosnumer = s.sernumer
     WHERE COALESCE(o.ordcanc, 0) = 0
       AND o.orddtemi >= ?
       AND o.orddtemi <= ?
     GROUP BY EXTRACT(YEAR FROM o.orddtemi), EXTRACT(MONTH FROM o.orddtemi),
              s.sernumer, s.serdescr
     ORDER BY EXTRACT(YEAR FROM o.orddtemi), EXTRACT(MONTH FROM o.orddtemi),
              SUM(COALESCE(o.ordvltot, o.ordvalor, 0)) DESC`,
    params: [`${anoInicio}-01-01`, `${anoFim}-12-31`],
  });

  const linhas = result.rows || [];

  const porPeriodo = new Map<string, SgdwPeriodo>();
  const porServico = new Map<string, SgdwServico>();
  let totalHonorarios = 0;
  let totalRecebido = 0;
  let totalQuantidade = 0;

  for (const row of linhas) {
    const ano = Number(row.ANO);
    const mes = Number(row.MES);
    const hon = Number(row.HONORARIOS) || 0;
    const rec = Number(row.RECEBIDO) || 0;
    const qtd = Number(row.QUANTIDADE) || 0;

    const pk = `${ano}-${String(mes).padStart(2, "0")}`;
    const p = porPeriodo.get(pk) ?? {
      ano, mes, label: `${MESES[mes] ?? mes}/${ano}`,
      honorarios: 0, recebido: 0, quantidade: 0, taxaRecebimento: 0,
    };
    p.honorarios += hon;
    p.recebido += rec;
    p.quantidade += qtd;
    porPeriodo.set(pk, p);

    const sk = `${Number(row.CODIGO_SERVICO)}-${row.SERVICO}`;
    const s = porServico.get(sk) ?? {
      codigo: Number(row.CODIGO_SERVICO),
      servico: String(row.SERVICO || "SEM SERVICO"),
      honorarios: 0, recebido: 0, quantidade: 0, participacao: 0,
    };
    s.honorarios += hon;
    s.recebido += rec;
    s.quantidade += qtd;
    porServico.set(sk, s);

    totalHonorarios += hon;
    totalRecebido += rec;
    totalQuantidade += qtd;
  }

  const periodos: SgdwPeriodo[] = Array.from(porPeriodo.values())
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
    .map((p) => ({ ...p, taxaRecebimento: p.honorarios > 0 ? p.recebido / p.honorarios : 0 }));

  const servicos: SgdwServico[] = Array.from(porServico.values())
    .sort((a, b) => b.honorarios - a.honorarios)
    .slice(0, 20)
    .map((s) => ({ ...s, participacao: totalHonorarios > 0 ? s.honorarios / totalHonorarios : 0 }));

  return {
    periodos,
    servicos,
    totalHonorarios,
    totalRecebido,
    totalQuantidade,
    taxaGlobal: totalHonorarios > 0 ? totalRecebido / totalHonorarios : 0,
    geradoEm: new Date().toISOString(),
  };
}
