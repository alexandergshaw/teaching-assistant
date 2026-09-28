// The one pure value client-reachable code needs out of canvas-credentials.ts.
// Extracted 2026-09-27 (docs/build-broken-2026-09-27.md defect 1): a
// "use client" file importing CANVAS_CREDENTIAL_REQUIRED_MESSAGE from
// canvas-credentials.ts still evaluated that whole module's top-level
// imports (./supabase/effective-identity, ./lms-credentials), which reach
// ./supabase/server (next/headers, node:async_hooks) and broke the client
// bundle. This leaf has zero imports, so importing it cannot drag anything
// else in. canvas-credentials.ts re-exports this identifier so every
// existing server caller is unaffected (see CANVAS_CREDENTIAL_REQUIRED_MESSAGE's
// own doc comment there for why identity, not a copied literal, is the rule).
export const CANVAS_CREDENTIAL_REQUIRED_MESSAGE =
  "Connect your Canvas account for this institution in Settings.";
