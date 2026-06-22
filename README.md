This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment Variables

Set these values in your local `.env.local` and in your deployment provider:

- `GEMINI_API_KEY` (required)
- `GEMINI_MODEL` (optional, default: `gemini-3.1-flash-lite`)
- `GEMINI_MAX_OUTPUT_TOKENS` (optional, default: `700`)
- `GRADE_MAX_SUBMISSIONS` (optional, default: `5`)
- `GRADE_MAX_CHARS_PER_SUBMISSION` (optional, default: `12000`)
- `GRADE_INTER_REQUEST_DELAY_MS` (optional, default: `1200`)

The grading pipeline uses these limits to reduce free-tier quota spikes by capping per-run workload and pacing requests.

### Access control (owner-only)

The app is gated to an allowlist of accounts so visitors cannot use your
server-side credentials (e.g. the Canvas API token).

- `OWNER_EMAILS` (required to use the app) — comma-separated list of the email
  addresses allowed in. Fails closed: if unset, no one is authorized and every
  page redirects to `/login`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required) —
  Supabase project used for authentication.

Sign-in uses Supabase Auth (email + password) at `/login`. Create your owner
account in the Supabase dashboard (and disable public sign-ups there so only you
can authenticate). Middleware redirects any non-owner to `/login`, and the
privileged grading/Canvas server actions additionally verify the owner before
running.

#### Two-factor authentication (TOTP)

MFA is supported and enforced once enrolled — it does not lock you out before
setup (enforcement only triggers when a verified factor exists):

1. Enable TOTP in the Supabase dashboard (Authentication -> MFA).
2. Sign in, then visit **`/account/security`** (there's a "Security" link in the
   app header) and add an authenticator: scan the QR in your app and enter the
   6-digit code to activate. Add a **second** authenticator as a backup.
3. From then on, sign-in requires the password plus a 6-digit code, and both the
   middleware and the privileged server actions require the elevated (AAL2)
   session.

Recovery: if you lose all authenticators, remove the factor from the Supabase
dashboard (Authentication -> Users -> the user -> Factors) to regain access; this
is why enrolling a backup factor is recommended.

### Course Engine API (the "Other API" provider)

When the in-app provider toggle is set to **Other API**, the matched features (course
schedule, lecture deck, course materials, and the Copilot project prompt) call the
Course Engine service instead of Gemini. All other features stay on Gemini regardless
of the toggle.

- `COURSE_ENGINE_URL` (optional, default: `https://testing-knowledge-engine.vercel.app`)
- `COURSE_ENGINE_API_KEY` (optional) — only required if the Course Engine project enforces a key; sent as `X-API-Key`. Never exposed to the client.

Grading is handled by a **separate** dedicated service. When the toggle is **Other API**,
the Grading tab grades deterministically against a check-based rubric (CSV/JSON, e.g. the
materials `rubric.csv`) via that service instead of Gemini:

- `GRADING_ENGINE_URL` (required to use the deterministic grader) — base URL of the grading service.
- `GRADING_API_KEY` (optional) — only required if the grading service enforces a key; sent as `X-API-Key`. Never exposed to the client.

### Canvas grading

The Grading tab can grade Canvas **discussions and assignments** directly from a
URL (Canvas has no UI export, but its API does). Choose **Canvas** as the source
and paste either a discussion link (`.../discussion_topics/…`) or an assignment
link (`.../assignments/…`) — the type is auto-detected from the URL. The
institution is selected automatically from the link's hostname, then each
student's work (discussion posts/replies, or assignment text + uploaded files) is
pulled via the Canvas API and graded against the rubric.

Canvas grading respects the provider toggle: **Gemini** uses the AI grader (needs
assignment instructions; the rubric is synthesized if not provided), while
**Other API** sends the fetched work to the deterministic grading service as a
synthesized Canvas-style zip (needs a check-based CSV/JSON rubric).

After grading a Canvas URL you can **review and post grades back to Canvas**: edit
each student's points and comment, then post. Grades write to the assignment's
gradebook column and comments are added to each submission (assignment URLs, and
graded discussions via their linked assignment). The token needs grading access.
When the Canvas assignment has an **attached rubric**, posting also fills the
SpeedGrader rubric with per-criterion points and comments (matched to criteria by
name); otherwise just the overall grade and comment are posted.

Institutions are registered by hostname in `src/lib/canvas.ts` (e.g. MCC ->
`canvas.mccneb.edu`). Each registered institution reads its own credentials from
env vars prefixed with its code:

- `<CODE>_CANVAS_API_TOKEN` (required for that institution) — an instructor personal access token (Canvas: Account → Settings → New Access Token). Sent as `Authorization: Bearer`, server-side only, never exposed to the client.
- `<CODE>_CANVAS_URL` (optional) — base URL override; defaults to `https://<host>`.

MCC is preconfigured, so set `MCC_CANVAS_API_TOKEN`. To add another school: add an
entry to the `CANVAS_INSTITUTIONS` list (code, name, host) and set its
`<CODE>_CANVAS_API_TOKEN`.

## Course Engine: Lecture Deck (`/api/v1/lecture`)

When the provider toggle is **Other API**, generating a lesson on the Lesson Planning
tab calls the Course Engine lecture endpoint, which returns a finished PowerPoint
(`module-lecture.pptx`) built deterministically — **no LLM**. Content is retrieved from
trusted sources (Wikipedia/Wikiversity for explanations, Stack Overflow for code), so the
deck is bounded by what those sources provide. The call fans out per objective and per
concept, so it can take several seconds (allow 30s+; cold starts add more).

- **Method / path:** `POST /api/v1/lecture` on `COURSE_ENGINE_URL`
- **Auth:** optional — only when the Course Engine project sets a key, sent as
  `X-API-Key: <COURSE_ENGINE_API_KEY>` (server-side only, never exposed to the client)
- **Request (`application/json`):**
  - `objectives` (required) — string or string array, 10–4000 chars, any format (list,
    numbered/bulleted, or prose); capped at ~20 objectives
  - `title` (optional, default `"Module Lecture"`) — titles the deck and **biases source
    retrieval and language inference** (e.g. a `title` of "Introduction to Python" resolves
    "for loop" to the programming sense rather than a generic one)
- **Response:** a binary `.pptx` (title slide, agenda, one explanation slide per objective,
  per-concept `Example: <Concept>` slides with code for programming topics or prose
  otherwise, and a cited-references slide). The client downloads it directly — there is no
  in-app editable preview for this path.

The **Module Title** field on the Lesson Planning form (shown only under the Other API
provider) supplies `title`; leaving it blank sends no title and the service applies its
`"Module Lecture"` default. Only `objectives` and `title` are wired from the app — the raw
endpoint also exposes the usual error envelope (`{ "error": { "code", "message" } }`) for
invalid input or auth failures.

## Supported Submission File Types

The grader can now extract text from common source and document formats inside the uploaded zip archive, including:

- Plain text and code files: `txt`, `md`, `py`, `js`, `ts`, `tsx`, `jsx`, `java`, `c`, `cpp`, `cs`, `go`, `rs`, `json`, `xml`, `yaml`, `sql`, and more
- Microsoft Office files: `docx`, `pptx`, `xlsx` (plus best-effort parsing for `doc`, `ppt`, `xls`)
- Other common document formats: `pdf`, `rtf`, `odt`, `odp`, `ods`, `html`, `csv`, `ipynb`

If a file cannot be parsed, it is skipped and the rest of the submissions continue processing.

## Grading Output

Each grading run returns:

- Per-student rubric-area scores and comments
- An overall comment and optional total score
- An on-page rubric score matrix preview for quick scanning
- A CSV export generated only when the Export CSV button is clicked

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
