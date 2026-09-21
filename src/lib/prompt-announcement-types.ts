// A21: TYPE-ONLY seam module - no runtime code at all, and therefore no
// caller in this wave's file list (docs/a21-instrument-notes.md section 4.2,
// "M-4"). This is the ONE legal exception `seats.md` allows to "every wave's
// file list must include the file that CALLS each new export": a type-only
// module emits nothing at runtime, so there is nothing to call. AC-23
// (prompt-announcement-types.test.ts) enforces that this file stays exactly
// that - the moment a runtime binding (a `const`, a `function`, a value
// import) lands here, the wave-table exception this file relies on stops
// being true.
//
// Import direction, noted rather than hidden: this "lib" module imports
// types FROM src/app/components/walkthrough-announcement/ - backwards for a
// lib file, and it would be a real problem as a VALUE import. As
// `import type` it is erased by tsc and reaches no bundle; AC-23(ii) is what
// keeps every import in this file `import type`, so that erasure is
// guaranteed rather than assumed.

import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import type { LlmProvider } from "@/lib/llm";
import type {
  LiveDefaults,
  ResolvedTemplate,
  TemplateChoice,
} from "@/app/components/walkthrough-announcement/announcement-draft-slots";

/** The wire payload for one draft request. Carries `resolvedTemplate`, NOT a
 * separate `resolvedKind` field - two notions of the same fact on one object
 * is exactly what AC-4 exists to prevent. The action derives
 * `resolvedTemplate.kind` for the composer. */
export interface PromptAnnouncementDraftRequest {
  readonly promptText: string;
  readonly courseLabel: string;
  readonly resolvedTemplate: ResolvedTemplate;
  readonly outline: AnnouncementOutline;
  readonly provider: LlmProvider;
}

export type PromptAnnouncementDraftResult =
  | {
      readonly ok: true;
      readonly title: string;
      readonly message: string;
      readonly templateApplied: boolean;
      readonly resolvedTemplate: ResolvedTemplate;
    }
  | { readonly ok: false; readonly error: string };

export interface PromptDraftUiState {
  readonly promptText: string;
  readonly courseLabel: string;
  readonly choice: TemplateChoice;
  readonly live: LiveDefaults;
  readonly provider: LlmProvider;
  readonly title: string;
  readonly message: string;
  readonly lastResolved: ResolvedTemplate | null;
  readonly receipt: string;
  readonly error: string | null;
}
