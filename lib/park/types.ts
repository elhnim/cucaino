import type { Pet } from "@/lib/pet/logic";
import type { ThemeId } from "@/lib/domain/types";

/** Everything the park needs on arrival, fetched by one parallel server loader. */
export interface ParkInitialData {
  kid: {
    id: string;
    /** needed client-side for the go-kart track's live race link (lib/park/karts/net.ts),
     *  whose Realtime channel is scoped per family */
    familyId: string;
    name: string;
    avatar: string;
    themeId: ThemeId;
    pointsBalance: number;
    currentStreak: number;
    tourSeen: boolean;
    /** lifetime stars earned (drives the HUD level + XP bar, same as the Dream Park level) */
    totalStarsEarned: number;
  };
  pet: Pet | null;
  tasksToday: { total: number; done: number };
}
