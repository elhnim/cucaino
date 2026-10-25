"use client";

// The Prize Shop (rewards + wishlist) and Trophy Hall (badges) as a game shop: glass item cards
// with a rarity edge by price. Claiming reuses
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
import { C, FONT, RARITY, alpha, cardStyle, display, mutedText, rarityForStars, sectionLabel } from "../ui/theme";
import { IconChip } from "../ui/IconChip";
import { ProgressBar } from "../ui/ProgressBar";
import { Badge } from "../ui/Badge";

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
      subtitle={
        data && data !== "loading" ? (
          <span style={{ display: "inline-flex", gap: 8, marginTop: 2 }}>
            <Badge color={C.gold}>⭐ {data.stars} stars</Badge>
            {data.cash > 0 && <Badge color={C.success}>💵 ${(data.cash / 100).toFixed(2)}</Badge>}
          </span>
        ) : undefined
      }
      color={tab === "prizes" ? C.gold : C.violet}
      onClose={onClose}
      wide
    >
      <div style={tabsWrap}>
        {(["prizes", "trophies"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className="gp-press" aria-pressed={tab === t} style={{ ...tabBtn, ...(tab === t ? tabOn : null) }}>
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
              <div style={section}>
                <span>💖 My wishlist ({data.wishlist.length}/3)</span>
                <span aria-hidden style={rule} />
              </div>
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
          <div style={section}>
            <span>🎁 Prizes</span>
            <span aria-hidden style={rule} />
          </div>
          {data.rewards.length === 0 ? (
            <p style={muted}>No prizes yet — ask a grown-up to add some!</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 12 }}>
              {data.rewards.map((r) => {
                const afford = r.costPoints <= data.stars || (r.costCashCents > 0 && r.costCashCents <= data.cash);
                const rar = RARITY[rarityForStars(r.costPoints / 5)];
                return (
                  <div key={r.id} style={{ ...cardStyle(afford ? C.gold : rar.color, "rgba(30,27,74,0.86)"), ...card, display: "flex", flexDirection: "column", boxShadow: afford ? `0 0 16px ${alpha(C.gold, 0.35)}, 0 6px 16px rgba(0,0,0,0.3)` : card.boxShadow }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <IconChip color={rar.color} size={58} style={{ fontSize: 34 }}>
                        {r.icon}
                      </IconChip>
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        {r.costPoints > 0 && <Badge color={C.gold}>⭐ {r.costPoints}</Badge>}
                        {r.costCashCents > 0 && <Badge color={C.success}>💵 ${(r.costCashCents / 100).toFixed(2)}</Badge>}
                        <button type="button" onClick={() => toggleWish(r)} aria-label="Wishlist" style={heart} className="gp-press">
                          {wishIds.has(r.id) ? "💖" : "🤍"}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: rar.color, marginTop: 8 }}>{rar.label}</div>
                    <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2, color: C.text }}>{r.name}</div>
                    {r.description && <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, marginTop: 2 }}>{r.description}</div>}
                    {!afford && r.costPoints > 0 && <Bar value={data.stars / r.costPoints} label={`${Math.max(0, r.costPoints - data.stars)} more ⭐ to go`} />}
                    <div style={{ marginTop: "auto", paddingTop: 10 }}>
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
          <div style={{ ...cardStyle("violet", "rgba(40,28,96,0.86)"), ...card, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={levelGem}>
              <span style={{ fontSize: 11, letterSpacing: 1, color: C.ink, fontFamily: FONT.display }}>LV</span>
              <span style={{ ...display(26, C.ink), lineHeight: 0.9 }}>{level}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={display(20)}>{LEVEL_NAMES[level - 1]}</div>
              {next !== null ? (
                <Bar value={data.totalStarsEarned / next} label={`${next - data.totalStarsEarned} more ⭐ earned to reach ${LEVEL_NAMES[level]}`} />
              ) : (
                <div style={{ fontWeight: 800, color: C.dim }}>Top level — you&apos;re a Superstar! 🌟</div>
              )}
            </div>
          </div>
          <div style={section}>
            <span>🏅 Quest trophies</span>
            <span aria-hidden style={rule} />
          </div>
          <div style={{ ...trophyShelf, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px,1fr))", gap: 10 }}>
            {(Object.keys(BADGE_META) as BadgeCategory[]).map((cat) => {
              const b = data.badges.find((x) => x.category === cat);
              return <BadgeTile key={cat} category={cat} completionCount={b?.completionCount ?? 0} size="md" />;
            })}
          </div>
          {data.customBadges.length > 0 && (
            <>
              <div style={section}>
                <span>🎯 Goal badges</span>
                <span aria-hidden style={rule} />
              </div>
              <div style={{ ...trophyShelf, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px,1fr))", gap: 10 }}>
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
    <div style={{ ...cardStyle(ready ? C.success : "#ff7ab8", "rgba(30,27,74,0.86)"), ...card }}>
      <div style={{ fontSize: 30, filter: "drop-shadow(0 0 8px rgba(255,122,184,0.5))" }}>{reward.icon}</div>
      <div style={{ fontWeight: 900, fontSize: 14, color: C.text, marginTop: 4 }}>{reward.name}</div>
      {ready ? <div style={{ fontWeight: 900, color: C.success, fontSize: 13 }}>Ready to claim! 🎉</div> : <Bar value={stars / Math.max(1, reward.costPoints)} label={`${reward.costPoints - stars} ⭐ to go`} />}
    </div>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <ProgressBar value={Math.max(0.03, Math.min(1, value))} color={C.gold} height={9} label={label} style={{ marginTop: 8 }} />
  );
}

const muted = mutedText;
const section = sectionLabel;
const rule: React.CSSProperties = { flex: 1, height: 1, background: `linear-gradient(90deg, ${alpha(C.gold, 0.55)}, transparent)` };
const card: React.CSSProperties = { borderRadius: 16, padding: 12, boxShadow: "0 6px 16px rgba(0,0,0,0.3)" };
const tabsWrap: React.CSSProperties = { display: "flex", gap: 4, marginBottom: 14, padding: 4, borderRadius: 14, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(160,190,255,0.16)" };
const tabBtn: React.CSSProperties = { flex: 1, minHeight: 44, border: "1px solid transparent", borderRadius: 10, padding: "0 14px", fontFamily: FONT.display, fontWeight: 400, letterSpacing: 0.4, fontSize: 16, color: C.dim, background: "transparent", cursor: "pointer" };
const tabOn: React.CSSProperties = { color: C.ink, background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})`, borderColor: "#fff0b8", boxShadow: `0 0 12px ${alpha(C.gold, 0.45)}` };
const heart: React.CSSProperties = { border: "none", background: "transparent", fontSize: 22, cursor: "pointer", padding: 0, width: 44, height: 44, flexShrink: 0 };
const warn: React.CSSProperties = { ...cardStyle(C.danger, "rgba(80,16,30,0.7)"), padding: "10px 14px", fontWeight: 900, color: "#ffc2cb" };
const levelGem: React.CSSProperties = {
  width: 62,
  height: 62,
  flexShrink: 0,
  borderRadius: 16,
  transform: "rotate(0deg)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})`,
  border: "2px solid #fff0b8",
  boxShadow: `0 0 18px ${alpha(C.gold, 0.55)}, 0 4px 10px rgba(0,0,0,0.4)`,
};
/** badge tiles are drawn for light pages: give them a soft light plinth */
const trophyShelf: React.CSSProperties = { padding: 12, borderRadius: 16, background: "linear-gradient(rgba(240,238,255,0.94), rgba(222,220,248,0.94))", border: "1px solid rgba(255,255,255,0.5)", boxShadow: "inset 0 2px 8px rgba(0,0,0,0.15)" };
