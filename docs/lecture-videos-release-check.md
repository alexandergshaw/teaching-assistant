# Lecture Videos release check

The first handoff ended after local type checking, targeted tests, and a
Chrome run with synthetic media and stubbed provider responses. It did not
include publication, production deployment, real lecture footage, or live
provider calls. Those local checks are regression evidence. Record each
production check below separately before labeling the workflow live-verified.

## Keep the release open

An active gate is an unfinished step. Keep checking until it finishes. For a
failed gate, record the failing command and run link, compare with clean main
where needed, fix the failure, and rerun the full gates against the new
candidate. A clean-main failure helps with diagnosis and still blocks release.
Only close the release after both live recordings pass, the owner asks to stop,
or a concrete blocker prevents further authorized work. For a blocker, record
the exact dependency, the last verified commit, and which checks are pending.

## Required evidence

Before publication, run the repo's standing gates and include the Recording
URL, launch, tab-panel, lecture-project, file-size, and modal-adoption tests in
the focused check. Verify keyboard dismissal and focus return for the shared
confirmation dialog. Record any reproduced clean-main failures separately
from failures introduced by the candidate.

1. Record the reviewed Git commit, the observed `origin/main` SHA, and the
   production URL, Ready deployment ID, and deployment Git SHA. Confirm the
   production deployment includes the reviewed change before starting the
   browser run.
2. Open Tools > Recording > Lecture Videos in an authenticated instructor or
   owner session. Add both Lecture 15 recordings and the lecture deck. Record
   source filenames and durations. If a source copy already has narration,
   strip the audio in a temporary copy without re-encoding the picture.
3. Use Draft cues from the new view and observe returned cues from the
   configured Gemini integration on both parts. Check that the cues refer to
   the footage. Edit a cue and verify the other part remains intact.
4. Select an available ElevenLabs voice and generate audio in the view.
   Audition the returned narration on both parts. Resolve timing warnings
   before export and check the mouse and keyboard reveals in Part 2 at
   approximately 2:02.5 and 4:07 against the picture.
5. Render and download both videos. Inspect container, audio and video tracks,
   duration, and audible speech. Verify captions when cue narration is used.
   Reload and check that the project's parts, scripts, and exports reappear.
6. Draft the announcement, add test watch links and a module link, then copy
   and inspect the announcement. Do not publish it as part of this check.

For each step record pass, failure, or blocked with the observed evidence and
what remains. Synthetic assets, stubbed actions, or local rendering cannot
satisfy a live provider or production check. Keep original recordings, output
videos, account details, and credentials out of Git.
