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

### Course Engine API (the "Other API" provider)

When the in-app provider toggle is set to **Other API**, the matched features (course
schedule, lecture deck, course materials, and the Copilot project prompt) call the
Course Engine service instead of Gemini. All other features stay on Gemini regardless
of the toggle.

- `COURSE_ENGINE_URL` (optional, default: `https://testing-knowledge-engine.vercel.app`)
- `COURSE_ENGINE_API_KEY` (optional) — only required if the Course Engine project enforces a key; sent as `X-API-Key`. Never exposed to the client.

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
