// The Retro Arcade's cabinets. To add a game: write lib/retro/games/<name>.ts exporting a
// RetroGameDef (see engine.ts; jungleCommando.ts is a full example) and list it here.
// lib/retro/games.test.ts plays every game headless to make sure none of them crash.
import type { RetroGameDef } from "./engine";
import { jungleCommando } from "./games/jungleCommando";
import { starBlaster } from "./games/starBlaster";
import { alienWave } from "./games/alienWave";
import { spaceRocks } from "./games/spaceRocks";
import { skyClimb } from "./games/skyClimb";
import { balloonFlap } from "./games/balloonFlap";
import { blockDrop } from "./games/blockDrop";
import { mazeMuncher } from "./games/mazeMuncher";
import { snakeTrail } from "./games/snakeTrail";
import { brickBreaker } from "./games/brickBreaker";
import { bubblePop } from "./games/bubblePop";
import { jumpyJelly } from "./games/jumpyJelly";
import { barrelClimb } from "./games/barrelClimb";
import { dungeonDash } from "./games/dungeonDash";
import { boomBlocks } from "./games/boomBlocks";
import { roadRacer } from "./games/roadRacer";
import { dirtDash } from "./games/dirtDash";
import { frogHop } from "./games/frogHop";
import { paddleDuel } from "./games/paddleDuel";
import { balloonGallery } from "./games/balloonGallery";
import { kickSoccer } from "./games/kickSoccer";
import { panelPop } from "./games/panelPop";
import { cometPatrol } from "./games/cometPatrol";
import { tankBattle } from "./games/tankBattle";
import { olympicDash } from "./games/olympicDash";
import { pillDoctor } from "./games/pillDoctor";
import { hoopJam } from "./games/hoopJam";
import { pictureCross } from "./games/pictureCross";
import { punchChamp } from "./games/punchChamp";
import { bubbleBuddies } from "./games/bubbleBuddies";
import { roboRunner } from "./games/roboRunner";
import { miniRacers } from "./games/miniRacers";
import { puffHop } from "./games/puffHop";

export const RETRO_GAMES: RetroGameDef[] = [jungleCommando, starBlaster, alienWave, spaceRocks, skyClimb, balloonFlap, blockDrop, mazeMuncher, snakeTrail, brickBreaker, bubblePop, jumpyJelly, barrelClimb, dungeonDash, boomBlocks, roadRacer, dirtDash, frogHop, paddleDuel, balloonGallery, kickSoccer, panelPop, cometPatrol, tankBattle, olympicDash, pillDoctor, hoopJam, pictureCross, punchChamp, bubbleBuddies, roboRunner, miniRacers, puffHop];
