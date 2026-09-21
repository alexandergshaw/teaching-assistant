// A23: the policy home for the runtime-import-graph walk (Ruling M-1,
// docs/a23-architecture.md:485-527). Both guard test files
// (repoGradesFeedbackAndFiles.wiring.test.ts, gradingResultsHelpersWiring.test.ts)
// import their WalkOptions fields from here by name, never from a locally
// re-declared copy - that is the whole point of naming this home: one array,
// two importers, and a third importer (runtime-import-graph.test.ts, R-10)
// that can assert properties of the exact values in force.
//
// Plain string arrays only - no node:fs, no typescript - so this file carries
// none of the whole-src client-bundle-reachability hazard runtime-import-graph.ts
// does, and needs no guard of its own.

// The hazard, by RESOLVED path. Relative to src/, POSIX, no trailing slash,
// character-by-character prefix matched (never segment-by-segment) - the
// repo's documented idiom (classTrendsDraft.not-postable.test.ts:64-66),
// deliberately withstood a withdrawn attempt to add a "/" boundary
// (docs/a23-architecture.md:545-589, Ruling W1).
export const FORBIDDEN_PATH_PREFIXES = ["lib/supabase"];

// The positively-stated exceptions INSIDE a forbidden prefix (m4). A new
// module in src/lib/supabase/ that enters a client closure fails until a
// human declares it browser-safe here.
export const BROWSER_SAFE_MODULES = ["lib/supabase/client.ts"];

// Diagnostics only - NOT what completeness rests on. Produces a named
// violation with a better message instead of a generic "not on the allow
// list"; ALLOWED_BARE_SPECIFIERS and FORBIDDEN_BARE_SPECIFIERS are asserted
// disjoint (R-10) so this can never contradict the allow list.
export const FORBIDDEN_BARE_SPECIFIERS = ["next/headers", "node:async_hooks", "server-only"];

// THE ALLOW LIST. Every literal bare specifier that is not a walked module
// and not an allowed asset must be on this list, or the guard FAILS. Starts
// as a transcription of the 18 distinct bare specifiers dropped by the two
// guarded closures before Z1 (docs/a23-architecture.md:591-635) - every one
// browser-safe on the build's own evidence (RES-A23-5).
export const ALLOWED_BARE_SPECIFIERS = [
  "@monaco-editor/react",
  "@mui/material",
  "@mui/material/Autocomplete",
  "@mui/material/Button",
  "@mui/material/Checkbox",
  "@mui/material/FormControlLabel",
  "@mui/material/IconButton",
  "@mui/material/MenuItem",
  "@mui/material/TextField",
  "@supabase/ssr",
  "jszip",
  "next/dynamic",
  "node-html-parser",
  "react",
];

export const ALLOWED_ASSET_EXTENSIONS = [".css"];
