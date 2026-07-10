import "client-only";

import type { RelatorioHonorariosGerado } from "@/src/lib/honorariosParser";

const RELATORIO_CACHE_KEY = "honorarios:relatorio:v5";
const TEXTO_ARQUIVO_CACHE_PREFIX = "honorarios:file-text:v5:";
const BASE_ANUAL_CACHE_KEY = "honorarios:base-anual:v1";

type ArquivoCacheavel = Pick<File, "lastModified" | "name" | "size">;

export type BaseAnualCache = {
  periodos: Array<{
    ano: number;
    mesNumero: number;
    honorarios: number;
    quantidade: number;
    valorOs: number;
    label: string;
  }>;
  servicos: Array<{
    codigo: string;
    servico: string;
    ano: number;
    mesNumero: number;
    honorarios: number;
  }>;
  atualizadoEm: string;
};

function cacheKeyArquivo(file: ArquivoCacheavel) {
  return `${TEXTO_ARQUIVO_CACHE_PREFIX}${file.name}:${file.size}:${file.lastModified}`;
}

export function carregarTextoArquivoCache(file: ArquivoCacheavel) {
  try {
    return window.localStorage.getItem(cacheKeyArquivo(file));
  } catch {
    return null;
  }
}

export function salvarTextoArquivoCache(file: ArquivoCacheavel, texto: string) {
  try {
    window.localStorage.setItem(cacheKeyArquivo(file), texto);
  } catch {
    // Cache local e opcional; a analise continua se o navegador negar espaco.
  }
}

export function salvarRelatorioCache(relatorio: RelatorioHonorariosGerado) {
  try {
    window.localStorage.setItem(
      RELATORIO_CACHE_KEY,
      JSON.stringify({
        relatorio,
        atualizadoEm: new Date().toISOString(),
      })
    );
  } catch {
    // Cache local e opcional; a analise continua se o navegador negar espaco.
  }
}

export function carregarRelatorioCache() {
  try {
    const raw = window.localStorage.getItem(RELATORIO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { relatorio?: RelatorioHonorariosGerado };
    return parsed.relatorio || null;
  } catch {
    return null;
  }
}

function chavePeriodoBase(periodo: { ano: number; mesNumero: number }) {
  return `${periodo.ano}-${String(periodo.mesNumero).padStart(2, "0")}`;
}

function chaveServicoBase(servico: { codigo: string; servico: string; ano: number; mesNumero: number }) {
  return `${servico.codigo || servico.servico}:${servico.ano}-${String(servico.mesNumero).padStart(2, "0")}`;
}

export function carregarBaseAnualCache(): BaseAnualCache | null {
  try {
    const raw = window.localStorage.getItem(BASE_ANUAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BaseAnualCache;
    return {
      periodos: Array.isArray(parsed.periodos) ? parsed.periodos : [],
      servicos: Array.isArray(parsed.servicos) ? parsed.servicos : [],
      atualizadoEm: typeof parsed.atualizadoEm === "string" ? parsed.atualizadoEm : "",
    };
  } catch {
    return null;
  }
}

export function salvarBaseAnualCache(relatorio: RelatorioHonorariosGerado) {
  try {
    const atual = carregarBaseAnualCache();
    const periodos = new Map<string, BaseAnualCache["periodos"][number]>();
    const servicos = new Map<string, BaseAnualCache["servicos"][number]>();

    atual?.periodos.forEach((periodo) => periodos.set(chavePeriodoBase(periodo), periodo));
    atual?.servicos.forEach((servico) => servicos.set(chaveServicoBase(servico), servico));

    (relatorio.periodosImportados || []).forEach((periodo) => {
      if (!periodo.ano || !periodo.mesNumero) return;
      periodos.set(chavePeriodoBase(periodo), {
        ano: periodo.ano,
        mesNumero: periodo.mesNumero,
        honorarios: periodo.honorarios || 0,
        quantidade: periodo.quantidade || 0,
        valorOs: periodo.valorOs || 0,
        label: periodo.label || `${periodo.mes}/${periodo.ano}`,
      });
    });

    (relatorio.servicosPorPeriodo || []).forEach((item) => {
      item.periodos.forEach((periodo) => {
        if (!periodo.ano || !periodo.mesNumero) return;
        const registro = {
          codigo: String(item.codigo),
          servico: item.servico,
          ano: periodo.ano,
          mesNumero: periodo.mesNumero,
          honorarios: periodo.honorarios || 0,
        };
        servicos.set(chaveServicoBase(registro), registro);
      });
    });

    window.localStorage.setItem(
      BASE_ANUAL_CACHE_KEY,
      JSON.stringify({
        periodos: Array.from(periodos.values()).sort((a, b) => a.ano - b.ano || a.mesNumero - b.mesNumero),
        servicos: Array.from(servicos.values()).sort((a, b) => a.ano - b.ano || a.mesNumero - b.mesNumero || a.servico.localeCompare(b.servico, "pt-BR")),
        atualizadoEm: new Date().toISOString(),
      } satisfies BaseAnualCache)
    );
  } catch {
    // Base anual local e opcional; a analise continua com os arquivos enviados.
  }
}

export function limparRelatorioCache() {
  try {
    window.localStorage.removeItem(RELATORIO_CACHE_KEY);
  } catch {
    // A interface fica limpa mesmo se o navegador bloquear storage.
  }
}
