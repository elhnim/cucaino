"use client";

// Nugget Market, park style: a glowing market street of 10 company stalls. Kids move stars into
// their nugget wallet, watch prices move with the daily news, buy and sell shares. All trades
// use the existing trading actions (same rules, prices and dividends as before).
import { useCallback, useEffect, useState } from "react";
import { getNuggetMarket, type MarketData } from "@/lib/actions/park-market";
import { buyAsset, sellAsset, depositToTrading, withdrawFromTrading } from "@/lib/actions/trading";
import { TRADING_ASSETS, NUGGETS_PER_STAR } from "@/lib/trading/assets";
import { playSfx } from "@/lib/audio/sound-manager";
import { CandySheet, CandyButton } from "../ui/CandySheet";
import { C, FONT, alpha, cardStyle, mutedText } from "../ui/theme";

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`);

export function NuggetMarket({ kidId, onClose, onStars }: { kidId: string; onClose: () => void; onStars?: (stars: number) => void }) {
  const [data, setData] = useState<MarketData | null | "loading">("loading");
  const [tab, setTab] = useState<"market" | "mine">("market");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    getNuggetMarket(kidId).then((d) => {
      setData(d);
      if (d) onStars?.(d.stars);
    });
  }, [kidId, onStars]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      playSfx("wrong");
      return;
    }
    setMsg(okMsg);
    playSfx("coin");
    load();
  };

  if (data === "loading" || !data) {
    return (
      <CandySheet title="📈 Nugget Market" color={C.success} onClose={onClose}>
        <p style={muted}>{data === "loading" ? "Opening the market…" : "The market is closed right now — try again soon!"}</p>
      </CandySheet>
    );
  }

  const price = (sym: string) => data.prices[sym]?.current.priceNuggets ?? 0;
  const change = (sym: string) => {
    const p = data.prices[sym];
    if (!p?.previous) return 0;
    return ((p.current.priceNuggets - p.previous.priceNuggets) / p.previous.priceNuggets) * 100;
  };
  const owned = (sym: string) => data.holdings.find((h) => h.assetSymbol === sym)?.quantity ?? 0;
  const invested = data.holdings.reduce((a, h) => a + h.quantity * price(h.assetSymbol), 0);
  const cost = data.holdings.reduce((a, h) => a + h.quantity * h.avgCostNuggets, 0);
  const asset = open ? TRADING_ASSETS.find((a) => a.symbol === open) : null;

  return (
    <CandySheet
      title="📈 Nugget Market"
      subtitle={`🪙 ${fmt(data.nuggets)} nuggets · 📦 ${fmt(invested)} in shares · ⭐ ${data.stars} stars`}
      color={C.success}
      onClose={onClose}
      wide
    >
      {msg && <div style={msgStyle}>{msg}</div>}

      {/* wallet */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 160, fontWeight: 800, color: C.text }}>
          🪙 Nugget wallet · 1 ⭐ = {NUGGETS_PER_STAR.toLocaleString()} nuggets
          <div style={{ fontSize: 12, color: C.dim }}>Prices change every day with the news. Buy low, sell high!</div>
        </div>
        {[1, 5].map((n) => (
          <CandyButton key={`in${n}`} small color="#22c55e" disabled={busy || data.stars < n} onClick={() => act(() => depositToTrading(kidId, n), `+${(n * NUGGETS_PER_STAR).toLocaleString()} nuggets!`)}>
            ⭐{n} → 🪙
          </CandyButton>
        ))}
        <CandyButton small color="#f5b400" disabled={busy || data.nuggets < NUGGETS_PER_STAR} onClick={() => act(() => withdrawFromTrading(kidId, Math.floor(data.nuggets / NUGGETS_PER_STAR)), "Nuggets turned back into stars! ⭐")}>
          🪙 → ⭐ all
        </CandyButton>
      </div>

      <div style={tabsWrap}>
        {(["market", "mine"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className="gp-press" aria-pressed={tab === t} style={{ ...tabBtn, ...(tab === t ? tabOn : null) }}>
            {t === "market" ? "🏪 Market stalls" : `📦 My shares${data.holdings.length ? ` (${data.holdings.length})` : ""}`}
          </button>
        ))}
      </div>

      {asset ? (
        <div style={{ ...card, ...cardStyle(C.success, "rgba(24,40,60,0.86)") }}>
          <button type="button" onClick={() => setOpen(null)} style={backLink}>← All stalls</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <div style={{ fontSize: 48 }}>{asset.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 20, color: C.text }}>{asset.name}</div>
              <div style={{ fontWeight: 800, color: C.dim, fontSize: 13 }}>{asset.industry}{asset.paysDividend ? " · pays a bonus every week 💝" : ""}</div>
            </div>
            <Price value={price(asset.symbol)} pct={change(asset.symbol)} big />
          </div>
          <Spark values={data.history[asset.symbol] ?? []} height={70} />
          {data.prices[asset.symbol]?.current.newsHeadline && (
            <div style={{ ...newsStyle, marginTop: 10 }}>
              📰 <b>{data.prices[asset.symbol].current.newsHeadline}</b>
              {data.prices[asset.symbol].current.newsBody && <div style={{ fontWeight: 700, marginTop: 4 }}>{data.prices[asset.symbol].current.newsBody}</div>}
            </div>
          )}
          <p style={{ fontWeight: 700, color: C.dim, fontSize: 14 }}>{asset.description}</p>
          <div style={{ fontWeight: 900, color: C.text, marginBottom: 8 }}>You own {owned(asset.symbol).toFixed(owned(asset.symbol) % 1 ? 1 : 0)} share{owned(asset.symbol) === 1 ? "" : "s"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[1, 5, 10].map((q) => (
              <CandyButton key={`b${q}`} small color="#22c55e" disabled={busy || data.nuggets < q * price(asset.symbol)} onClick={() => act(() => buyAsset(kidId, asset.symbol, q), `You bought ${q} ${asset.name} share${q === 1 ? "" : "s"}! 🎉`)}>
                Buy {q} · 🪙{fmt(q * price(asset.symbol))}
              </CandyButton>
            ))}
            {owned(asset.symbol) > 0 && (
              <CandyButton small color="#ff4f6d" disabled={busy} onClick={() => act(() => sellAsset(kidId, asset.symbol, owned(asset.symbol)), `Sold! +🪙${fmt(owned(asset.symbol) * price(asset.symbol))}`)}>
                Sell all · 🪙{fmt(owned(asset.symbol) * price(asset.symbol))}
              </CandyButton>
            )}
          </div>
        </div>
      ) : tab === "market" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 10 }}>
          {TRADING_ASSETS.map((a) => (
            <button key={a.symbol} type="button" onClick={() => setOpen(a.symbol)} className="gp-press" style={{ ...card, ...cardStyle(owned(a.symbol) > 0 ? C.success : "soft", "rgba(30,27,74,0.86)"), textAlign: "left", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 34 }}>{a.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: C.text }}>{a.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.dim }}>{owned(a.symbol) > 0 ? `You own ${owned(a.symbol).toFixed(owned(a.symbol) % 1 ? 1 : 0)}` : a.industry}</div>
                </div>
                <Price value={price(a.symbol)} pct={change(a.symbol)} />
              </div>
              <Spark values={data.history[a.symbol] ?? []} height={34} />
            </button>
          ))}
        </div>
      ) : data.holdings.length === 0 ? (
        <p style={muted}>No shares yet — pick a stall and buy your first one! 🏪</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...card, fontWeight: 900, color: invested >= cost ? C.success : "#ff9aa8" }}>
            {invested >= cost ? "📈 Up" : "📉 Down"} {fmt(Math.abs(invested - cost))} nuggets overall — {invested >= cost ? "nice investing!" : "hold on, prices can bounce back!"}
          </div>
          {data.holdings.map((h) => {
            const a = TRADING_ASSETS.find((x) => x.symbol === h.assetSymbol);
            const now = h.quantity * price(h.assetSymbol);
            const was = h.quantity * h.avgCostNuggets;
            return (
              <button key={h.id} type="button" onClick={() => setOpen(h.assetSymbol)} className="gp-press" style={{ ...card, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 30 }}>{a?.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, color: C.text }}>{a?.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.dim }}>{h.quantity.toFixed(h.quantity % 1 ? 1 : 0)} shares · worth 🪙{fmt(now)}</div>
                </div>
                <div style={{ fontWeight: 900, color: now >= was ? C.success : C.danger }}>{now >= was ? "+" : "−"}{fmt(Math.abs(now - was))}</div>
              </button>
            );
          })}
        </div>
      )}
    </CandySheet>
  );
}

function Price({ value, pct, big }: { value: number; pct: number; big?: boolean }) {
  const up = pct >= 0;
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: big ? 24 : 17, color: C.gold }}>🪙{Math.round(value)}</div>
      <div style={{ fontWeight: 900, fontSize: 12, color: up ? C.success : "#ff8a9a" }}>
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </div>
    </div>
  );
}

function Spark({ values, height }: { values: number[]; height: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 200;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - min) / (max - min || 1)) * (height - 6) - 3}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, marginTop: 6 }}>
      <polyline points={pts} fill="none" stroke={up ? C.success : C.danger} strokeWidth="3" style={{ filter: `drop-shadow(0 0 4px ${up ? C.success : C.danger})` }} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const muted = mutedText;
const card: React.CSSProperties = { ...cardStyle("soft", "rgba(30,27,74,0.86)"), padding: 12, borderRadius: 16 };
const tabsWrap: React.CSSProperties = { display: "flex", gap: 4, marginBottom: 12, padding: 4, borderRadius: 14, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(160,190,255,0.16)" };
const tabBtn: React.CSSProperties = { flex: 1, minHeight: 44, border: "1px solid transparent", borderRadius: 10, padding: "0 12px", fontFamily: FONT.display, fontWeight: 400, letterSpacing: 0.4, fontSize: 15, color: C.dim, background: "transparent", cursor: "pointer" };
const tabOn: React.CSSProperties = { color: "#062a19", background: `linear-gradient(#9cf5c8, ${C.success} 50%, ${C.successDeep})`, borderColor: "#dcffee", boxShadow: `0 0 12px ${alpha(C.success, 0.45)}` };
const msgStyle: React.CSSProperties = { ...cardStyle(C.success, "rgba(20,60,44,0.7)"), padding: "8px 12px", fontWeight: 900, color: "#c8ffe4", marginBottom: 10, textAlign: "center" };
const newsStyle: React.CSSProperties = { ...cardStyle(C.gold, "rgba(64,48,12,0.6)"), padding: "10px 12px", color: "#ffeec2", fontSize: 14 };
const backLink: React.CSSProperties = { border: "none", background: "transparent", fontWeight: 900, color: C.success, cursor: "pointer", padding: "0 0 0 0", minHeight: 44 };
