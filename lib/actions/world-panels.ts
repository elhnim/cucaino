"use server";

/**
 * Thin read-only data loaders for the in-world Schedule/Store/Friends/Play-Hall panels
 * (components/game/panels/*). Each just wraps the same lib/data/queries.ts functions the
 * flat /todo, /rewards, /friends, /play/quiz pages already use — no new data logic, so the
 * panels and the flat pages always agree. Mutations still go through the existing server
 * actions the reused components (TodoTaskCard, RewardClaimButton, FriendsPage, QuizGame)
 * already call directly.
 */
import {
  getKid,
  getFamily,
  listTasksForKid,
  listCompletionsToday,
  listKidDailyAdditions,
  countCompletionsThisWeek,
  listRewardsForKid,
  listActiveStrikes,
  listConversationSummaries,
  listPendingFriendRequests,
  listFriends,
  listMessages,
  listKids,
  listQuizSets,
  listQuizBanks,
  getQuizSet,
  getQuizBank,
  listQuizQuestions2,
  listQuizQuestions,
  localDateString,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import type { Task, TaskCompletion, Reward, ConversationSummary, FriendRequest, Message, QuizSet, QuizBank, ThemeId } from "@/lib/domain/types";

export interface TodoPanelData {
  todayTasks: Task[];
  completions: TaskCompletion[];
  selfAddableTasks: Task[];
  activeDateStr: string;
  weeklyGoals: { id: string; name: string; icon: string; min: number; count: number; addedToday: boolean }[];
}

export async function getTodoPanelData(kidId: string): Promise<TodoPanelData | null> {
  const kid = await getKid(kidId);
  if (!kid) return null;
  const family = await getFamily();
  const tz = family?.timezone ?? "Australia/Sydney";
  const today = isoWeekday(new Date(), tz);
  const activeDateStr = localDateString(tz);

  const [tasks, completions, addedTasks, weekCounts] = await Promise.all([
    listTasksForKid(kidId),
    listCompletionsToday(kidId, tz),
    listKidDailyAdditions(kidId, activeDateStr),
    countCompletionsThisWeek(kidId, tz),
  ]);

  const scheduledTasks = tasksForDay(tasks.filter((t) => t.rule !== "flexible"), today);
  const todayTasks = [...scheduledTasks, ...addedTasks].filter((t) => t.requiresCompletion);
  const selfAddableTasks = tasks.filter((t) => t.rule === "flexible");
  const addedSet = new Set(addedTasks.map((t) => t.id));

  const weeklyGoals = tasks
    .filter((t) => t.rule === "flexible" && (t.flexibleMinPerWeek ?? 0) > 0)
    .map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      min: t.flexibleMinPerWeek as number,
      count: weekCounts[t.id] ?? 0,
      addedToday: addedSet.has(t.id),
    }));

  return { todayTasks, completions, selfAddableTasks, activeDateStr, weeklyGoals };
}

export interface RewardsPanelData {
  rewards: Reward[];
  pointsBalance: number;
  cashBalance: number;
  activeStrikeCount: number;
}

export async function getRewardsPanelData(kidId: string): Promise<RewardsPanelData | null> {
  const kid = await getKid(kidId);
  if (!kid) return null;
  const [rewards, strikes] = await Promise.all([listRewardsForKid(kidId), listActiveStrikes(kidId)]);
  return {
    rewards: rewards.filter((r) => r.active && r.who !== "team"),
    pointsBalance: kid.pointsBalance,
    cashBalance: kid.cashBalance,
    activeStrikeCount: strikes.length,
  };
}

export interface FriendsPanelData {
  conversations: ConversationSummary[];
  pendingRequests: FriendRequest[];
}

export async function getFriendsPanelData(kidId: string): Promise<FriendsPanelData | null> {
  const kid = await getKid(kidId);
  if (!kid) return null;
  const [conversations, pendingRequests] = await Promise.all([
    listConversationSummaries(kidId),
    listPendingFriendRequests(kidId),
  ]);
  return { conversations, pendingRequests };
}

export interface FriendChatData {
  friendName: string;
  friendAvatar: string;
  messages: Message[];
}

export async function getFriendChatData(kidId: string, friendId: string): Promise<FriendChatData | null> {
  const friends = await listFriends(kidId);
  const friend = friends.find((f) => f.id === friendId);
  if (!friend) return null;
  const messages = await listMessages(kidId, friendId);
  return { friendName: friend.name, friendAvatar: friend.avatar, messages };
}

export interface QuizHubData {
  sets: QuizSet[];
  banks: QuizBank[];
}

export async function getQuizHubData(): Promise<QuizHubData> {
  const [sets, banks] = await Promise.all([listQuizSets(), listQuizBanks()]);
  return { sets, banks };
}

export interface QuizGameQuestion {
  id: string;
  prompt: string;
  choices: { label: string; isCorrect: boolean }[];
  timeLimitSeconds: number;
}

export interface QuizGameData {
  bankName: string;
  questions: QuizGameQuestion[];
  players: { id: string; name: string; avatar: string; themeId: ThemeId }[];
}

const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

export async function getQuizGameData(kidId: string, bankId: string): Promise<QuizGameData | null> {
  const [set, bank, kids] = await Promise.all([getQuizSet(bankId), getQuizBank(bankId), listKids()]);

  let bankName = "";
  let questions: QuizGameQuestion[] = [];

  if (set) {
    bankName = set.name;
    const allQuestions = await listQuizQuestions2({ theme: set.themes[0] });
    const maxDiff = DIFFICULTY_ORDER[set.maxDifficulty] ?? 2;
    const eligible = allQuestions.filter((q) => {
      const qDiff = DIFFICULTY_ORDER[q.difficulty] ?? 0;
      return qDiff <= maxDiff && q.choices && q.choices.length > 0;
    });
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    questions = shuffled.slice(0, set.questionsPerSession).map((q) => ({
      id: q.id,
      prompt: q.questionText,
      choices: [...(q.choices ?? [])].sort(() => Math.random() - 0.5).map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
      timeLimitSeconds: 30,
    }));
  } else if (bank) {
    bankName = bank.name;
    const rawQuestions = await listQuizQuestions(bank.id);
    const shuffled = [...rawQuestions].sort(() => Math.random() - 0.5);
    questions = shuffled.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: [...q.choices].sort(() => Math.random() - 0.5).map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
      timeLimitSeconds: q.timeLimitSeconds,
    }));
  } else {
    return null;
  }

  if (questions.length === 0) return null;

  return {
    bankName,
    questions,
    players: kids.map((k) => ({ id: k.id, name: k.name, avatar: k.avatar, themeId: k.themeId })),
  };
}
