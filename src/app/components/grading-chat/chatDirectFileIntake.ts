import { admitRoleFiles, type ConfirmedRoleSetup } from "./chatFileRoles";
import { recordChatFileRoleDiagnostic } from "./chatFileRoleDiagnostic";
import type { SubmitOutcome } from "./useContinuousGradingRun";

/** A thrown preparation may have reached admission; it must not be retried automatically. */
export type DirectFileOutcome = SubmitOutcome | { readonly kind: "unknown"; readonly reason: string } | { readonly kind: "identity"; readonly reason: string } | { readonly kind: "staged" };

// Token ownership keeps a canceled attempt's finally from releasing a newer one.
export function createDirectFileIntake() {
  let revision = 0, active = false;
  return {
    isPending: () => active,
    cancel() { revision += 1; active = false; },
    async run(args: {
      files: File[]; label?: string; setup: ConfirmedRoleSetup; blocked: boolean;
      preparing: (busy: boolean) => void; error: (message: string | null) => void;
      start: (setup: ConfirmedRoleSetup, current: () => boolean) => Promise<boolean>;
      submit: (files: File[], label: string | undefined, current: () => boolean) => Promise<SubmitOutcome[]>;
    }): Promise<DirectFileOutcome[]> {
      const startedAtMs = performance.now();
      const refusal = active || args.blocked ? "Finish or cancel the current intake before choosing another batch." : admitRoleFiles(args.files);
      try { recordChatFileRoleDiagnostic({ operation: "stage", outcome: refusal ? "failure" : "success", startedAtMs,
        rows: args.files.map((file, id) => ({ id, name: "", size: file.size, file: null, role: "submission", status: "ready" })),
        failure: active || args.blocked ? "pending-preview" : "limits" }); } catch { /* Diagnostics cannot change admission. */ }
      if (refusal) { args.error(refusal); return args.files.map(() => ({ kind: "refused", reason: refusal })); }
      const token = ++revision, current = () => token === revision;
      active = true; args.preparing(true); args.error(null);
      const setup = Object.freeze({ ...args.setup }), files = [...args.files], reasons: string[] = [], results: DirectFileOutcome[] = [];
      try {
        if (!(await args.start(setup, current)) || !current()) return files.map(() => ({ kind: "refused", reason: "Session setup was not completed; no files were submitted." }));
        for (const file of files) {
          if (!current()) break;
          try {
            const outcomes = await args.submit([file], files.length === 1 ? args.label : undefined, current);
            const outcome = outcomes.length === 1 ? outcomes[0] : { kind: "unknown" as const, reason: "The file's admission could not be confirmed. Check results before resubmitting." };
            results.push(outcome);
            for (const outcome of outcomes) if (outcome.kind !== "accepted") reasons.push(`${file.name}: ${outcome.reason}`);
          } catch { const reason = "The file's admission could not be confirmed. Check results before resubmitting."; results.push({ kind: "unknown", reason }); reasons.push(`${file.name}: ${reason}`); }
          if (!current()) break;
          args.error(reasons.length ? reasons.join(" ") : null);
        }
      } catch { if (current()) args.error("Session setup failed. Check the setup and upload the files again."); }
      finally { if (current()) { active = false; args.preparing(false); } }
      while (results.length < files.length) results.push({ kind: "refused", reason: "This file was not submitted. Review it before retrying." });
      return results;
    },
  };
}
