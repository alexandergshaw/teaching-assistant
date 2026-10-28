import { admitRoleFiles, type ConfirmedRoleSetup } from "./chatFileRoles";
import { recordChatFileRoleDiagnostic } from "./chatFileRoleDiagnostic";
import type { SubmitOutcome } from "./useContinuousGradingRun";

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
    }): Promise<void> {
      const startedAtMs = performance.now();
      const refusal = active || args.blocked ? "Finish or cancel the current intake before choosing another batch." : admitRoleFiles(args.files);
      try { recordChatFileRoleDiagnostic({ operation: "stage", outcome: refusal ? "failure" : "success", startedAtMs,
        rows: args.files.map((file, id) => ({ id, name: "", size: file.size, file: null, role: "submission", status: "ready" })),
        failure: active || args.blocked ? "pending-preview" : "limits" }); } catch { /* Diagnostics cannot change admission. */ }
      if (refusal) { args.error(refusal); return; }
      const token = ++revision, current = () => token === revision;
      active = true; args.preparing(true); args.error(null);
      const setup = Object.freeze({ ...args.setup }), files = [...args.files], reasons: string[] = [];
      try {
        if (!(await args.start(setup, current)) || !current()) return;
        for (const file of files) {
          if (!current()) return;
          try {
            const outcomes = await args.submit([file], files.length === 1 ? args.label : undefined, current);
            for (const outcome of outcomes) if (outcome.kind !== "accepted") reasons.push(`${file.name}: ${outcome.reason}`);
          } catch { reasons.push(`${file.name}: File preparation failed. Upload this file again to retry.`); }
          if (!current()) return;
          args.error(reasons.length ? reasons.join(" ") : null);
        }
      } catch { if (current()) args.error("Session setup failed. Check the setup and upload the files again."); }
      finally { if (current()) { active = false; args.preparing(false); } }
    },
  };
}
