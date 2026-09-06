// Client-safe leaf: the selectable course-copy content types.
//
// WHY THIS FILE EXISTS. `copy.ts` imports `../canvas-core`, which since the
// per-user credential work resolves credentials through
// `canvas-credentials.ts` -> `supabase/server.ts` -> `next/headers` and
// `node:async_hooks` - genuinely server-only, and unbundleable for a browser
// target.
//
// `CourseCopyModal.tsx` is a Client Component and needs only this list, which
// is nine literal `{ key, label }` pairs with no dependencies of any kind.
// Importing it through the `@/lib/canvas-modules` barrel dragged the whole
// server graph into the browser chunk and broke `next build`.
//
// So it lives here, importing NOTHING, and `copy.ts` re-exports it so the
// barrel and every server caller are unchanged. A client component must
// import from THIS module directly, never through the barrel.

/** Content types that can be selected when copying a course (copy[all_<key>]). */
export const COURSE_COPY_TYPES: Array<{ key: string; label: string }> = [
  { key: "context_modules", label: "Modules" },
  { key: "assignments", label: "Assignments" },
  { key: "quizzes", label: "Quizzes" },
  { key: "discussion_topics", label: "Discussions" },
  { key: "wiki_pages", label: "Pages" },
  { key: "announcements", label: "Announcements" },
  { key: "attachments", label: "Files" },
  { key: "rubrics", label: "Rubrics" },
  { key: "syllabus_body", label: "Syllabus" },
];
