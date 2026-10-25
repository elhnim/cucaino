import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico, public files
     * - any image extension
     * - /launch: the static PWA splash must paint instantly (no auth work at all)
     * - service worker / manifest / static scripts, styles, fonts, audio
     */
    "/((?!_next/static|_next/image|favicon.ico|launch|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff2?|mp3|wav|json|glb|gltf|bin)$).*)",
  ],
};
