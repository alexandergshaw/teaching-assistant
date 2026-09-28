# RULING 125: the ElevenLabs env-voice fallback was reachable by any active account

Closes the live gap `docs/owner-private-secrets.md` section 4.1 found and named RES-1:
`ELEVENLABS_VOICE_ID` (the owner's own cloned voice) had no per-caller check at its
read site, unlike its Canvas and GitHub siblings.

## The reach path, with the line citations I verified myself

- `resolveNarrationVoiceId` (`src/app/actions/media-voice.ts:250` before this fix)
  resolved in three steps: `voiceIdOverride` -> the caller's own
  `user_style.voice_id` -> `process.env.ELEVENLABS_VOICE_ID` at the old `:261`, with
  no identity check on step 3.
- Its two callers are `synthesizeNarrationAction` (`:291`, guard `await requireUser()`
  at `:296`) and `synthesizeLongNarrationAction` (`:316`, guard `await requireUser()`
  at `:321`) - both correctly `requireUser()`, not owner-only: most of what they do
  (a caller's own stored voice, or an override) is not owner-private at all.
- `src/lib/supabase/auth.ts:295` names "the cloned voice/avatar" as an owner-private
  capability in the same breath as Canvas and `GITHUB_TOKEN`.
- So any active signed-in account with no `user_style.voice_id` row of their own,
  calling either action with no override, reached step 3 and got
  `ELEVENLABS_VOICE_ID` - the owner's cloned voice - if that variable was set.

## Why containment goes at the read site, not the guard

Tightening either action's guard to `requireAppOwner()` would refuse the
overwhelmingly common, legitimate case: a non-owner instructor narrating with their
own stored voice, or with an explicit override. Neither of those reaches anything
owner-private, so gating the whole action would remove a real capability from every
instructor - the over-tightening failure `docs/owner-private-secrets.md` documents
at length and the fix this ruling exists to avoid repeating.

The correct shape already ships in this tree: `resolveCanvasCredential`
(`src/lib/canvas-credentials.ts:220`) gates its own env fallback on
`identity.role === "owner"`, leaving its two `requireUser()` callers untouched.
`resolveNarrationVoiceId` now does the same thing, at the same layer - the
resolver, not the guard.

## The fix

`resolveNarrationVoiceId` (`src/app/actions/media-voice.ts`) takes a third
parameter, `role: AppUserRole | undefined` - the `role` field `requireUser()`'s
return value (`AuthorizedUser`) already carries, so no new identity lookup was
needed. The env fallback now only fires when `role === "owner"`:

```ts
if (role === "owner") {
  const envVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (envVoiceId) {
    return envVoiceId;
  }
}

return "21m00Tcm4TlvDq8ikWAM";
```

Both call sites (`synthesizeNarrationAction`, `synthesizeLongNarrationAction`) were
updated to pass `user.role` through, since both already hold `user` from their own
`await requireUser()` call.

## What a non-owner with no stored voice gets, and why

The pre-existing fallback after the old `||` - `"21m00Tcm4TlvDq8ikWAM"` - is
ElevenLabs' own public "Rachel" stock voice, not a placeholder: the file's own doc
comment on `synthesizeNarrationAction` already described it as "the standard
'Rachel' voice" before this ruling, and it was already the value every caller
without a stored voice or an unset env var received. This ruling does not invent a
new default or a refusal path; it makes the OWNER's env voice conditional on the
caller's role, while every existing fallback (own stored voice, override, and this
same stock id) is unchanged for every role. A non-owner with no stored voice loses
nothing they had before except access to the owner's cloned voice, which they were
never supposed to reach.

## What I could not determine (owner facts, not asserted either way)

- **Whether `ELEVENLABS_VOICE_ID` is actually set in production.** No `.env` exists
  in this checkout. If it is unset, this gap was latent (both paths already fell
  through to the same stock voice); if it is set, the gap was live for every active
  account with no stored voice.
- **Whether `"21m00Tcm4TlvDq8ikWAM"` is a real, currently-valid ElevenLabs voice
  id in production**, as opposed to one that has since been retired on
  ElevenLabs' side. The in-repo comment says it is Rachel's id; I did not call the
  live API to confirm it still resolves.

## Verification

- RED before / GREEN after, same assertion: `src/app/actions/media-voice.guard.test.ts`,
  the two "REGRESSION GUARD" tests. Run against the code with the `role === "owner"`
  check removed (env fallback unconditional, matching the pre-fix behaviour): both
  failed, asserting the resolved voice equalled the owner's env voice and equalled
  the stock voice at once - `expected 'owner-cloned-voice-id' not to be
  'owner-cloned-voice-id'`. Restored the fix (confirmed byte-identical to the
  pre-revert file via `diff`) and reran: all 7 tests in the file pass.
- Three positive controls, all passing: an owner with no stored voice still gets
  the env voice; a non-owner with their own stored voice still gets theirs; an
  override wins for both roles.
- `action-guard-coverage.test.ts` stayed green - no guard was touched, only the
  resolver's internal branching.

See the implementer's report for full gate output (tsc, lint, build, full suite,
`git status --short`).
