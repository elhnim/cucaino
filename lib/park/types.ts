import type { Pet } from "@/lib/pet/logic";
import type { ThemeId } from "@/lib/domain/types";

/** Everything the park needs on arrival, fetched by one parallel server loader. */
export interface ParkInitialData {
  kid: {
    id: string;
    name: string;
    avatar: string;
    themeId: ThemeId;
    pointsBalance: number;
    currentStreak: number;
    tourSeen: boolean;
  };
  pet: Pet | null;
  tasksToday: { total: number; done: number };
}
