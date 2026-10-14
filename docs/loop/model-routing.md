# Host model routing policy

Status: accepted host policy ruling, 2026-10-13; independent round-2 check clean.
This policy applies to NEW role launches. It does not switch existing agents,
prove their resolved settings, or change an already accepted native routing grant.
Tools do not automatically load this Markdown policy.

## Explicit host dispatch

For new Codex collaboration launches, the coordinator supplies the model and
reasoning effort below explicitly, using `fork_turns: "none"` and a bounded
brief with the required artifact references. Do not inherit the whole conversation
by default. If launch fails, report the failure; do not describe the requested
settings as a running or observed model. Record requested settings separately
from observed settings; record unavailable observations as unavailable.

This is the owner's authorized cross-provider override of the earlier prohibition
on per-call tier settings. Claude role definitions remain the contracts for their
named seats; their frontmatter is unchanged. The historical Claude mapping and
measurements remain in `this-repo.md` section 8.

| Claude seat contract | New Codex model | Effort | Responsibility |
|---|---|---|---|
| `loop-implementer` | `gpt-6.1-sol` | medium | Code and tests from accepted contracts |
| `loop-seat` | `gpt-6.1-sol` | high | Checked specialist, verification, RCA and remediation reports |
| `loop-top` | `gpt-6-astra` | high | Foundational contracts and queue chunking |
| `loop-ac` | `gpt-6-astra` | high | Observable acceptance criteria |
| `loop-architect` | `gpt-6-astra` | high | Architecture and shape |
| `loop-plan` | `gpt-6-astra` | high | Build waves and ownership |
| `loop-test-author` | `gpt-6-astra` | high | Independent oracles and mutation design |
| `loop-checker` | `gpt-6-astra` | high | Independent adversarial and final judgment |
| `loop-retro` | `gpt-6-astra` | high | Evidence-based retrospective recommendations |
| `loop-retro-reviewer` | `gpt-6-astra` | high | Independent retrospective judgment |

Example host tool arguments, not a shell command or an implemented auto-loader:

```json
{
  "task_name": "bounded_implementer",
  "fork_turns": "none",
  "model": "gpt-6.1-sol",
  "reasoning_effort": "medium",
  "message": "Perform the scoped implementer brief; read its named accepted artifacts and edit only its owned paths."
}
```

Use `gpt-6-astra` and `high` with the same fresh-context shape for a checker.
Neither max nor ultra effort is a default. Low effort is permitted only for
deterministic transcription whose decision and output are independently checked;
it is not the default for general implementation or semantic review.

The [official model guide](https://developers.openai.com/api/docs/guides/latest-model)
describes the model families' intended uses. The model and effort split here is
a policy decision, not a measured performance, quality or cost comparison.
Host tool availability supports these names and effort settings; it does not
establish successful dispatch, authentication, or observed provider identity.

## Native supervisor roles

| Native role | Profile | Prospective model and effort |
|---|---|---|
| `criteria` | critical | `gpt-6-astra`, high |
| `architect` | critical | `gpt-6-astra`, high |
| `planner` | critical | `gpt-6-astra`, high |
| `test-designer` | critical | `gpt-6-astra`, high |
| `checker` | critical | `gpt-6-astra`, high |
| `specialist` | analysis | `gpt-6.1-sol`, high |
| `verifier` | analysis | `gpt-6.1-sol`, high |
| `finalizer` | analysis | `gpt-6.1-sol`, high |
| `implementer` | execution | `gpt-6.1-sol`, medium |
| `transcriber` | execution | `gpt-6.1-sol`, medium; low only in separately qualified deterministic routing |

Verifier and finalizer author checked reports; they are not the final adversarial
judgment. A whole-change-review specialist authors an analysis report and a
critical checker independently checks it. This separation preserves the stronger
checking tier without assigning every report author to the critical tier.

Native routing selects by profile and qualification, not by this table or role
name alone. Execution currently covers both implementer and transcriber; adding
a low-effort execution target can route implementers to it. Do not add that
target to a shared execution profile merely to lower transcription effort.

Create a NEW routing configuration with separate execution, analysis and critical
targets. Put the effort in the adapter-supported `settings.reasoningEffort` field.
Keep the draft disabled and unqualified. Once owner-authorized, use `qualify
--enable`: `dispatch-configure.ts` enables the selected target and provider before
probing and computing their qualification fingerprint. The fingerprint includes
enabled fields, so qualifying a disabled target and then toggling it invalidates
that qualification. A changed model or effort also requires fresh qualification;
old qualifications cannot be copied. Check profile-specific qualification and
routing outcomes before configuring the new grant.
Accepted fixed grants and their evidence remain immutable historical records.

The audited native grant at
`.agnostic-loop/continuous-feature-run-20261013/routing.json` requests
`gpt-6.1-sol` low for execution and `gpt-6.1-sol` high for analysis/critical.
Its qualifications are operator attestations and observed-model enforcement is
disabled. That is the existing requested mapping, not evidence of Astra dispatch
or an observed actual model. This policy does not modify it.
