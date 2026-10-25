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

export const RETRO_GAMES: RetroGameDef[] = [jungleCommando, starBlaster, alienWave, spaceRocks, skyClimb, balloonFlap, blockDrop, mazeMuncher, snakeTrail, brickBreaker, bubblePop, jumpyJelly, barrelClimb, dungeonDash, boomBlocks, roadRacer, dirtDash, frogHop, paddleDuel, balloonGallery];
