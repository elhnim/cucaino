"use client";

import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWidgetPrefs } from "@/lib/hooks/useWidgetPrefs";
import RequestActions from "@/components/parent/RequestActions";
import CompletionActions from "@/components/parent/CompletionActions";
import CashTransactionButton from "@/components/parent/CashTransactionButton";
import type { Kid, Task, RewardRequest, Reward, PendingCompletion } from "@/lib/domain/types";

export interface KidCardData {
  kid: Kid;
  done: number;
  total: number;
  allDone: boolean;
  themeAccent: string;
  themeAccentSoft: string;
  pendingRequest: RewardRequest | null;
  pendingReward: Reward | null;
  pendingCompletions: PendingCompletion[];
  agoMin: number;
}

export interface HeadsUpItem {
  kid: Pick<Kid, "id" | "name" | "avatar" | "themeId">;
  task: Task;
  themeAccent: string;
  themeAccentSoft: string;
}

export interface ParentHomeWidgetsProps {
  allKids: Kid[];
  kidCards: KidCardData[];
  headsUpBefore: HeadsUpItem[];
  headsUpAfter: HeadsUpItem[];
  todayLabel: string;
}

// Top-level widget IDs (excluding per-kid cards which have their own order)
// headsup is the only non-kid widget that can be hidden
const TOP_WIDGET_DEFAULTS = ["headsup"];
// Kid card IDs are generated dynamically

export default function ParentHomeWidgets(props: ParentHomeWidgetsProps) {
  const { allKids, kidCards, headsUpBefore, headsUpAfter, todayLabel } = props;
  const hasHeadsUp = headsUpBefore.length > 0 || headsUpAfter.length > 0;

  const kidIds = kidCards.map((c) => c.kid.id);
  const DEFAULT_KID_ORDER = kidIds;

  // Prefs for kid card order
  const { prefs: kidPrefs, editing, setEditing, reorder: reorderKids } = useWidgetPrefs(
    "parent-home:kids",
    DEFAULT_KID_ORDER,
  );

  // Prefs for top widgets (headsup visibility)
  const { prefs: topPrefs, toggleHidden: toggleTopHidden } = useWidgetPrefs(
    "parent-home:top",
    TOP_WIDGET_DEFAULTS,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const o = kidPrefs.order.indexOf(active.id as string);
    const n = kidPrefs.order.indexOf(over.id as string);
    if (o === -1 || n === -1) return;
    reorderKids(arrayMove(kidPrefs.order, o, n));
  }

  const orderedCards = kidPrefs.order
    .map((id) => kidCards.find((c) => c.kid.id === id))
    .filter((c): c is KidCardData => c !== undefined);

  const isHeadsUpHidden = topPrefs.hidden.includes("headsup");

  return (
    <>
      {/* TODAY'S HEADS-UP */}
      {hasHeadsUp && (!isHeadsUpHidden || editing) && (
        <div className={editing ? "relative" : ""}>
          <div className={`flex items-center justify-between mb-2.5 px-1 ${editing ? "pr-10" : ""}`}>
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Today&apos;s Heads-Up</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-400">{todayLabel}</span>
              {editing && (
                <button
                  type="button"
                  onClick={() => toggleTopHidden("headsup")}
                  className={`flex items-center justify-center w-7 h-7 rounded-lg text-sm ${isHeadsUpHidden ? "bg-gray-100 text-gray-400" : "bg-gray-100 text-gray-600"}`}
                  aria-label={isHeadsUpHidden ? "Show heads-up" : "Hide heads-up"}
                >
                  {isHeadsUpHidden ? "🚫" : "👁"}
                </button>
              )}
            </div>
          </div>
          <div
            className={`bg-white rounded-[20px] border-[1.5px] border-gray-200 overflow-hidden transition-opacity ${isHeadsUpHidden ? "opacity-40" : ""}`}
            style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            {headsUpBefore.length > 0 && (
              <div className="px-3.5 pt-3 pb-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-orange-500 mb-2">🌅 Before school</div>
                <div className="space-y-3">
                  {headsUpBefore.map(({ kid, task, themeAccent, themeAccentSoft }) => (
                    <HeadsUpRow key={`${kid.id}-${task.id}`} kid={kid} task={task} themeAccent={themeAccent} themeAccentSoft={themeAccentSoft} />
                  ))}
                </div>
              </div>
            )}
            {headsUpBefore.length > 0 && headsUpAfter.length > 0 && <div className="h-px bg-gray-100 mx-3.5" />}
            {headsUpAfter.length > 0 && (
              <div className="px-3.5 pt-2.5 pb-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-violet-500 mb-2">🎒 After school</div>
                <div className="space-y-3">
                  {headsUpAfter.map(({ kid, task, themeAccent, themeAccentSoft }) => (
                    <HeadsUpRow key={`${kid.id}-${task.id}`} kid={kid} task={task} themeAccent={themeAccent} themeAccentSoft={themeAccentSoft} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KID CARDS */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Today</span>
          <span className="text-[11px] font-semibold text-gray-400">{todayLabel}</span>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={kidPrefs.order} strategy={verticalListSortingStrategy}>
            <div className="space-y-2.5">
              {orderedCards.map((cardData) => (
                <SortableKidCard
                  key={cardData.kid.id}
                  cardData={cardData}
                  allKids={allKids}
                  editing={editing}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Edit / Done button */}
      {editing ? (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="w-full py-2.5 rounded-2xl text-sm font-bold bg-indigo-600 text-white shadow-sm"
        >
          ✓ Done
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full py-2 rounded-2xl text-xs font-bold text-gray-400 bg-white/60"
        >
          ✏️ Edit layout{isHeadsUpHidden ? " · 1 hidden" : ""}
        </button>
      )}
    </>
  );
}

// ─── Sortable kid card wrapper ────────────────────────────────────────────────

function SortableKidCard({ cardData, allKids, editing }: { cardData: KidCardData; allKids: Kid[]; editing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardData.kid.id,
    disabled: !editing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {editing ? (
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            className="flex items-center justify-center w-9 rounded-2xl bg-gray-100 text-gray-400 text-lg cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            aria-label={`Drag to reorder ${cardData.kid.name}`}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <div className="flex-1 min-w-0">
            <KidCard cardData={cardData} allKids={allKids} />
          </div>
        </div>
      ) : (
        <KidCard cardData={cardData} allKids={allKids} />
      )}
    </div>
  );
}

// ─── Kid card ────────────────────────────────────────────────────────────────

function KidCard({ cardData, allKids }: { cardData: KidCardData; allKids: Kid[] }) {
  const { kid, done, total, allDone, themeAccent, themeAccentSoft, pendingRequest, pendingReward, pendingCompletions, agoMin } = cardData;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="bg-white rounded-[20px] p-3.5"
      style={{ border: `1.5px solid ${themeAccentSoft}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      {/* Top row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-[22px] flex-shrink-0" style={{ background: themeAccentSoft }}>
          {kid.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-gray-900 leading-tight" style={{ fontSize: 15 }}>{kid.name}</div>
          <div className="text-gray-400 font-medium" style={{ fontSize: 11 }}>Age {kid.age}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "#fef3c7", color: "#92400e" }}>
            {kid.pointsBalance} ⭐
          </span>
          {kid.cashBalance > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-black" style={{ background: "#dcfce7", color: "#15803d" }}>
              💵 ${(kid.cashBalance / 100).toFixed(2)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "#fff7ed", color: "#9a3412" }}>
            🔥 {kid.currentStreak}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2.5">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: themeAccent }} />
        </div>
        <span className="text-xs font-bold flex-shrink-0" style={{ color: allDone ? "#16a34a" : themeAccent }}>
          {done} / {total}
        </span>
      </div>

      {allDone ? (
        <div className="mt-2 bg-green-50 rounded-xl px-3 py-1.5 text-xs font-bold text-green-700">🎉 All tasks done!</div>
      ) : total > 0 && (
        <div className="mt-1.5 text-[11px] text-gray-400 font-semibold">{total - done} task{total - done !== 1 ? "s" : ""} remaining</div>
      )}

      {/* Pending reward request */}
      {pendingRequest && pendingReward && (
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${themeAccentSoft}` }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-lg">{pendingReward.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-900 truncate">Wants {pendingReward.name}</div>
              <div className="text-[11px] text-gray-400">
                Costs {pendingReward.costPoints} ⭐ ·{" "}
                <span className="text-green-600 font-semibold">Has {kid.pointsBalance} ⭐</span>{" "}
                · {agoMin < 1 ? "just now" : `${agoMin} min ago`}
              </div>
            </div>
          </div>
          <RequestActions requestId={pendingRequest.id} />
        </div>
      )}

      {/* Pending task completions */}
      {pendingCompletions.map((comp) => {
        const ago = Math.round((Date.now() - new Date(comp.completedAt).getTime()) / 60_000);
        return (
          <div key={comp.id} className="mt-3 rounded-xl p-3" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-2xl">{comp.taskIcon}</div>
              <div className="flex-1">
                <div className="text-sm font-bold">{comp.taskName}</div>
                <div className="text-xs text-gray-500">
                  {ago < 2 ? "just now" : `${ago} min ago`}
                  {comp.pointsAwarded > 0 ? ` · +${comp.pointsAwarded} ⭐` : ""}
                  {comp.cashAwardedCents > 0 ? ` · +$${(comp.cashAwardedCents / 100).toFixed(2)}` : ""}
                </div>
              </div>
            </div>
            <CompletionActions completionId={comp.id} />
          </div>
        );
      })}

      {/* Footer links */}
      <div className="mt-3 pt-3 flex items-center" style={{ borderTop: `1px solid ${themeAccentSoft}` }}>
        <Link href={`/parent/history/${kid.id}`} className="text-[12px] font-bold" style={{ color: themeAccent }}>
          View history →
        </Link>
        <Link href={`/parent/history/${kid.id}?tab=cash`} className="text-[12px] font-bold ml-4" style={{ color: themeAccent }}>
          Cash history →
        </Link>
        <CashTransactionButton kids={allKids} defaultKidId={kid.id} />
      </div>
    </div>
  );
}

// ─── Heads-up row ─────────────────────────────────────────────────────────────

function HeadsUpRow({ kid, task, themeAccent, themeAccentSoft }: {
  kid: Pick<Kid, "id" | "name" | "avatar">;
  task: Task;
  themeAccent: string;
  themeAccentSoft: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5" style={{ background: themeAccentSoft }}>
        {kid.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-gray-900">{kid.name} — {task.name}</div>
        {(task.location || task.startTime) && (
          <div className="text-[11px] text-gray-400 mt-0.5">
            {task.location && `📍 ${task.location}`}
            {task.location && task.startTime && " · "}
            {task.startTime && task.startTime}
          </div>
        )}
        {task.packingList && task.packingList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {task.packingList.map((item, i) => (
              <span key={i} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: themeAccentSoft, color: themeAccent }}>
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
