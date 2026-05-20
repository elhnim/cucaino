"use client";

import Link from "next/link";
import { useState } from "react";
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
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWidgetPrefs } from "@/lib/hooks/useWidgetPrefs";
import RequestActions from "@/components/parent/RequestActions";
import CompletionActions from "@/components/parent/CompletionActions";
import CashTransactionButton from "@/components/parent/CashTransactionButton";
import IssueStrikeModal from "@/components/parent/IssueStrikeModal";
import KidStrikesSheet from "@/components/parent/KidStrikesSheet";
import type { Kid, Task, RewardRequest, Reward, PendingCompletion, Strike } from "@/lib/domain/types";

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
  activeStrikes: Strike[];
  allStrikes: Strike[];
  moodCounts: Record<string, number>;
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
  headsUpTomorrowBefore: HeadsUpItem[];
  headsUpTomorrowAfter: HeadsUpItem[];
  todayLabel: string;
  tomorrowLabel: string;
}

const TOP_WIDGET_DEFAULTS = ["headsup"];
// Kid cards default to full-width; user can compress to half for a 2-up grid
const KID_DEFAULT_WIDTHS: Record<string, "full" | "half"> = {}; // populated dynamically per kid

export default function ParentHomeWidgets(props: ParentHomeWidgetsProps) {
  const { allKids, kidCards, headsUpBefore, headsUpAfter, headsUpTomorrowBefore, headsUpTomorrowAfter, todayLabel, tomorrowLabel } = props;
  const [strikeTarget, setStrikeTarget] = useState<Kid | null>(null);
  const [viewStrikesFor, setViewStrikesFor] = useState<Kid | null>(null);
  const [prepDay, setPrepDay] = useState<"today" | "tomorrow">("today");
  const hasHeadsUp = headsUpBefore.length > 0 || headsUpAfter.length > 0 || headsUpTomorrowBefore.length > 0 || headsUpTomorrowAfter.length > 0;
  const activeBefore = prepDay === "today" ? headsUpBefore : headsUpTomorrowBefore;
  const activeAfter = prepDay === "today" ? headsUpAfter : headsUpTomorrowAfter;
  const activeLabel = prepDay === "today" ? todayLabel : tomorrowLabel;

  const kidIds = kidCards.map((c) => c.kid.id);
  // All kids default to full-width
  const defaultKidWidths = Object.fromEntries(kidIds.map((id) => [id, "full" as const]));

  // Prefs for kid card order + widths
  const { prefs: kidPrefs, editing, setEditing, reorder: reorderKids, toggleWidth: toggleKidWidth } = useWidgetPrefs(
    "parent-home:kids",
    kidIds,
    defaultKidWidths,
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
      {/* ACTIVITY PREP WIDGET */}
      {(!isHeadsUpHidden || editing) && (
        <div className={editing ? "relative" : ""}>
          <div className={`flex items-center justify-between mb-2.5 px-1 ${editing ? "pr-10" : ""}`}>
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Activity Prep</span>
            <div className="flex items-center gap-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => toggleTopHidden("headsup")}
                  className={`flex items-center justify-center w-7 h-7 rounded-lg text-sm ${isHeadsUpHidden ? "bg-gray-100 text-gray-400" : "bg-gray-100 text-gray-600"}`}
                  aria-label={isHeadsUpHidden ? "Show widget" : "Hide widget"}
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
            {/* Day toggle */}
            <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5 border-b border-gray-100">
              <div className="flex gap-1 flex-1">
                {(["today", "tomorrow"] as const).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setPrepDay(day)}
                    className={`px-3 py-1 rounded-full text-[12px] font-black transition-colors ${
                      prepDay === day
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {day === "today" ? "Today" : "Tomorrow"}
                  </button>
                ))}
              </div>
              <span className="text-[11px] font-semibold text-gray-400">{activeLabel}</span>
            </div>

            {activeBefore.length === 0 && activeAfter.length === 0 ? (
              <div className="px-3.5 py-5 text-center">
                <div className="text-2xl mb-1">✅</div>
                <div className="text-[12px] font-bold text-gray-400">No activities {prepDay}</div>
              </div>
            ) : (
              <>
                {activeBefore.length > 0 && (
                  <div className="px-3.5 pt-3 pb-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-orange-500 mb-2">🌅 Before school</div>
                    <div className="space-y-3">
                      {activeBefore.map(({ kid, task, themeAccent, themeAccentSoft }) => (
                        <HeadsUpRow key={`${kid.id}-${task.id}`} kid={kid} task={task} themeAccent={themeAccent} themeAccentSoft={themeAccentSoft} />
                      ))}
                    </div>
                  </div>
                )}
                {activeBefore.length > 0 && activeAfter.length > 0 && <div className="h-px bg-gray-100 mx-3.5" />}
                {activeAfter.length > 0 && (
                  <div className="px-3.5 pt-2.5 pb-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-violet-500 mb-2">🎒 After school / Evening</div>
                    <div className="space-y-3">
                      {activeAfter.map(({ kid, task, themeAccent, themeAccentSoft }) => (
                        <HeadsUpRow key={`${kid.id}-${task.id}`} kid={kid} task={task} themeAccent={themeAccent} themeAccentSoft={themeAccentSoft} />
                      ))}
                    </div>
                  </div>
                )}
              </>
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
          <SortableContext items={kidPrefs.order} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-2.5">
              {orderedCards.map((cardData) => {
                const isHalf = (kidPrefs.widths[cardData.kid.id] ?? "full") === "half";
                return (
                  <SortableKidCard
                    key={cardData.kid.id}
                    cardData={cardData}
                    allKids={allKids}
                    editing={editing}
                    colSpan={isHalf ? 1 : 2}
                    onToggleWidth={() => toggleKidWidth(cardData.kid.id)}
                    onIssueStrike={() => setStrikeTarget(cardData.kid)}
                    onViewStrikes={() => setViewStrikesFor(cardData.kid)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {strikeTarget && (
        <IssueStrikeModal kid={strikeTarget} onClose={() => setStrikeTarget(null)} />
      )}
      {viewStrikesFor && (() => {
        const card = kidCards.find((c) => c.kid.id === viewStrikesFor.id);
        return card ? (
          <KidStrikesSheet
            kid={viewStrikesFor}
            strikes={card.allStrikes}
            onClose={() => setViewStrikesFor(null)}
          />
        ) : null;
      })()}

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

function SortableKidCard({ cardData, allKids, editing, colSpan, onToggleWidth, onIssueStrike, onViewStrikes }: {
  cardData: KidCardData;
  allKids: Kid[];
  editing: boolean;
  colSpan: 1 | 2;
  onToggleWidth: () => void;
  onIssueStrike: () => void;
  onViewStrikes: () => void;
}) {
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

  const colClass = colSpan === 1 ? "col-span-1" : "col-span-2";

  return (
    <div ref={setNodeRef} style={style} className={colClass}>
      {editing ? (
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            className="flex items-center justify-center w-8 rounded-xl bg-gray-100 text-gray-400 text-lg cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            aria-label={`Drag to reorder ${cardData.kid.name}`}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <div className="flex-1 min-w-0">
            <KidCard cardData={cardData} allKids={allKids} compact={colSpan === 1} onIssueStrike={onIssueStrike} onViewStrikes={onViewStrikes} />
          </div>
          <button
            type="button"
            onClick={onToggleWidth}
            className="flex items-center justify-center w-8 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black flex-shrink-0"
            aria-label={colSpan === 2 ? "Make half-width" : "Make full-width"}
          >
            {colSpan === 2 ? "½" : "↔"}
          </button>
        </div>
      ) : (
        <KidCard cardData={cardData} allKids={allKids} compact={colSpan === 1} onIssueStrike={onIssueStrike} onViewStrikes={onViewStrikes} />
      )}
    </div>
  );
}

// ─── Kid card ────────────────────────────────────────────────────────────────

function KidCard({ cardData, allKids, compact = false, onIssueStrike, onViewStrikes }: {
  cardData: KidCardData;
  allKids: Kid[];
  compact?: boolean;
  onIssueStrike: () => void;
  onViewStrikes: () => void;
}) {
  const { kid, done, total, allDone, themeAccent, themeAccentSoft, pendingRequest, pendingReward, pendingCompletions, agoMin, activeStrikes, moodCounts } = cardData;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasPending = (pendingRequest && pendingReward) || pendingCompletions.length > 0;

  return (
    <div
      className="bg-white rounded-[20px] p-3"
      style={{ border: `1.5px solid ${themeAccentSoft}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      {/* Top row */}
      <div className={`flex items-center gap-2 mb-2.5 ${compact ? "flex-wrap" : ""}`}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: themeAccentSoft }}>
          {kid.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-gray-900 leading-tight truncate" style={{ fontSize: 14 }}>{kid.name}</div>
          {!compact && <div className="text-gray-400 font-medium" style={{ fontSize: 11 }}>Age {kid.age}</div>}
        </div>
        <div className={`flex items-center gap-1.5 flex-shrink-0 ${compact ? "flex-wrap justify-end" : ""}`}>
          <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#fef3c7", color: "#92400e" }}>
            {kid.pointsBalance} ⭐
          </span>
          {kid.cashBalance > 0 && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-black" style={{ background: "#dcfce7", color: "#15803d" }}>
              💵 ${(kid.cashBalance / 100).toFixed(2)}
            </span>
          )}
          {!compact && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#fff7ed", color: "#9a3412" }}>
              🔥 {kid.currentStreak}
            </span>
          )}
          {!compact && (() => {
            const entries = Object.entries(moodCounts);
            if (entries.length === 0) return null;
            const [topMood, topCount] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
            return (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: "#fef3c7", color: "#92400e" }}
              >
                {topMood} ×{topCount}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: themeAccent }} />
        </div>
        <span className="text-[11px] font-bold flex-shrink-0" style={{ color: allDone ? "#16a34a" : themeAccent }}>
          {done}/{total}
        </span>
      </div>

      {allDone ? (
        <div className="mt-1.5 bg-green-50 rounded-lg px-2 py-1 text-[11px] font-bold text-green-700">🎉 All done!</div>
      ) : total > 0 && (
        <div className="mt-1 text-[11px] text-gray-400 font-semibold">{total - done} remaining</div>
      )}

      {/* Pending items — hidden in compact mode if no room */}
      {!compact && pendingRequest && pendingReward && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: `1px solid ${themeAccentSoft}` }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{pendingReward.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-gray-900 truncate">Wants {pendingReward.name}</div>
              <div className="text-[10px] text-gray-400">
                {pendingReward.costPoints} ⭐ · Has {kid.pointsBalance} ⭐ · {agoMin < 1 ? "just now" : `${agoMin}m ago`}
              </div>
            </div>
          </div>
          <RequestActions requestId={pendingRequest.id} />
        </div>
      )}

      {!compact && pendingCompletions.map((comp) => {
        const ago = Math.round((Date.now() - new Date(comp.completedAt).getTime()) / 60_000);
        return (
          <div key={comp.id} className="mt-2.5 rounded-xl p-2.5" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="text-xl">{comp.taskIcon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold truncate">{comp.taskName}</div>
                <div className="text-[10px] text-gray-500">
                  {ago < 2 ? "just now" : `${ago}m ago`}
                  {comp.pointsAwarded > 0 ? ` · +${comp.pointsAwarded} ⭐` : ""}
                  {comp.cashAwardedCents > 0 ? ` · +$${(comp.cashAwardedCents / 100).toFixed(2)}` : ""}
                </div>
              </div>
            </div>
            <CompletionActions completionId={comp.id} />
          </div>
        );
      })}

      {/* Compact pending badge */}
      {compact && hasPending && (
        <div className="mt-1.5 text-[11px] font-bold text-amber-600">
          ⏳ {(pendingRequest ? 1 : 0) + pendingCompletions.length} pending
        </div>
      )}

      {/* Footer */}
      <div className="mt-2.5 pt-2.5 flex items-center flex-wrap gap-2" style={{ borderTop: `1px solid ${themeAccentSoft}` }}>
        <Link href={`/parent/history/${kid.id}`} className="text-[11px] font-bold" style={{ color: themeAccent }}>
          History →
        </Link>
        <CashTransactionButton kids={allKids} defaultKidId={kid.id} />
        <div className="ml-auto flex items-center gap-1.5">
          {activeStrikes.length > 0 && (
            <button
              type="button"
              onClick={onViewStrikes}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-600 border border-red-200"
            >
              ⚡ {activeStrikes.length} active
            </button>
          )}
          <button
            type="button"
            onClick={onIssueStrike}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-black bg-red-500 text-white shadow-sm active:scale-95 transition-transform"
          >
            ⚡ Strike
          </button>
        </div>
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
