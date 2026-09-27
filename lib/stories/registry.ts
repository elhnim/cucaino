import type { LibraryStory } from "@/lib/stories/types";
import { AESOP_STORIES } from "@/lib/stories/content/aesop";
import { JUST_SO_STORIES } from "@/lib/stories/content/just-so";
import { TALES_WITH_A_TWIST } from "@/lib/stories/content/tales-with-a-twist";
import { GREEK_MYTHS } from "@/lib/stories/content/greek-myths";
import { EGYPTIAN_MYTHS } from "@/lib/stories/content/egyptian-myths";
import { CHAPTER_BOOKS } from "@/lib/stories/content/chapter-books";
import { WIZARD_OF_OZ } from "@/lib/stories/content/wizard-of-oz";
import { PETER_AND_WENDY } from "@/lib/stories/content/peter-and-wendy";
import { ALICES_ADVENTURES_IN_WONDERLAND } from "@/lib/stories/content/alices-adventures-in-wonderland";
import { THROUGH_THE_LOOKING_GLASS } from "@/lib/stories/content/through-the-looking-glass";
import { THE_PRINCESS_AND_THE_GOBLIN } from "@/lib/stories/content/the-princess-and-the-goblin";
import { AT_THE_BACK_OF_THE_NORTH_WIND } from "@/lib/stories/content/at-the-back-of-the-north-wind";
import { THE_WATER_BABIES } from "@/lib/stories/content/the-water-babies";
import { PINOCCHIO_THE_TALE_OF_A_PUPPET } from "@/lib/stories/content/pinocchio-the-tale-of-a-puppet";
import { KIDNAPPED } from "@/lib/stories/content/kidnapped";
import { ROBINSON_CRUSOE } from "@/lib/stories/content/robinson-crusoe";
import { THE_SWISS_FAMILY_ROBINSON } from "@/lib/stories/content/the-swiss-family-robinson";
import { AROUND_THE_WORLD_IN_EIGHTY_DAYS } from "@/lib/stories/content/around-the-world-in-eighty-days";
import { TWENTY_THOUSAND_LEAGUES_UNDER_THE_SEA } from "@/lib/stories/content/twenty-thousand-leagues-under-the-sea";
import { THE_ADVENTURES_OF_TOM_SAWYER } from "@/lib/stories/content/the-adventures-of-tom-sawyer";
import { ADVENTURES_OF_HUCKLEBERRY_FINN } from "@/lib/stories/content/adventures-of-huckleberry-finn";
import { KIM } from "@/lib/stories/content/kim";
import { LITTLE_WOMEN } from "@/lib/stories/content/little-women";
import { LITTLE_MEN } from "@/lib/stories/content/little-men";
import { EIGHT_COUSINS } from "@/lib/stories/content/eight-cousins";
import { ANNE_OF_GREEN_GABLES } from "@/lib/stories/content/anne-of-green-gables";
import { THE_SECRET_GARDEN } from "@/lib/stories/content/the-secret-garden";
import { HEIDI } from "@/lib/stories/content/heidi";
import { UNDERSTOOD_BETSY } from "@/lib/stories/content/understood-betsy";
import { FIVE_CHILDREN_AND_IT } from "@/lib/stories/content/five-children-and-it";
import { THE_PHOENIX_AND_THE_CARPET } from "@/lib/stories/content/the-phoenix-and-the-carpet";
import { THE_STORY_OF_THE_TREASURE_SEEKERS } from "@/lib/stories/content/the-story-of-the-treasure-seekers";
import { THE_RAILWAY_CHILDREN } from "@/lib/stories/content/the-railway-children";

// Add more stories here (a content file + this list).
export const STORIES: LibraryStory[] = [
  ...CHAPTER_BOOKS,
  ...WIZARD_OF_OZ,
  ...PETER_AND_WENDY,
  ...ALICES_ADVENTURES_IN_WONDERLAND,
  ...THROUGH_THE_LOOKING_GLASS,
  ...THE_PRINCESS_AND_THE_GOBLIN,
  ...AT_THE_BACK_OF_THE_NORTH_WIND,
  ...THE_WATER_BABIES,
  ...PINOCCHIO_THE_TALE_OF_A_PUPPET,
  ...KIDNAPPED,
  ...ROBINSON_CRUSOE,
  ...THE_SWISS_FAMILY_ROBINSON,
  ...AROUND_THE_WORLD_IN_EIGHTY_DAYS,
  ...TWENTY_THOUSAND_LEAGUES_UNDER_THE_SEA,
  ...THE_ADVENTURES_OF_TOM_SAWYER,
  ...ADVENTURES_OF_HUCKLEBERRY_FINN,
  ...KIM,
  ...LITTLE_WOMEN,
  ...LITTLE_MEN,
  ...EIGHT_COUSINS,
  ...ANNE_OF_GREEN_GABLES,
  ...THE_SECRET_GARDEN,
  ...HEIDI,
  ...UNDERSTOOD_BETSY,
  ...FIVE_CHILDREN_AND_IT,
  ...THE_PHOENIX_AND_THE_CARPET,
  ...THE_STORY_OF_THE_TREASURE_SEEKERS,
  ...THE_RAILWAY_CHILDREN,
  ...GREEK_MYTHS,
  ...EGYPTIAN_MYTHS,
  ...AESOP_STORIES,
  ...JUST_SO_STORIES,
  ...TALES_WITH_A_TWIST,
];

export function getStory(id: string): LibraryStory | undefined {
  return STORIES.find((s) => s.id === id);
}

/** Stories grouped by collection, preserving registry order. */
export function storiesByCollection(): { collection: string; stories: LibraryStory[] }[] {
  const groups: { collection: string; stories: LibraryStory[] }[] = [];
  for (const s of STORIES) {
    let g = groups.find((x) => x.collection === s.collection);
    if (!g) {
      g = { collection: s.collection, stories: [] };
      groups.push(g);
    }
    g.stories.push(s);
  }
  return groups;
}
