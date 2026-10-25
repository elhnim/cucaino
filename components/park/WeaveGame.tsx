"use client";

// Weave with the Peakfolk: a cosy stone craft hut high in the mountains (2D overlay, same shape
// as FishingGame.tsx — the 3D park keeps running behind it). A real wooden loom with a 10x8 warp
// grid: pick a wool colour, tap a cell to paint it, or tap the shuttle handle to weave a whole row
// across in one pass (the shuttle slides over). Follow a pattern card (stripes, checks, zigzag,
// diamonds, waves) for a star, or switch to Free Design, which is always celebrated regardless of
// score. Finished weaves go in a small on-device gallery, shown on a yak.
import { useEffect, useMemo, useState } from "react";
import { PATTERNS, WOOL_COLORS, WEAVE_FACTS, getPattern, type PatternDef } from "@/lib/park/registry/weaveFacts";
import {
  GALLERY_CAP,
  addToGallery,
  clearGrid,
  decodeGrid,
  finishWeave,
  initialWeaveState,
  makeGalleryEntry,
  paintCell,
  paintRow,
  selectColor,
  startFree,
  startPattern,
  undo,
  type GalleryEntry,
  type Grid,
  type WeaveState,
} from "@/lib/park/weaving/logic";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, PARK_CSS, alpha, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { PanelClose } from "./ui/GamePanel";

export interface WeaveGameProps {
  /** render the overlay (it renders nothing when false) */
  open: boolean;
  onClose: () => void;
  kidId: string;
  /** the Peakfolk weaver who runs the loom — shown as a host line (defaults to "Yorla") */
  villagerName?: string;
  /** force day/night art; defaults to the device clock (night 19:00-06:00) */
  night?: boolean;
}

function galleryKey(kidId: string): string {
  return `cucaino:weaves:${kidId}`;
}

function readGallery(kidId: string): GalleryEntry[] {
  try {
    const raw = window.localStorage.getItem(galleryKey(kidId));
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as GalleryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeGallery(kidId: string, gallery: GalleryEntry[]) {
  try {
    window.localStorage.setItem(galleryKey(kidId), JSON.stringify(gallery));
  } catch {
    /* private mode: this weave just won't be remembered next time */
  }
}

function defaultNight(): boolean {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
}

function woolHex(id: string | null | undefined): string {
  if (!id) return "transparent"; // plain warp — the thread pattern behind shows through
  return WOOL_COLORS.find((w) => w.id === id)?.hex ?? "#f5f0e0";
}

/** a small ball of wool, used both as the colour palette and as shelf decoration */
function YarnBall({ color, size = 44 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden style={{ display: "block" }}>
      <circle cx="17" cy="17" r="15" fill={color} />
      <path d="M4 14 Q17 22 30 12" stroke="rgba(0,0,0,0.18)" strokeWidth="1.4" fill="none" />
      <path d="M5 21 Q17 13 29 22" stroke="rgba(0,0,0,0.18)" strokeWidth="1.4" fill="none" />
      <path d="M8 7 Q17 18 23 28" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4" fill="none" />
      <ellipse cx="12" cy="11" rx="4" ry="2.6" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
}

/**
 * Small reusable grid painter — used both for the big interactive loom and for tiny gallery
 * thumbnails. The row-weave affordance is its own shuttle handle to the LEFT of the cells (not
 * the row's own click, which the cells themselves would intercept) — a clear, separate, big
 * enough tap target. Behind every cell runs a faint vertical warp-thread pattern so empty cells
 * still read as "loom", not "blank UI".
 */
function GridArt({
  grid,
  cellSize,
  gap = 2,
  interactive = false,
  onCell,
  onRow,
  shuttleRow,
}: {
  grid: Grid;
  /** a CSS length — e.g. "28px" for thumbnails, or a responsive var()/clamp() for the big loom */
  cellSize: string;
  gap?: number;
  interactive?: boolean;
  onCell?: (row: number, col: number) => void;
  onRow?: (row: number) => void;
  /** which row (if any) the shuttle is currently sliding across, keyed so it replays each weave */
  shuttleRow?: { row: number; key: number } | null;
}) {
  const warpBg = `repeating-linear-gradient(90deg, rgba(255,241,214,0.35) 0 2px, transparent 2px calc(${cellSize} + ${gap}px))`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: onRow ? gap + 4 : gap }}>
      {grid.map((row, r) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: onRow ? 6 : 0 }}>
          {onRow && (
            <button
              type="button"
              className="gp-press"
              onClick={() => onRow(r)}
              aria-label={`Weave row ${r + 1}`}
              title="Weave this whole row"
              style={{
                flexShrink: 0,
                // (a proper finger-sized target: 44 wide, and as tall as the row plus the gap to the next
                //  one, so the eight buttons make one easy column with no dead strips between them)
                width: `max(44px, calc(${cellSize} * 1.3))`,
                height: `calc(${cellSize} + ${gap * 4 + 4}px)`,
                margin: "-2px 0",
                borderRadius: 9,
                border: "none",
                background: "linear-gradient(180deg, #d8a35c, #9a6a34)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.3)",
                color: "#2a1a0c",
                fontSize: `calc(${cellSize} * 0.62)`,
                lineHeight: 1,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              ➤
            </button>
          )}
          <div
            style={{
              position: "relative",
              display: "flex",
              gap,
              background: `${warpBg}, linear-gradient(180deg, #4a3017, #3a2410)`,
              padding: gap * 2,
              borderRadius: 8,
              boxShadow: "inset 0 2px 5px rgba(0,0,0,0.4)",
            }}
          >
            {row.map((cell, c) => (
              <div
                key={c}
                onClick={onCell ? () => onCell(r, c) : undefined}
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 2,
                  background: woolHex(cell),
                  boxShadow: cell ? "inset 0 0 0 1px rgba(0,0,0,0.2), inset 0 2px 3px rgba(255,255,255,0.25)" : undefined,
                  cursor: onCell ? "pointer" : undefined,
                  touchAction: "manipulation",
                }}
              />
            ))}
            {interactive && shuttleRow && shuttleRow.row === r && (
              <div key={shuttleRow.key} className="wg-shuttle" aria-hidden>
                <svg width="30" height="20" viewBox="0 0 30 20">
                  <path d="M1 10 Q8 2 15 2 Q22 2 29 10 Q22 18 15 18 Q8 18 1 10 Z" fill="#8a5a2a" stroke="#4a3017" strokeWidth="1.2" />
                  <ellipse cx="15" cy="10" rx="5" ry="4" fill="#e8c285" />
                </svg>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A friendly Peakfolk weaver: round head, warm cheeks, simple woolly outfit. */
function WeaverArt({ size = 92 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 60 72" aria-hidden className="wg-bob">
      <ellipse cx="30" cy="66" rx="16" ry="5" fill="rgba(0,0,0,0.22)" />
      <path d="M12 68 Q12 40 30 40 Q48 40 48 68 Z" fill="#8a4a9a" />
      <path d="M14 52 Q30 58 46 52" stroke="#6a3578" strokeWidth="2" fill="none" />
      <circle cx="30" cy="26" r="16" fill="#e8b382" />
      <path d="M14 22 Q30 2 46 22 Q46 12 30 10 Q14 12 14 22 Z" fill="#f6f3ea" />
      <circle cx="24" cy="27" r="2.2" fill="#2a1a12" />
      <circle cx="36" cy="27" r="2.2" fill="#2a1a12" />
      <circle cx="21" cy="32" r="3" fill="#ff9aa8" opacity={0.6} />
      <circle cx="39" cy="32" r="3" fill="#ff9aa8" opacity={0.6} />
      <path d="M24 34 Q30 38 36 34" stroke="#2a1a12" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A yak peeking in through the window — gets dressed up in the finished weave on "Done". */
function YakArt({ size = 110, scarf }: { size?: number; scarf?: Grid }) {
  const stripe = scarf ? scarf[Math.floor(scarf.length / 2)] : undefined;
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 120 98" aria-hidden>
      <ellipse cx="60" cy="90" rx="48" ry="7" fill="rgba(0,0,0,0.2)" />
      <path d="M18 60 Q10 40 24 30 Q20 14 40 16 Q46 6 60 10 Q74 6 80 16 Q100 14 96 30 Q110 40 102 60 Q106 80 84 84 L36 84 Q14 80 18 60 Z" fill="#6b5744" />
      <path d="M28 34 Q14 28 16 16" stroke="#4a3a2c" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M92 34 Q106 28 104 16" stroke="#4a3a2c" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="46" r="5" fill="#2a1f18" />
      <circle cx="78" cy="46" r="5" fill="#2a1f18" />
      <path d="M50 60 Q60 66 70 60" stroke="#2a1f18" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {/* the scarf: a stripe of its own, coloured from the kid's weave if they made one */}
      {scarf && (
        <g>
          <rect x="34" y="58" width="52" height="14" rx="4" fill={woolHex(stripe?.find((c) => c) ?? null) === "transparent" ? "#f5f0e0" : woolHex(stripe?.find((c) => c) ?? null)} opacity={0.95} />
          {stripe?.slice(0, 10).map((c, i) => (
            <rect key={i} x={36 + i * 5} y="59" width="4.4" height="12" fill={woolHex(c)} opacity={c ? 0.95 : 0} />
          ))}
        </g>
      )}
    </svg>
  );
}

const SNOW_PEAKS = "M-5 40 L8 10 L20 28 L34 2 L48 24 L62 6 L76 26 L90 8 L104 30 L110 22 L110 40 Z";

export function WeaveGame({ open, onClose, kidId, villagerName, night: nightProp }: WeaveGameProps) {
  const [state, setState] = useState<WeaveState>(() => initialWeaveState());
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [shuttleRow, setShuttleRow] = useState<{ row: number; key: number } | null>(null);
  const [autoNight] = useState(defaultNight);
  const night = nightProp ?? autoNight;
  const weaverName = villagerName ?? "Yorla";

  // fresh loom + this kid's gallery every time the hut is opened
  useEffect(() => {
    if (!open) return;
    setState(initialWeaveState());
    setGallery(readGallery(kidId));
    setShowGallery(false);
    setShowPatterns(false);
    setShuttleRow(null);
  }, [open, kidId]);

  if (!open) return null;

  const activePattern = state.patternId ? getPattern(state.patternId) : undefined;

  const paintedCells = useMemo(() => state.grid.reduce((n, row) => n + row.filter(Boolean).length, 0), [state.grid]);
  const doneFact = useMemo(() => WEAVE_FACTS[Math.floor(Math.random() * WEAVE_FACTS.length)] ?? WEAVE_FACTS[0], [state.done]);

  const onCell = (r: number, c: number) => {
    playSfx("tap");
    setState((s) => paintCell(s, r, c));
  };
  const onRow = (r: number) => {
    playSfx("tap");
    setState((s) => paintRow(s, r));
    setShuttleRow({ row: r, key: Date.now() });
  };
  const onUndo = () => {
    playSfx("tap");
    setState((s) => undo(s));
  };
  const onClear = () => {
    playSfx("tap");
    setState((s) => clearGrid(s));
  };
  const onDone = () => {
    setState((s) => {
      const finished = finishWeave(s);
      const entry = makeGalleryEntry(finished);
      const nextGallery = addToGallery(gallery, entry);
      setGallery(nextGallery);
      writeGallery(kidId, nextGallery);
      playSfx(finished.lastResult?.isMatch ? "win" : "sparkle");
      return finished;
    });
  };
  const startAPattern = (id: string) => {
    playSfx("tap");
    setState((s) => startPattern(s, id));
    setShowPatterns(false);
  };
  const startFreeDesign = () => {
    playSfx("tap");
    setState((s) => startFree(s));
    setShowPatterns(false);
  };
  const weaveAnother = () => {
    playSfx("tap");
    setState((s) => (s.mode === "pattern" && s.patternId ? startPattern(s, s.patternId) : startFree(s)));
  };

  return (
    <div style={wrap} className="wg-root">
      <style>{PARK_CSS + CSS}</style>

      <div style={scene}>
        <div style={night ? skyNight : sky} />
        <svg style={peakLayer} viewBox="0 0 110 40" preserveAspectRatio="none" aria-hidden>
          <path d={SNOW_PEAKS} fill={night ? "#2c3550" : "#dfe9f3"} opacity={0.9} />
        </svg>
        {night && STARS.map((s, i) => <div key={i} aria-hidden className="wg-twinkle" style={{ ...star, left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.d}s` }} />)}

        {/* stone hut interior: textured wall, wooden beams */}
        <div style={hutWall} />
        <div style={{ ...beam, top: "31%" }} />
        <div style={{ ...beam, top: "31%", left: "8%", width: 10, height: "48%", transform: "none" }} />
        <div style={hutFloor} />

        {/* window: snowy peak outside, a woolly yak peeking in */}
        <div style={window_}>
          <div style={night ? skyNightSmall : skySmall} />
          <svg style={peakLayerSmall} viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden>
            <path d="M-2 30 L6 12 L14 22 L24 6 L34 20 L44 8 L54 22 L62 16 L62 30 Z" fill={night ? "#2c3550" : "#dfe9f3"} opacity={0.9} />
          </svg>
          <div style={yakPeek}>
            <YakArt size={62} />
          </div>
          <div style={windowMullionV} />
          <div style={windowMullionH} />
        </div>
        <div style={windowFrame} aria-hidden />

        {/* a warm lamp on the wall */}
        <div aria-hidden style={lampSpot}>
          <div className={night ? "wg-lampglow" : undefined} style={lampGlow} />
          <svg width="30" height="40" viewBox="0 0 30 40">
            <line x1="15" y1="0" x2="15" y2="10" stroke="#3a2715" strokeWidth="2.4" />
            <path d="M4 10 L26 10 L20 28 L10 28 Z" fill="#c98a1f" opacity={0.9} />
            <ellipse cx="15" cy="27" rx="7" ry="4" fill={night ? "#ffe9a8" : "#ffd36b"} opacity={night ? 1 : 0.8} />
          </svg>
        </div>

        {/* a shelf with balls of coloured yarn, finished scarves hung alongside */}
        <div style={shelf} aria-hidden />
        <div style={shelfRow} aria-hidden>
          {WOOL_COLORS.map((w) => (
            <YarnBall key={w.id} color={w.hex} size={30} />
          ))}
        </div>
        <div style={{ ...hangingScarf, left: "28%" }} aria-hidden>
          {["#e8485f", "#ffc23d", "#4fb4e8"].map((c, i) => (
            <div key={i} style={{ ...scarfStripe, background: c }} />
          ))}
        </div>
        <div style={{ ...hangingScarf, left: "38%" }} aria-hidden>
          {["#5aa852", "#f6f3ea", "#a860d6"].map((c, i) => (
            <div key={i} style={{ ...scarfStripe, background: c }} />
          ))}
        </div>

        {/* baskets of dyed wool, decorative */}
        <div style={{ ...basket, left: "4%" }} aria-hidden>
          🧺
        </div>
        <div style={{ ...basket, right: "4%" }} aria-hidden>
          🧺
        </div>

        {/* the weaver — anchored from the TOP so she's always clear of the loom panel below,
            whatever the panel's height ends up being on this screen */}
        <div style={weaverSpot}>
          <WeaverArt />
        </div>
      </div>

      {/* top bar */}
      <div style={topBar}>
        <div style={{ ...glass({ edge: "violet", fill: "rgba(14,12,38,0.82)" }), ...chip }}>
          <span style={display(16)}>🧶 Weaving with {weaverName}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="gp-press" style={galleryBtn} onClick={() => setShowGallery(true)} aria-label="Weave gallery">
            🖼️ {gallery.length}/{GALLERY_CAP}
          </button>
          <PanelClose onClose={onClose} label="Leave the hut" />
        </div>
      </div>

      {/* main loom panel — a warm wooden frame, not a dark UI panel */}
      {!showGallery && !state.done && (
        <div style={loomDock}>
          <div style={loomCard}>
            <div style={loomHeader}>
              <div style={{ ...display(14, "#f0dfc0") }}>{state.mode === "pattern" && activePattern ? `${activePattern.name} pattern card` : "Free design"}</div>
              <button type="button" className="gp-press" style={cardBtn} onClick={() => setShowPatterns(true)}>
                Change
              </button>
            </div>

            {state.mode === "pattern" && activePattern && (
              <div style={cardRow}>
                <MiniPatternPreview pattern={activePattern} />
                <div style={{ display: "flex", gap: 10 }}>
                  <ColorDot colorId={state.baseColor} label="Base" active={state.currentColor === state.baseColor} onClick={() => setState((s) => selectColor(s, state.baseColor))} />
                  <ColorDot colorId={state.accentColor} label="Accent" active={state.currentColor === state.accentColor} onClick={() => setState((s) => selectColor(s, state.accentColor))} />
                </div>
              </div>
            )}

            <div style={gridWrap} className="wg-scroll">
              <GridArt grid={state.grid} cellSize="var(--loom-cell)" interactive onCell={onCell} onRow={onRow} shuttleRow={shuttleRow} />
            </div>

            {state.mode === "free" && (
              <div style={paletteRow}>
                {WOOL_COLORS.map((w) => (
                  <ColorDot key={w.id} colorId={w.id} active={state.currentColor === w.id} onClick={() => setState((s) => selectColor(s, w.id))} />
                ))}
              </div>
            )}

            <div style={actionRow}>
              <GameButton small variant="secondary" onClick={onUndo} disabled={state.history.length === 0}>
                ↩️ Undo
              </GameButton>
              <GameButton small variant="secondary" onClick={onClear}>
                🧹 Clear
              </GameButton>
              <GameButton small variant="primary" onClick={onDone} disabled={paintedCells === 0}>
                ✅ Done
              </GameButton>
            </div>
          </div>
        </div>
      )}

      {/* pattern picker sheet */}
      {showPatterns && (
        <div style={sheetBackdrop} onPointerDown={(e) => e.target === e.currentTarget && setShowPatterns(false)}>
          <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.92)", blur: 12 }), ...patternSheet }} className="gp-sheet">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={display(19)}>Choose a pattern card</div>
              <PanelClose onClose={() => setShowPatterns(false)} />
            </div>
            <div style={patternGrid} className="gp-scroll">
              <button type="button" className="gp-press" style={patternTile} onClick={startFreeDesign}>
                <div style={{ fontSize: 30 }}>🎨</div>
                <div style={display(14)}>Free design</div>
                <div style={patternSub}>Any colours, any shape</div>
              </button>
              {PATTERNS.map((p) => (
                <button key={p.id} type="button" className="gp-press" style={patternTile} onClick={() => startAPattern(p.id)}>
                  <MiniPatternPreview pattern={p} size={60} />
                  <div style={display(14)}>{p.name}</div>
                  <div style={patternSub}>{"★".repeat(p.difficulty)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* finished weave celebration */}
      {state.done && state.lastResult && (
        <div style={doneWrap}>
          <div style={{ ...glass({ edge: state.lastResult.isMatch ? "gold" : "violet", fill: "rgba(18,16,44,0.92)", blur: 12 }), ...doneCard }} className="gp-popin">
            {state.lastResult.isMatch && state.mode === "pattern" && <div style={newRibbon}>✨ Perfect match!</div>}
            <div style={display(20)}>Your scarf!</div>
            <YakArt size={140} scarf={state.grid} />
            <div style={gridWrap}>
              <GridArt grid={state.grid} cellSize="14px" gap={1.5} />
            </div>
            <div style={factBox}>{doneFact.text}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <GameButton variant="primary" onClick={weaveAnother}>
                🧶 Weave another
              </GameButton>
              <GameButton variant="secondary" onClick={onClose}>
                Done
              </GameButton>
            </div>
          </div>
        </div>
      )}

      {/* gallery */}
      {showGallery && (
        <div style={sheetBackdrop} onPointerDown={(e) => e.target === e.currentTarget && setShowGallery(false)}>
          <div style={{ ...glass({ edge: "gold", fill: "rgba(16,14,40,0.92)", blur: 12 }), ...gallerySheet }} className="gp-sheet">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={display(19)}>🖼️ Your Weaves</div>
              <PanelClose onClose={() => setShowGallery(false)} />
            </div>
            {gallery.length === 0 ? (
              <div style={{ textAlign: "center", color: C.mute, fontWeight: 700, padding: "20px 0" }}>Weave your first scarf to start the gallery!</div>
            ) : (
              <div style={galleryGrid} className="gp-scroll">
                {gallery.map((g) => (
                  <div key={g.id} style={galleryTile}>
                    <GridArt grid={decodeGrid(g.cells, g.cols, g.rows)} cellSize="9px" gap={1.5} />
                    <div style={galleryLabel}>
                      {g.patternName ?? "Free design"} {g.isMatch && g.patternName ? "⭐" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ColorDot({ colorId, label, active, onClick }: { colorId: string; label?: string; active?: boolean; onClick: () => void }) {
  const hex = woolHex(colorId);
  return (
    <button type="button" className="gp-press" onClick={onClick} aria-label={label ?? colorId} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" }}>
      <YarnBall color={hex === "transparent" ? "#f5f0e0" : hex} size={active ? 48 : 44} />
      {active && <div style={{ height: 3, borderRadius: 2, background: C.gold, marginTop: 2, boxShadow: `0 0 6px ${alpha(C.gold, 0.8)}` }} />}
    </button>
  );
}

function MiniPatternPreview({ pattern, size = 44 }: { pattern: PatternDef; size?: number }) {
  const cols = 6;
  const rows = 6;
  const cell = size / cols;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ borderRadius: 6, overflow: "hidden" }}>
      <rect width={size} height={size} fill="rgba(255,255,255,0.12)" />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) =>
          pattern.template(c, r) ? <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={C.gold} opacity={0.85} /> : null,
        ),
      )}
    </svg>
  );
}

const STARS: { x: number; y: number; d: number }[] = Array.from({ length: 14 }, (_, i) => ({
  x: (i * 41.7) % 96,
  y: (i * 11.3) % 22,
  d: (i % 5) * 0.4,
}));

const wrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 90, overflow: "hidden", fontFamily: FONT.body };
const scene: React.CSSProperties = { position: "absolute", inset: 0, overflow: "hidden" };
const sky: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #bfe0ff 0%, #e8d8f0 50%, #d8c0a8 100%)" };
const skyNight: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #0a1020 0%, #1a1f38 55%, #241e2c 100%)" };
const peakLayer: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: 0, height: "26%", width: "100%" };
// a cosy stone wall: layered gradients fake mortar lines between roughly-brick-sized blocks
const hutWall: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  top: "20%",
  background:
    "repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 3px, transparent 3px 46px), " +
    "repeating-linear-gradient(90deg, rgba(0,0,0,0.1) 0 3px, transparent 3px 72px), " +
    "linear-gradient(180deg, #9c8a74 0%, #7d6b56 55%, #6b5a46 100%)",
};
const beam: React.CSSProperties = { position: "absolute", left: 0, width: "100%", height: 14, background: "linear-gradient(180deg, #8a6a46, #5a4228)", boxShadow: "0 2px 4px rgba(0,0,0,0.35)" };
const hutFloor: React.CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, height: "20%", background: "linear-gradient(180deg, #5a4a38 0%, #3e3226 100%)" };
// kept within the guaranteed-clear top ~30% (the loom card below can never exceed 70dvh tall)
// so the yak peeking in the bottom pane is never hidden behind the loom, whatever its height.
const window_: React.CSSProperties = { position: "absolute", right: "4%", top: "7%", width: "26%", maxWidth: 160, height: "21%", borderRadius: 10, overflow: "hidden", boxShadow: "inset 0 0 20px rgba(0,0,0,0.4)" };
const windowFrame: React.CSSProperties = { position: "absolute", right: "4%", top: "7%", width: "26%", maxWidth: 160, height: "21%", borderRadius: 10, border: "7px solid #4a3220", pointerEvents: "none" };
const windowMullionV: React.CSSProperties = { position: "absolute", left: "50%", top: 0, bottom: 0, width: 5, background: "#4a3220" };
const windowMullionH: React.CSSProperties = { position: "absolute", top: "50%", left: 0, right: 0, height: 5, background: "#4a3220" };
const skySmall: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #bfe0ff, #e8d8f0 70%)" };
const skyNightSmall: React.CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(180deg, #0a1020, #1a1f38 70%)" };
const peakLayerSmall: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: "20%", height: "50%", width: "100%" };
const yakPeek: React.CSSProperties = { position: "absolute", left: "50%", bottom: "2%", transform: "translateX(-50%)" };
const lampSpot: React.CSSProperties = { position: "absolute", left: "42%", top: "26%" };
const lampGlow: React.CSSProperties = { position: "absolute", left: "50%", top: "70%", transform: "translate(-50%,-50%)", width: 90, height: 90, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,211,107,0.5), transparent 70%)", pointerEvents: "none" };
const shelf: React.CSSProperties = { position: "absolute", left: "2%", top: "46%", width: "40%", maxWidth: 260, height: 12, background: "linear-gradient(180deg, #a07a48, #6b4a28)", borderRadius: 3, boxShadow: "0 3px 6px rgba(0,0,0,0.35)" };
const shelfRow: React.CSSProperties = { position: "absolute", left: "3%", top: "38%", width: "38%", maxWidth: 250, display: "flex", gap: 8, flexWrap: "wrap" };
const hangingScarf: React.CSSProperties = { position: "absolute", top: "24%", width: 20, display: "flex", flexDirection: "column", gap: 0, borderRadius: 2, overflow: "hidden", boxShadow: "0 3px 8px rgba(0,0,0,0.3)" };
const scarfStripe: React.CSSProperties = { width: "100%", height: 14 };
const basket: React.CSSProperties = { position: "absolute", bottom: "10%", fontSize: 46, filter: "saturate(1.3)" };
// anchored from the TOP (not bottom) so she's guaranteed clear of the loom card, which can never
// exceed 70dvh — the top ~30% of the screen is always visible scene, never covered by the panel.
const weaverSpot: React.CSSProperties = { position: "absolute", left: "4%", top: "23%" };
const star: React.CSSProperties = { position: "absolute", width: 3, height: 3, borderRadius: "50%", background: "#fff" };
const topBar: React.CSSProperties = { position: "fixed", top: "max(12px, env(safe-area-inset-top))", left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 8 };
const chip: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, borderRadius: 14, padding: "8px 14px", fontWeight: 900 };
const galleryBtn: React.CSSProperties = { ...glass({ edge: "gold", fill: "rgba(16,14,40,0.82)" }), borderRadius: 14, padding: "8px 14px", fontWeight: 900, fontSize: 14, fontFamily: FONT.display, cursor: "pointer" };
const loomDock: React.CSSProperties = { position: "fixed", left: 0, right: 0, bottom: "max(10px, env(safe-area-inset-bottom))", display: "flex", justifyContent: "center", zIndex: 3, padding: "0 10px" };
// the loom itself: a warm wooden frame (not a dark glass UI panel), with a CSS var controlling the
// responsive cell size — bigger on wide (tablet) screens, down to a comfortable minimum on phones.
const loomCard: React.CSSProperties = {
  // touch targets at least 44px on a tablet: the old clamp topped out at 38px even on a full-size
  // tablet width, and bottomed out at 23px on a phone — both below the 44px minimum. This keeps the
  // same clamp() shape but raises both ends (the loom card's own max width, 640px, still fits a
  // 44px cell times 10 columns plus the shuttle column, so nothing needs to resize around it).
  ["--loom-cell" as string]: "clamp(30px, calc((100vw - 140px) / 9.6), 44px)",
  width: "min(640px, 100%)",
  borderRadius: 22,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxHeight: "70dvh",
  background: "linear-gradient(180deg, #a9793f 0%, #8a5f30 45%, #6b4624 100%)",
  border: "4px solid #5a3c1f",
  boxShadow: "inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -4px 10px rgba(0,0,0,0.35), 0 10px 28px rgba(0,0,0,0.45)",
  color: "#fff3e0",
};
const loomHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const cardBtn: React.CSSProperties = { borderRadius: 10, padding: "6px 12px", fontWeight: 800, fontSize: 13, fontFamily: FONT.body, color: "#2a1a0c", background: "rgba(255,255,255,0.75)", border: "none", cursor: "pointer" };
const cardRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const gridWrap: React.CSSProperties = { display: "flex", justifyContent: "center", overflow: "auto" };
const paletteRow: React.CSSProperties = { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" };
const actionRow: React.CSSProperties = { display: "flex", gap: 8, justifyContent: "center" };
const sheetBackdrop: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 7, display: "flex", alignItems: "flex-end", justifyContent: "center", background: C.scrim };
const patternSheet: React.CSSProperties = { width: "min(560px, 100%)", maxHeight: "80dvh", borderRadius: "24px 24px 0 0", padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const patternGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, overflowY: "auto" };
const patternTile: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px", borderRadius: 14, background: "rgba(34,30,78,0.55)", border: `1px solid ${C.line}`, cursor: "pointer" };
const patternSub: React.CSSProperties = { fontSize: 11, color: C.mute, fontWeight: 700 };
const doneWrap: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: C.scrim };
const doneCard: React.CSSProperties = { width: "min(380px, 100%)", maxHeight: "90dvh", overflowY: "auto", borderRadius: 24, padding: "22px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", position: "relative" };
const newRibbon: React.CSSProperties = { position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(180deg, ${C.goldHi}, ${C.gold})`, color: C.ink, fontWeight: 900, fontFamily: FONT.display, fontSize: 13, padding: "4px 14px", borderRadius: 999, boxShadow: "0 4px 10px rgba(0,0,0,0.35)" };
const factBox: React.CSSProperties = { fontWeight: 700, fontFamily: FONT.body, fontSize: 14, color: C.text, lineHeight: 1.35, padding: "2px 4px" };
const gallerySheet: React.CSSProperties = { width: "min(680px, 100%)", maxHeight: "82dvh", borderRadius: "24px 24px 0 0", padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const galleryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 10, overflowY: "auto" };
const galleryTile: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 8, borderRadius: 12, background: "rgba(34,30,78,0.55)", border: `1px solid ${C.line}` };
const galleryLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: C.dim, textAlign: "center" };

const CSS =
  "@keyframes wg-bob-kf { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }" +
  "@keyframes wg-twinkle-kf { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }" +
  "@keyframes wg-lampglow-kf { 0%,100% { opacity: 0.75; transform: translate(-50%,-50%) scale(1); } 50% { opacity: 1; transform: translate(-50%,-50%) scale(1.08); } }" +
  "@keyframes wg-shuttle-kf { 0% { left: -8%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { left: 102%; opacity: 0; } }" +
  ".wg-bob { animation: wg-bob-kf 2.6s ease-in-out infinite; }" +
  ".wg-twinkle { animation: wg-twinkle-kf 2.2s ease-in-out infinite; }" +
  ".wg-lampglow { animation: wg-lampglow-kf 2.8s ease-in-out infinite; }" +
  ".wg-shuttle { position: absolute; top: 50%; left: -8%; transform: translateY(-50%); animation: wg-shuttle-kf 650ms ease-in-out forwards; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4)); }" +
  ".wg-scroll::-webkit-scrollbar { height: 8px; } .wg-scroll::-webkit-scrollbar-thumb { background: rgba(160,190,255,0.25); border-radius: 8px; }" +
  "@media (prefers-reduced-motion: reduce) { .wg-bob, .wg-twinkle, .wg-lampglow, .wg-shuttle { animation: none !important; opacity: 1; } }";

export default WeaveGame;
