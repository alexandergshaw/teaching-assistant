import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// AC A9 / AM6: Next 16 deprecates the `middleware` file convention in favour
// of `proxy`
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// This file (and its sibling src/lib/supabase/proxy.ts) replaces the old
// src/middleware.ts / src/lib/supabase/middleware.ts pair, deleted in the
// same change - Next throws at startup if both conventions are present.
//
// RUNTIME NOTE: `proxy` defaults to the Node.js runtime, where `middleware`
// defaulted to the Edge runtime - this moves the gate off the edge and
// changes per-request latency and the deploy artifact, not its logic. The
// `runtime` config option is not available in a proxy file at all; setting
// it throws (see that doc's "Runtime" section), so this file exports none.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Match all routes except static assets and image optimizer
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
