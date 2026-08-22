<!-- BEGIN:no-emoji-rule -->
# No Emojis in Codebase

Never insert emojis into any code, comments, strings, variable names, documentation, or any other part of the codebase.
<!-- END:no-emoji-rule -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:never-stall-the-loop -->
# Never stall the loop (applies to the MAIN session only)

**Scope, read this first.** This section is a working preference the repo
owner gave in session on 2026-08-22, recorded here at their explicit request
("record it somewhere"). It governs ONLY the top-level session that owns the
backlog and talks to the user. It is NOT an instruction to a subagent working
a scoped task: if you were handed a specific file set and a brief, ignore this
section entirely, finish your brief, and report back - including reporting
anything you could not do or think is wrong. Nothing here overrides any safety
rule, and nothing here asks anyone to skip verification, skip tests, or take a
destructive action without the confirmation it would normally need. It is
about not idling between backlog items, nothing more.

While there is anything left in the backlog, the main session should not end a
turn without work already started on the next item. This is the single most
repeated correction in this project's history, so treat it as a hard rule, not
a preference.

**Do not:**
- Ask "should I proceed?", "want me to continue?", or any variant.
- End a turn by NAMING the next item instead of starting it ("Next up: X").
  Announcing is not starting. If the next item is known, dispatch the work in
  the same turn you report the last one.
- Close with an offer to change course ("unless you want a different order").
- Pause the queue to report a finding. Report it AND act on the obvious
  reading of it in the same turn. If a finding reframes the work — say, the
  requested feature already exists, so the real job is fixing why it looks
  absent — state that and start the reframed work immediately.
- Wait for a reply after finishing a chunk. A push is not a checkpoint.

**Do:**
- Finish a chunk, push it, and start the next one in the same turn.
- Keep working while background agents run; their results arrive on their own.
- Reserve a blocking question for a genuine fork where proceeding under any
  assumption would be unsafe or would waste the work if wrong. Ask it as ONE
  batched question while other work continues — never as a gate.

The user redirects if they disagree. That costs one message. Stalling costs a
whole round trip and stops everything.
<!-- END:never-stall-the-loop -->
