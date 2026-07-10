"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Copy,
  Database,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { buscarHonorariosSgdw } from "@/src/features/sgdw/client";
import type { SgdwDados } from "@/src/features/sgdw/types";
import styles from "@/src/styles/AnaliseHonorarios.module.css";

// ── Constantes fixas — nao precisam de input do usuario ──
const TOKEN = "6ad74bc2cdc8d84953ea21ad89c25715d49ad614757b8aea5c599050b5d6e6dc";
const URL_LOCAL = "http://localhost:8787";
const LS_URL_KEY = "sgdw:url-manual";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

type Status = "conectando" | "conectado" | "erro";
type AbaLocal = "resumo" | "meses" | "servicos";

function anoAtual() { return new Date().getFullYear(); }

const abasSgdw: Array<{ id: AbaLocal; label: string; icon: React.ReactNode }> = [
  { id: "resumo", label: "Resumo", icon: <BarChart3 size={16} /> },
  { id: "meses", label: "Mes a Mes", icon: <CalendarDays size={16} /> },
  { id: "servicos", label: "Servicos", icon: <ClipboardList size={16} /> },
];

async function testar(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/status`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function buscarUrlTunnel(): Promise<string | null> {
  try {
    const res = await fetch("/api/sgdw-tunnel", {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { tunnelUrl?: string | null };
    return data?.tunnelUrl || null;
  } catch {
    return null;
  }
}

export default function SgdwModo() {
  const [status, setStatus] = useState<Status>("conectando");
  const [apiUrl, setApiUrl] = useState(URL_LOCAL);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<SgdwDados | null>(null);
  const [anoInicio, setAnoInicio] = useState(anoAtual() - 1);
  const [anoFim, setAnoFim] = useState(anoAtual());
  const [carregando, setCarregando] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<AbaLocal>("resumo");
  const [copiado, setCopiado] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const montado = useRef(false);

  const buscarDados = useCallback(async (url: string, inicio: number, fim: number) => {
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await buscarHonorariosSgdw({ url, token: TOKEN }, inicio, fim);
      setDados(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao buscar dados.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const autoConectar = useCallback(async () => {
    setStatus("conectando");
    setErro(null);

    // 1. Tenta local primeiro (mesmo PC)
    if (await testar(URL_LOCAL)) {
      setApiUrl(URL_LOCAL);
      setStatus("conectado");
      return URL_LOCAL;
    }

    // 2. URL salva pelo usuario (localStorage)
    const urlSalva = typeof window !== "undefined" ? localStorage.getItem(LS_URL_KEY) : null;
    if (urlSalva && await testar(urlSalva)) {
      setApiUrl(urlSalva);
      setStatus("conectado");
      return urlSalva;
    }

    // 3. Busca URL do tunnel via API relay (Vercel / dev server)
    const tunnelUrl = await buscarUrlTunnel();
    if (tunnelUrl && await testar(tunnelUrl)) {
      setApiUrl(tunnelUrl);
      setStatus("conectado");
      return tunnelUrl;
    }

    setStatus("erro");
    setErro("Servidor nao encontrado. Cole a URL publica do tunnel abaixo (exibida no iniciar.bat do SERVIDOR).");
    return null;
  }, []);

  // Auto-conecta na montagem
  useEffect(() => {
    if (montado.current) return;
    montado.current = true;
    autoConectar().then((url) => {
      if (url) buscarDados(url, anoAtual() - 1, anoAtual());
    });
  }, [autoConectar, buscarDados]);

  // Re-busca quando filtro muda (so se ja conectado)
  useEffect(() => {
    if (status === "conectado" && apiUrl) {
      buscarDados(apiUrl, anoInicio, anoFim);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anoInicio, anoFim]);

  const melhorMes = dados?.periodos.length
    ? dados.periodos.reduce((a, b) => (b.honorarios > a.honorarios ? b : a))
    : null;

  const usandoTunnel = apiUrl !== URL_LOCAL && status === "conectado";

  // ── Tela de conexao (conectando / erro) ──
  if (status !== "conectado") {
    return (
      <div className={styles.sectionStack}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <Database size={20} />
            <h2>SGDW — Sistema de Gestao</h2>
            {status === "erro" && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "#d13b3b", fontWeight: 700 }}>
                <WifiOff size={15} /> Sem conexao
              </span>
            )}
          </div>

          {status === "conectando" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <RefreshCw size={18} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                Conectando ao SGDW...
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: "0.84rem", color: "#c0392b", background: "#fdf3f2", padding: "10px 14px", borderRadius: 8, border: "1px solid #f0c0bc", margin: 0 }}>
                {erro}
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="url"
                  placeholder="https://xxx.trycloudflare.com"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  style={{ flex: 1, minWidth: 260, padding: "8px 12px", borderRadius: 8, border: "1px solid #d0ddd6", fontSize: "0.82rem", fontFamily: "monospace" }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const url = urlInput.trim().replace(/\/$/, "");
                    if (!url) return;
                    if (await testar(url)) {
                      if (typeof window !== "undefined") localStorage.setItem(LS_URL_KEY, url);
                      setApiUrl(url);
                      setStatus("conectado");
                      buscarDados(url, anoInicio, anoFim);
                    } else {
                      setErro(`Nao foi possivel conectar em ${url}. Verifique se o EnyAPI esta rodando no servidor.`);
                    }
                  }}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Conectar
                </button>
              </div>
              <button
                type="button"
                onClick={() => autoConectar().then((url) => { if (url) buscarDados(url, anoInicio, anoFim); })}
                style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 8, background: "transparent", color: "var(--text-secondary)", border: "1px solid #d0ddd6", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}
              >
                <RefreshCw size={13} /> Tentar novamente
              </button>
            </div>
          )}
        </article>
      </div>
    );
  }

  // ── Tela principal (conectado) ──
  return (
    <div className={styles.sectionStack}>
      {/* Sub-nav */}
      {dados && (
        <div className={styles.tabBar} style={{ marginBottom: 4 }}>
          {abasSgdw.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${styles.tabBtn} ${abaAtiva === a.id ? styles.tabBtnActive : ""}`}
              onClick={() => setAbaAtiva(a.id)}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Barra de status + filtros */}
      <article className={styles.panel} style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "#1cb870", fontWeight: 700 }}>
            <Wifi size={14} /> Conectado
          </span>
          {usandoTunnel && (
            <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", background: "#f0fdf6", border: "1px solid #b2dfcb", borderRadius: 5, padding: "2px 7px" }}>
              via tunnel publico
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <select
              value={anoInicio}
              onChange={(e) => setAnoInicio(Number(e.target.value))}
              style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid #d0ddd6", fontSize: "0.82rem", background: "#f8fbf9" }}
            >
              {Array.from({ length: 8 }, (_, i) => anoAtual() - 7 + i).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>ate</span>
            <select
              value={anoFim}
              onChange={(e) => setAnoFim(Number(e.target.value))}
              style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid #d0ddd6", fontSize: "0.82rem", background: "#f8fbf9" }}
            >
              {Array.from({ length: 8 }, (_, i) => anoAtual() - 7 + i).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => buscarDados(apiUrl, anoInicio, anoFim)}
              disabled={carregando}
              style={{ padding: "5px 12px", borderRadius: 7, background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, opacity: carregando ? 0.6 : 1 }}
            >
              <RefreshCw size={12} />
              {carregando ? "..." : "Atualizar"}
            </button>
          </div>
          {usandoTunnel && (
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(apiUrl).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }); }}
              title="Copiar URL publica"
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid #b2dfcb", background: copiado ? "#1a7d50" : "#fff", color: copiado ? "#fff" : "#1a7d50", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
            >
              <Copy size={11} /> {copiado ? "Copiado!" : "URL"}
            </button>
          )}
        </div>
        {erro && (
          <p style={{ marginTop: 8, fontSize: "0.78rem", color: "#c0392b" }}>{erro}</p>
        )}
      </article>

      {/* Conteudo das abas */}
      {dados && (
        <>
          {/* ===== ABA RESUMO ===== */}
          {abaAtiva === "resumo" && (
            <>
              <div className={styles.metricGrid}>
                <article className={styles.metricCard}>
                  <span>Total honorarios</span>
                  <strong>{moeda.format(dados.totalHonorarios)}</strong>
                  <div><small>{num.format(dados.totalQuantidade)} OS no periodo</small></div>
                </article>
                <article className={styles.metricCard}>
                  <span>Total recebido</span>
                  <strong style={{ color: dados.taxaGlobal >= 0.9 ? "#1a7d50" : dados.taxaGlobal >= 0.6 ? "#b07020" : "#c0392b" }}>
                    {moeda.format(dados.totalRecebido)}
                  </strong>
                  <div><small>Taxa: {pct.format(dados.taxaGlobal)}</small></div>
                </article>
                <article className={styles.metricCard}>
                  <span>A receber</span>
                  <strong style={{ color: "#b07020" }}>
                    {moeda.format(Math.max(0, dados.totalHonorarios - dados.totalRecebido))}
                  </strong>
                  <div><small>Saldo em aberto</small></div>
                </article>
                <article className={styles.metricCard}>
                  <span>Ticket medio</span>
                  <strong>
                    {dados.totalQuantidade > 0 ? moeda.format(dados.totalHonorarios / dados.totalQuantidade) : "—"}
                  </strong>
                  <div><small>por OS no periodo</small></div>
                </article>
                {melhorMes && (
                  <article className={styles.metricCard}>
                    <span>Melhor mes</span>
                    <strong style={{ color: "#1a7d50" }}>{melhorMes.label}</strong>
                    <div><small>{moeda.format(melhorMes.honorarios)}</small></div>
                  </article>
                )}
                <article className={styles.metricCard}>
                  <span>Servicos ativos</span>
                  <strong>{num.format(dados.servicos.length)}</strong>
                  <div><small>tipos distintos no periodo</small></div>
                </article>
              </div>

              {dados.periodos.length >= 2 && (
                <article className={styles.chartPanel}>
                  <div className={styles.panelHeader}>
                    <BarChart3 size={20} />
                    <h2>Honorarios x Recebido — SGDW</h2>
                    <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                      {new Date(dados.geradoEm).toLocaleTimeString("pt-BR")}
                    </span>
                  </div>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dados.periodos} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5c7566" }} />
                        <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#5c7566" }} width={62} />
                        <Tooltip
                          formatter={(value, name) => {
                            const v = moeda.format(Number(value));
                            if (name === "honorarios") return [v, "Faturado"];
                            if (name === "recebido") return [v, "Recebido"];
                            return [v, String(name)];
                          }}
                          labelStyle={{ fontWeight: 700 }}
                        />
                        <Legend formatter={(v) => v === "honorarios" ? "Faturado" : v === "recebido" ? "Recebido" : v} />
                        <Bar dataKey="honorarios" name="honorarios" fill="#1f9d72" radius={[4, 4, 0, 0]} />
                        <Line dataKey="recebido" name="recebido" stroke="#4666c9" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              )}

              {dados.periodos.length >= 2 && (
                <article className={styles.chartPanel}>
                  <div className={styles.panelHeader}>
                    <BarChart3 size={20} />
                    <h2>Volume de OS por mes</h2>
                  </div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dados.periodos} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5c7566" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#5c7566" }} width={40} />
                        <Tooltip formatter={(value) => [num.format(Number(value)), "OS"]} />
                        <Bar dataKey="quantidade" fill="#7bb3a0" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              )}

              {dados.periodos.length === 0 && (
                <article className={styles.panel}>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    Nenhum dado no periodo. Ajuste os filtros de ano.
                  </p>
                </article>
              )}
            </>
          )}

          {/* ===== ABA MES A MES ===== */}
          {abaAtiva === "meses" && (
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <CalendarDays size={20} />
                <h2>Detalhe mensal — SGDW</h2>
              </div>
              {dados.periodos.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Nenhum periodo no intervalo.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th style={{ textAlign: "right" }}>O.S.</th>
                        <th style={{ textAlign: "right" }}>Honorarios</th>
                        <th style={{ textAlign: "right" }}>Recebido</th>
                        <th style={{ textAlign: "right" }}>A receber</th>
                        <th style={{ textAlign: "right" }}>Taxa</th>
                        <th style={{ textAlign: "right" }}>Ticket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.periodos.map((p) => {
                        const aReceber = Math.max(0, p.honorarios - p.recebido);
                        const ticket = p.quantidade > 0 ? p.honorarios / p.quantidade : 0;
                        return (
                          <tr key={`${p.ano}-${p.mes}`}>
                            <td><strong>{p.label}</strong></td>
                            <td style={{ textAlign: "right" }}>{num.format(p.quantidade)}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{moeda.format(p.honorarios)}</td>
                            <td style={{ textAlign: "right", color: p.taxaRecebimento >= 0.9 ? "#1a7d50" : p.taxaRecebimento >= 0.6 ? "#b07020" : "#c0392b" }}>
                              {moeda.format(p.recebido)}
                            </td>
                            <td style={{ textAlign: "right", color: aReceber > 0 ? "#b07020" : "#1a7d50" }}>
                              {aReceber > 0 ? moeda.format(aReceber) : "—"}
                            </td>
                            <td style={{ textAlign: "right", fontSize: "0.82rem" }}>{pct.format(p.taxaRecebimento)}</td>
                            <td style={{ textAlign: "right", fontSize: "0.82rem" }}>{ticket > 0 ? moeda.format(ticket) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700, borderTop: "2px solid #d0ddd6" }}>
                        <td>Total</td>
                        <td style={{ textAlign: "right" }}>{num.format(dados.totalQuantidade)}</td>
                        <td style={{ textAlign: "right" }}>{moeda.format(dados.totalHonorarios)}</td>
                        <td style={{ textAlign: "right" }}>{moeda.format(dados.totalRecebido)}</td>
                        <td style={{ textAlign: "right", color: "#b07020" }}>
                          {moeda.format(Math.max(0, dados.totalHonorarios - dados.totalRecebido))}
                        </td>
                        <td style={{ textAlign: "right" }}>{pct.format(dados.taxaGlobal)}</td>
                        <td style={{ textAlign: "right" }}>
                          {dados.totalQuantidade > 0 ? moeda.format(dados.totalHonorarios / dados.totalQuantidade) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </article>
          )}

          {/* ===== ABA SERVICOS ===== */}
          {abaAtiva === "servicos" && (
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <ClipboardList size={20} />
                <h2>Honorarios por servico — SGDW</h2>
              </div>
              {dados.servicos.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Nenhum servico no periodo.</p>
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Servico</th>
                          <th style={{ textAlign: "right" }}>Qtd</th>
                          <th style={{ textAlign: "right" }}>Honorarios</th>
                          <th style={{ textAlign: "right" }}>Recebido</th>
                          <th style={{ textAlign: "right" }}>Taxa</th>
                          <th style={{ textAlign: "right" }}>Part.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.servicos.map((s, idx) => {
                          const taxa = s.honorarios > 0 ? s.recebido / s.honorarios : 0;
                          return (
                            <tr key={`${s.codigo}-${s.servico}`}>
                              <td style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>{idx + 1}</td>
                              <td>
                                <strong>{s.servico}</strong>
                                {s.codigo > 0 && <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginLeft: 6 }}>#{s.codigo}</span>}
                              </td>
                              <td style={{ textAlign: "right" }}>{num.format(s.quantidade)}</td>
                              <td style={{ textAlign: "right", fontWeight: 600 }}>{moeda.format(s.honorarios)}</td>
                              <td style={{ textAlign: "right", color: taxa >= 0.9 ? "#1a7d50" : taxa >= 0.6 ? "#b07020" : "#c0392b" }}>
                                {moeda.format(s.recebido)}
                              </td>
                              <td style={{ textAlign: "right", fontSize: "0.82rem" }}>{pct.format(taxa)}</td>
                              <td style={{ textAlign: "right", fontSize: "0.82rem" }}>{pct.format(s.participacao)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700, borderTop: "2px solid #d0ddd6" }}>
                          <td></td>
                          <td>Total</td>
                          <td style={{ textAlign: "right" }}>{num.format(dados.totalQuantidade)}</td>
                          <td style={{ textAlign: "right" }}>{moeda.format(dados.totalHonorarios)}</td>
                          <td style={{ textAlign: "right" }}>{moeda.format(dados.totalRecebido)}</td>
                          <td style={{ textAlign: "right" }}>{pct.format(dados.taxaGlobal)}</td>
                          <td style={{ textAlign: "right" }}>100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {dados.servicos.length >= 2 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dados.servicos.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e4ebe7" />
                            <XAxis type="number" tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#5c7566" }} />
                            <YAxis type="category" dataKey="servico" width={130} tick={{ fontSize: 10, fill: "#5c7566" }} tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v} />
                            <Tooltip formatter={(value) => [moeda.format(Number(value)), "Honorarios"]} />
                            <Bar dataKey="honorarios" fill="#1f9d72" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </>
              )}
            </article>
          )}
        </>
      )}
    </div>
  );
}
