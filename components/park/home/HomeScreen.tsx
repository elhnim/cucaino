"use client";

// My Home overlay: everything 2D while the kid is inside their cottage (a park ride — see
// lib/park/home/scene.ts). Walk mode shows a small HUD (Decorate / Pet / Back to the park);
// decorate mode shows the HomeEditor bar. Every change is previewed in 3D straight away and
// saved through lib/actions/home.ts (which re-checks all the rules); a failed save puts the room
// back. Pet care reuses the park's PetCareSheet + lib/actions/pet.ts unchanged, with the home's
// own 3D reactions (the pet trots to its bowl, naps in its bed ...).
import dynamic from "next/dynamic";
import { HomeSpeech } from "./HomeSpeech";
import { useCallback, useEffect, useRef, useState } from "react";
import { buyHomeItem, saveHome, type HomeData } from "@/lib/actions/home";
import { getHomeItem, isStyle } from "@/lib/park/home/catalog";
import {
  PLACE_MESSAGES,
  available,
  canBuyMore,
  canPlace,
  isItemUnlocked,
  itemUnlockHint,
  newUid,
  ownsStyle,
  placedCount,
  placedTransform,
  snapFloor,
  type HomeLayout,
  type HomePlaced,
  type RoomId,
} from "@/lib/park/home/rules";
import type { HomeEvent, HomeRide } from "@/lib/park/home/scene";
import type { Pet } from "@/lib/pet/logic";
import { playSfx } from "@/lib/audio/sound-manager";
import { HomeEditor, type EditorSelection } from "./HomeEditor";
import type { PetMode } from "../pet/PetCareSheet";
import { CandySheet } from "../ui/CandySheet";
import { GameButton } from "../ui/GameButton";
import { C, PARK_CSS, display, glass } from "../ui/theme";

const PetCareSheet = dynamic(() => import("../pet/PetCareSheet").then((m) => m.PetCareSheet), { ssr: false });

const PET_CHOICES: { mode: PetMode; emoji: string; label: string; note: string }[] = [
  { mode: "feed", emoji: "🍎", label: "Snack time", note: "At the food bowl" },
  { mode: "wash", emoji: "🫧", label: "Bath & cuddle", note: "Squeaky clean" },
  { mode: "sleep", emoji: "🌙", label: "Nap time", note: "In the pet bed" },
  { mode: "tricks", emoji: "🌟", label: "Tricks", note: "Show time!" },
  { mode: "home", emoji: "📋", label: "How's my pet?", note: "Stats & gifts" },
];

export function HomeScreen({
  kidId,
  ride,
  initial,
  pet,
  points,
  onPet,
  onTickets,
  onExit,
}: {
  kidId: string;
  /** what buildHomeInterior returned (already entered with ParkWorld.enterRide) */
  ride: HomeRide;
  initial: HomeData;
  pet: Pet | null;
  /** star balance (pet care costs stars) */
  points: number;
  onPet: (pet: Pet, points: number) => void;
  /** ticket balance changed (keep the park HUD in sync) */
  onTickets?: (tickets: number) => void;
  /** walk out of the front door */
  onExit: () => void;
}) {
  const [data, setData] = useState<HomeData>(initial);
  const [editing, setEditing] = useState(false);
  const [room, setRoom] = useState<RoomId>(ride.viewedRoom);
  const [sel, setSel] = useState<EditorSelection>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [petMenu, setPetMenu] = useState(false);
  const [petMode, setPetMode] = useState<PetMode | null>(null);
  const msgTimer = useRef<number | undefined>(undefined);
  const live = useRef({ editing, sel, data, pet });
  live.current = { editing, sel, data, pet };

  const flash = useCallback((text: string, ms = 2800) => {
    setMsg(text);
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(msgTimer.current), []);

  // the pet in 3D follows the real pet state (asleep -> into its bed)
  useEffect(() => {
    ride.setPet(pet ? { hunger: pet.hunger, happiness: pet.happiness, energy: pet.energy, cleanliness: pet.cleanliness, isSleeping: pet.isSleeping } : null, pet?.name);
  }, [pet, ride]);

  useEffect(() => {
    flash(pet ? `🏡 Welcome home! ${pet.name} is so happy to see you` : "🏡 Welcome home! Tap the floor to walk about", 3200);
  }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps

  // events from the 3D room
  useEffect(
    () =>
      ride.subscribe((e: HomeEvent) => {
        const { editing: ed, sel: s, pet: p } = live.current;
        switch (e.type) {
          case "ghost":
            setSel((cur) => (cur?.kind === "ghost" ? { ...cur, ok: e.ok, reason: e.reason ? PLACE_MESSAGES[e.reason] : undefined } : cur));
            break;
          case "tap-item":
            if (ed && (!s || s.kind === "placed")) {
              ride.select(e.uid);
              setSel({ kind: "placed", uid: e.uid, itemId: e.item });
              playSfx("tap");
            }
            break;
          case "tap-empty":
            if (s?.kind === "placed") {
              ride.select(null);
              setSel(null);
            }
            break;
          case "tap-pet":
            if (p) ride.petFx.status({ hunger: p.hunger, happiness: p.happiness, energy: p.energy, cleanliness: p.cleanliness });
            setPetMenu(true);
            playSfx("tap");
            break;
          case "exit":
            onExit();
            break;
          case "pet-happy":
            flash(e.line);
            playSfx("sparkle");
            break;
          case "no-bed":
            flash(`🧺 Put a Pet Bed down so ${p?.name ?? "your pet"} can sleep all cosy!`, 3600);
            break;
          case "room":
            break;
        }
      }),
    [ride, onExit, flash],
  );

  /** show + save a layout; a failed save puts the room back */
  const commit = async (next: HomeLayout): Promise<boolean> => {
    const prev = live.current.data.layout;
    setData((d) => ({ ...d, layout: next }));
    ride.setLayout(next);
    setBusy(true);
    const res = await saveHome(kidId, next);
    setBusy(false);
    if (!res.ok) {
      flash(res.error);
      playSfx("wrong");
      setData((d) => ({ ...d, layout: prev }));
      ride.setLayout(prev);
      return false;
    }
    return true;
  };

  const beginGhost = (itemId: string, uid?: string) => {
    const spec = ride.startGhost(itemId, { uid });
    if (!spec) {
      flash("No space left for that — try the other room, or put something away 📦");
      return;
    }
    const g = ride.ghost();
    setSel({ kind: "ghost", itemId, moving: !!uid, ok: g?.ok ?? false });
    playSfx("tap");
  };

  const pick = (itemId: string) => {
    const def = getHomeItem(itemId);
    if (!def || busy) return;
    if (!isItemUnlocked(def, data.level, data.streak)) {
      flash(`🔒 ${itemUnlockHint(def)} — keep doing your quests!`);
      return;
    }
    cancel();
    if (isStyle(def)) {
      const key = def.surface === "wallpaper" ? "wall" : "floor";
      ride.previewStyle(room, { [key]: def.id });
      setSel({ kind: "style", itemId });
      if (ownsStyle(def, data.owned) && data.layout.rooms[room][key] !== def.id) {
        void commit({ ...data.layout, rooms: { ...data.layout.rooms, [room]: { ...data.layout.rooms[room], [key]: def.id } } });
        playSfx("sparkle");
      }
      return;
    }
    if (placedCount(data.layout.placed, itemId) < available(def, data.owned)) beginGhost(itemId);
    else if (canBuyMore(def, data.owned)) setSel({ kind: "buy", itemId });
    else flash(`All your ${def.name}s are out — tap one to move it 👆`);
  };

  const buy = async () => {
    if (!sel || (sel.kind !== "buy" && sel.kind !== "style") || busy) return;
    const def = getHomeItem(sel.itemId);
    if (!def) return;
    setBusy(true);
    const res = await buyHomeItem(kidId, def.id);
    setBusy(false);
    if (!res.ok) {
      flash(res.error);
      playSfx("wrong");
      if (res.tickets !== undefined) setData((d) => ({ ...d, tickets: res.tickets! }));
      return;
    }
    playSfx("coin");
    const owned = res.owned;
    setData((d) => ({ ...d, tickets: res.tickets, owned }));
    live.current.data = { ...live.current.data, tickets: res.tickets, owned };
    onTickets?.(res.tickets);
    if (isStyle(def)) {
      const key = def.surface === "wallpaper" ? "wall" : "floor";
      const layout = live.current.data.layout;
      await commit({ ...layout, rooms: { ...layout.rooms, [room]: { ...layout.rooms[room], [key]: def.id } } });
      flash(`🎨 ${def.name}! Your room looks amazing`);
      setSel({ kind: "style", itemId: def.id });
    } else {
      flash(`🛍️ You got the ${def.name}! Now find it a spot`);
      beginGhost(def.id);
    }
  };

  const place = async () => {
    const g = ride.ghost();
    if (!g || !g.ok || busy) return;
    const layout = live.current.data.layout;
    const s = g.spec;
    const p: HomePlaced = s.wall ? { uid: g.uid ?? newUid(), item: s.item, room: s.room, gx: s.gx, gz: 0, r: 0, wall: s.wall } : { uid: g.uid ?? newUid(), item: s.item, room: s.room, gx: s.gx, gz: s.gz, r: s.r };
    const placed = g.uid ? layout.placed.map((q) => (q.uid === g.uid ? p : q)) : [...layout.placed, p];
    ride.endGhost();
    setSel(null);
    if (await commit({ ...layout, placed })) playSfx("sparkle");
  };

  const turn = async () => {
    if (sel?.kind === "ghost") {
      ride.turnGhost();
      const g = ride.ghost();
      if (g) setSel({ ...sel, ok: g.ok });
      return;
    }
    if (sel?.kind !== "placed" || busy) return;
    const layout = live.current.data.layout;
    const cur = layout.placed.find((q) => q.uid === sel.uid);
    if (!cur || cur.wall) return;
    const t = placedTransform(cur);
    const r = (cur.r + 1) % 4;
    const s = snapFloor(cur.item, t.x, t.z, r, cur.room);
    const check = canPlace(layout.placed, { item: cur.item, room: s.room, gx: s.gx, gz: s.gz, r }, cur.uid);
    if (!check.ok) {
      flash(`Can't turn it here — ${PLACE_MESSAGES[check.reason].toLowerCase()} Try moving it first`);
      return;
    }
    await commit({ ...layout, placed: layout.placed.map((q) => (q.uid === cur.uid ? { ...q, gx: s.gx, gz: s.gz, r } : q)) });
    playSfx("tap");
  };

  const store = async () => {
    if (sel?.kind !== "placed" || busy) return;
    const layout = live.current.data.layout;
    const def = getHomeItem(sel.itemId);
    ride.select(null);
    setSel(null);
    if (await commit({ ...layout, placed: layout.placed.filter((q) => q.uid !== sel.uid) })) {
      flash(`📦 ${def?.name ?? "It"} is put away — pick it from the catalogue any time`);
      playSfx("tap");
    }
  };

  const move = () => {
    if (sel?.kind !== "placed") return;
    ride.select(null);
    beginGhost(sel.itemId, sel.uid);
  };

  function cancel() {
    const s = live.current.sel;
    if (s?.kind === "ghost") ride.endGhost();
    if (s?.kind === "style") ride.previewStyle(room, null);
    if (s?.kind === "placed") ride.select(null);
    setSel(null);
  }

  const switchRoom = (r: RoomId) => {
    cancel();
    setRoom(r);
    ride.viewRoom(r);
    playSfx("tap");
  };

  const startEditing = () => {
    ride.setEditing(true);
    setRoom(ride.viewedRoom);
    setEditing(true);
    setSel(null);
    flash("🎨 Pick something below, then drag it where you like!");
    playSfx("tap");
  };
  const stopEditing = () => {
    cancel();
    ride.setEditing(false);
    setEditing(false);
    playSfx("tap");
  };

  const openPet = () => {
    if (!pet) {
      setPetMode("home"); // no pet yet: the sheet shows adoption
      return;
    }
    ride.petFx.status({ hunger: pet.hunger, happiness: pet.happiness, energy: pet.energy, cleanliness: pet.cleanliness });
    setPetMenu(true);
  };

  return (
    <>
      <style>{PARK_CSS}</style>
      <HomeSpeech ride={ride} />
      {editing ? (
        <HomeEditor
          tickets={data.tickets}
          level={data.level}
          streak={data.streak}
          owned={data.owned}
          layout={data.layout}
          room={room}
          selection={sel}
          busy={busy}
          message={msg}
          petName={pet?.name}
          onRoom={switchRoom}
          onPick={pick}
          onTurn={turn}
          onPlace={place}
          onCancel={cancel}
          onMove={move}
          onStore={store}
          onBuy={buy}
          onDone={stopEditing}
          onPet={openPet}
        />
      ) : (
        <>
          <div style={walkTop}>
            <div style={chip}>
              <span style={display(19)}>🏡 My Home</span>
            </div>
            <div style={chip}>
              <span style={{ fontSize: 17 }}>🎟️</span> <b style={display(20)}>{data.tickets}</b>
            </div>
          </div>
          {msg && <div style={toast}>{msg}</div>}
          <div style={walkDock}>
            <GameButton variant="primary" onClick={startEditing}>
              🎨 Decorate
            </GameButton>
            <GameButton variant="secondary" tint="#ff8a3d" onClick={openPet}>
              🐾 {pet?.name ?? "Pet"}
            </GameButton>
            <GameButton variant="secondary" onClick={onExit}>
              🚪 Park
            </GameButton>
          </div>
        </>
      )}

      {petMenu && pet && (
        <CandySheet title={`🐾 ${pet.name}`} subtitle="What shall we do together?" color="#ff8a3d" onClose={() => setPetMenu(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 10 }}>
            {PET_CHOICES.map((c) => (
              <button
                key={c.mode}
                type="button"
                className="gp-press"
                style={petTile}
                onClick={() => {
                  setPetMenu(false);
                  setPetMode(c.mode);
                }}
              >
                <div style={{ fontSize: 36, lineHeight: 1 }}>{c.mode === "sleep" && pet.isSleeping ? "☀️" : c.emoji}</div>
                <div style={{ fontWeight: 900, fontSize: 14, color: C.text, marginTop: 6 }}>{c.mode === "sleep" && pet.isSleeping ? "Wake up" : c.label}</div>
                <div style={{ fontWeight: 800, fontSize: 11.5, color: C.dim }}>{c.note}</div>
              </button>
            ))}
          </div>
        </CandySheet>
      )}
      {petMode && (
        <PetCareSheet
          kidId={kidId}
          pet={pet}
          mode={petMode}
          points={points}
          onPet={onPet}
          onStartFetch={() => flash("🎾 Fetch needs lots of space — play it in the Pet Meadow!")}
          onClose={() => setPetMode(null)}
          fx={ride.petFx}
        />
      )}
    </>
  );
}

const walkTop: React.CSSProperties = {
  position: "fixed",
  top: "max(12px, env(safe-area-inset-top))",
  left: 12,
  right: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  zIndex: 25,
  pointerEvents: "none",
};
const chip: React.CSSProperties = {
  ...glass({ edge: "cyan", fill: "rgba(14,12,38,0.8)" }),
  display: "flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 14,
  padding: "8px 14px",
  fontWeight: 900,
};
const toast: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(12px, env(safe-area-inset-top)) + 58px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 25,
  ...glass({ edge: "gold", fill: "rgba(18,16,44,0.9)" }),
  borderRadius: 14,
  padding: "8px 16px",
  fontWeight: 900,
  pointerEvents: "none",
  maxWidth: "88vw",
  textAlign: "center",
};
const walkDock: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: "max(16px, env(safe-area-inset-bottom))",
  display: "flex",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 10,
  zIndex: 25,
  padding: "0 12px",
};
const petTile: React.CSSProperties = {
  border: "1.5px solid rgba(160,190,255,0.22)",
  borderRadius: 16,
  padding: "14px 6px",
  minHeight: 110,
  background: "radial-gradient(circle at 50% 25%, rgba(90,86,170,0.5), rgba(24,22,60,0.85) 75%)",
  boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
  cursor: "pointer",
  textAlign: "center",
  color: C.text,
};
