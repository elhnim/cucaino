"use client";

// The Prize Shop (rewards + wishlist) and Trophy Hall (badges) in candy style. Claiming reuses
// RewardClaimButton, so stars/cash choice, parent approval, strikes lock and the celebration
// are exactly the rules the app already has.
import { useCallback, useEffect, useState } from "react";
import { getPrizeShop, type PrizeShopData } from "@/lib/actions/park-quests";
import { addToWishlist, removeFromWishlist } from "@/lib/actions/rewards";
import RewardClaimButton from "@/components/kid/RewardClaimButton";
import BadgeTile from "@/components/kid/BadgeTile";
import CustomBadgeTile from "@/components/kid/CustomBadgeTile";
import { BADGE_META } from "@/lib/domain/badge-config";
import type { BadgeCategory, Reward } from "@/lib/domain/types";
import { levelFor, LEVELS } from "@/lib/park/builder/rules";
import { CandySheet } from "../ui/CandySheet";

const LEVEL_NAMES = ["Seedling", "Explorer", "Champion", "Legend", "Superstar"];

export function PrizeShop({ kidId, onClose, startTab = "prizes" }: { kidId: string; onClose: () => void; startTab?: "prizes" | "trophies" }) {
  const [tab, setTab] = useState<"prizes" | "trophies">(startTab);
  const [data, setData] = useState<PrizeShopData | null | "loading">("loading");

  const load = useCallback(() => {
    getPrizeShop(kidId).then(setData);
  }, [kidId]);
  useEffect(load, [load]);

  const wishIds = new Set(data && data !== "loading" ? data.wishlist.map((w) => w.rewardId) : []);
  const toggleWish = async (r: Reward) => {
    if (!data || data === "loading") return;
    if (wishIds.has(r.id)) await removeFromWishlist(kidId, r.id);
    else if (data.wishlist.length < 3) await addToWishlist(kidId, r.id);
    load();
  };

  const level = data && data !== "loading" ? levelFor(data.totalStarsEarned) : 1;
  const next = LEVELS[level] ?? null;

  return (
    <CandySheet
      title={tab === "prizes" ? "🏪 Prize Shop" : "🏆 Trophy Hall"}
      subtitle={data && data !== "loading" ? `⭐ ${data.stars} stars${data.cash > 0 ? ` · 💵 $${(data.cash / 100).toFixed(2)}` : ""}` : undefined}
      color={tab === "prizes" ? "#ff8a3d" : "#a96bff"}
      onClose={onClose}
      wide
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["prizes", "trophies"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ ...tabBtn, background: tab === t ? "linear-gradient(#ff7fbd,#ff4f9e)" : "#fff", color: tab === t ? "#fff" : "#7a2e62" }}>
            {t === "prizes" ? "🎁 Prizes" : "🏆 My trophies"}
          </button>
        ))}
      </div>

      {data === "loading" ? (
        <p style={muted}>Opening the shop…</p>
      ) : !data ? (
        <p style={muted}>Couldn&apos;t open the shop.</p>
      ) : tab === "prizes" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.strikes >= 3 && <div style={warn}>🚫 The shop is closed while you have {data.strikes} strikes. Talk to a grown-up to clear them!</div>}
          {data.wishlist.length > 0 && (
            <div>
              <div style={section}>💖 My wishlist ({data.wishlist.length}/3)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10 }}>
                {data.wishlist
                  .map((w) => data.rewards.find((r) => r.id === w.rewardId))
                  .filter((r): r is Reward => !!r)
                  .map((r) => (
                    <SaveUpCard key={r.id} reward={r} stars={data.stars} />
                  ))}
              </div>
            </div>
          )}
          <div style={section}>🎁 Prizes</div>
          {data.rewards.length === 0 ? (
            <p style={muted}>No prizes yet — ask a grown-up to add some!</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 12 }}>
              {data.rewards.map((r) => {
                const afford = r.costPoints <= data.stars || (r.costCashCents > 0 && r.costCashCents <= data.cash);
                return (
                  <div key={r.id} style={{ ...card, borderColor: afford ? "#ffd1a8" : "#f3e2ec" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ fontSize: 40, lineHeight: 1 }}>{r.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, color: "#5a2350" }}>{r.name}</div>
                        {r.description && <div style={{ fontSize: 12, fontWeight: 700, color: "#9b7090" }}>{r.description}</div>}
                      </div>
                      <button type="button" onClick={() => toggleWish(r)} aria-label="Wishlist" style={heart}>
                        {wishIds.has(r.id) ? "💖" : "🤍"}
                      </button>
                    </div>
                    {!afford && r.costPoints > 0 && <Bar value={data.stars / r.costPoints} label={`${Math.max(0, r.costPoints - data.stars)} more ⭐ to go`} />}
                    <div style={{ marginTop: 8 }}>
                      <RewardClaimButton
                        kidId={kidId}
                        rewardId={r.id}
                        rewardName={r.name}
                        rewardIcon={r.icon}
                        costPoints={r.costPoints}
                        costCashCents={r.costCashCents}
                        requiresApproval={r.requiresApproval}
                        currentStars={data.stars}
                        currentCash={data.cash}
                        blockedByStrikes={data.strikes >= 3 ? data.strikes : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...card, borderColor: "#e3d4ff" }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#5a2350" }}>
              🌟 Level {level} · {LEVEL_NAMES[level - 1]}
            </div>
            {next !== null ? (
              <Bar value={data.totalStarsEarned / next} label={`${next - data.totalStarsEarned} more ⭐ earned to reach ${LEVEL_NAMES[level]}`} />
            ) : (
              <div style={{ fontWeight: 800, color: "#9b7090" }}>Top level — you&apos;re a Superstar! 🌟</div>
            )}
          </div>
          <div style={section}>🏅 Quest trophies</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px,1fr))", gap: 10 }}>
            {(Object.keys(BADGE_META) as BadgeCategory[]).map((cat) => {
              const b = data.badges.find((x) => x.category === cat);
              return <BadgeTile key={cat} category={cat} completionCount={b?.completionCount ?? 0} size="md" />;
            })}
          </div>
          {data.customBadges.length > 0 && (
            <>
              <div style={section}>🎯 Goal badges</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px,1fr))", gap: 10 }}>
                {data.customBadges.map((p) => (
                  <CustomBadgeTile key={p.badgeId} progress={p} size="md" />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </CandySheet>
  );
}

function SaveUpCard({ reward, stars }: { reward: Reward; stars: number }) {
  const ready = reward.costPoints <= stars;
  return (
    <div style={{ ...card, borderColor: ready ? "#bdf0cf" : "#ffd1e6" }}>
      <div style={{ fontSize: 30 }}>{reward.icon}</div>
      <div style={{ fontWeight: 900, fontSize: 14, color: "#5a2350" }}>{reward.name}</div>
      {ready ? <div style={{ fontWeight: 900, color: "#15803d", fontSize: 13 }}>Ready to claim! 🎉</div> : <Bar value={stars / Math.max(1, reward.costPoints)} label={`${reward.costPoints - stars} ⭐ to go`} />}
    </div>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 10, borderRadius: 999, background: "#f3dbe8", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(3, Math.min(1, value) * 100)}%`, background: "linear-gradient(90deg,#ff7fbd,#ffd84a)" }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#9b7090", marginTop: 3 }}>{label}</div>
    </div>
  );
}

const muted: React.CSSProperties = { textAlign: "center", color: "#b0799f", fontWeight: 800, padding: "18px 0" };
const section: React.CSSProperties = { fontWeight: 900, fontSize: 13, letterSpacing: 1, color: "#c26a9f", textTransform: "uppercase", margin: "0 4px 8px" };
const card: React.CSSProperties = { borderRadius: 22, border: "3px solid", padding: 12, background: "#fff", boxShadow: "0 4px 0 #f5d3e6, 0 8px 18px rgba(122,46,98,0.08)" };
const tabBtn: React.CSSProperties = { border: "none", borderRadius: 999, padding: "9px 16px", fontWeight: 900, fontSize: 15, boxShadow: "0 3px 0 #f5d3e6", cursor: "pointer" };
const heart: React.CSSProperties = { border: "none", background: "transparent", fontSize: 22, cursor: "pointer", padding: 0 };
const warn: React.CSSProperties = { borderRadius: 18, padding: "10px 14px", fontWeight: 900, color: "#9b1c1c", background: "#ffe4e6" };
