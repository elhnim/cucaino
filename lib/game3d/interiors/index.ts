// Every interior builder, behind one module so the app can lazy-load them together with the
// engine (they all pull in three.js) instead of bundling them into the page's first download.
export { buildPetHomeInterior } from "./pethome";
export { buildScheduleInterior } from "./schedule";
export { buildStoreInterior } from "./store";
export { buildFriendsInterior } from "./friends";
export { buildPlayHallInterior } from "./playhall";
export { buildMiniGolfInterior } from "./minigolf";
