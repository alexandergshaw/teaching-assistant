"use server";

import type { SelectionChatMessage, ScheduleWeekPlan } from "../actions-types";
import { generateRubric } from "@/lib/grade";
import { scaffoldDocument } from "@/lib/embedded/docs";
import { scaffoldCopilotPrompt } from "@/lib/embedded/course";
import { routeRequest } from "@/lib/embedded/router";
import { applyHtmlRevision } from "@/lib/embedded/revise";
import { callLlm, type LlmProvider, type LlmPart } from "@/lib/llm";
import { courseEngineCopilotPrompt } from "@/lib/course-engine";
import { createClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";
import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock, mapWithConcurrency } from "./shared";

/** Analyze multiple courses for emerging technology opportunities and integration recommendations. */
export async function analyzeCourseTechAction(
  courses: Array<{
    name: string;
    topics: string;
    syllabusText: string;
    textbook: string;
    repoDigest: string;
    modulesSummary: string;
    assignmentsSummary: string;
  }>,
  provider: LlmProvider = "gemini"
): Promise<{ reports: Array<{ name: string; report: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (courses.length === 0) {
      return { error: "Pick at least one course." };
    }

    const ANALYSIS_CONCURRENCY = 2;
    const reports = await mapWithConcurrency(courses, ANALYSIS_CONCURRENCY, async (course) => {
      const prompt = `You are an expert in CS and technology education. Analyze this course and provide actionable guidance on emerging technologies and integration strategies.

COURSE: ${course.name}
TOPICS: ${course.topics.slice(0, 4000)}
SYLLABUS: ${course.syllabusText.slice(0, 4000)}
TEXTBOOK/MATERIALS: ${course.textbook.slice(0, 4000)}
CODE REPOSITORY: ${course.repoDigest.slice(0, 4000)}
MODULES: ${course.modulesSummary.slice(0, 4000)}
ASSIGNMENTS: ${course.assignmentsSummary.slice(0, 4000)}

Provide a plain-text report with exactly two headed sections:

1. EMERGING TECHNOLOGY OPPORTUNITIES
   - List specific technologies/tools now relevant to students of this subject.
   - For each, explain in one line why it matters for this course's students.

2. INTEGRATION RECOMMENDATIONS
   - Provide concrete, course-specific ways to fold each technology into modules or assignments.
   - Be practical and specific to the content you reviewed above.

Return only the plain-text report with these two sections. No JSON, no markdown formatting, no code fences.`;

      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        },
        provider
      );

      if (!result.ok) {
        return {
          name: course.name,
          report: `Analysis failed: HTTP ${result.status}`,
        };
      }

      return {
        name: course.name,
        report: result.text.trim(),
      };
    });

    return { reports };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not analyze the courses." };
  }
}

/** Draft an assignment description for the LMS editor. */
export async function draftAssignmentDescriptionAction(
  name: string,
  notes: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!name.trim()) return { error: "Name the assignment first." };
    const parts: LlmPart[] = [
      {
        text: [
          `Write a Canvas assignment description for an assignment named: ${name.trim()}.`,
          notes.trim() ? `Instructor notes to incorporate:\n${notes.trim()}` : "",
          "Structure: one short overview paragraph, then a short list of concrete requirements/steps, then a one-line submission note. Plain text only (no markdown headings, no asterisks) - use blank lines between sections and hyphen bullets. Under 220 words.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } },
      provider
    );
    if (!r.ok || !r.text.trim()) return { error: "The model returned no description." };
    return { text: r.text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the description." };
  }
}

/**
 * Revise a page's HTML body from a short instruction. Returns revised HTML the
 * author reviews/previews before saving — nothing is written to Canvas here.
 */
export async function revisePageWithAiAction(
  html: string,
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ html: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) {
      return { error: "Describe what to change first." };
    }

    // Embedded Deterministic Engine: apply concrete edit commands (find/replace,
    // remove an element containing a phrase) by rule; an instruction the engine
    // cannot parse leaves the page unchanged rather than fabricating edits.
    if (provider === "embedded") {
      return { html: applyHtmlRevision(html, instruction).html };
    }

    const prompt = `You are editing the HTML body of a course page in a learning management system (Canvas).

CURRENT PAGE HTML:
${html}

EDIT INSTRUCTION:
${instruction.trim()}

Apply the instruction and return the full, updated page as HTML.

Requirements:
- Return ONLY the HTML for the page body. No markdown fences, no commentary, no <html>/<head>/<body> wrapper.
- Preserve the existing structure, links, images, and formatting except where the instruction calls for a change.
- Use simple, valid HTML (p, h2, h3, ul, ol, li, a, strong, em, table). Do not add inline styles or scripts.
- Do not invent facts, dates, or links that were not present or provided.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    // Strip a stray ```html ... ``` fence if the model wraps the output.
    let revised = result.text.trim();
    const fenced = revised.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fenced) revised = fenced[1].trim();
    if (!revised) {
      return { error: "The model returned an empty revision." };
    }
    return { html: revised };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate a course document's content as clean, markdown-ish plain text suited
 * to buildDocxFromPlainText (a "# Title" line, "## Section" headings, "- " bullet
 * lists, and paragraphs). Used by "Add to each" to produce a branded .docx file.
 */
export async function generateDocumentTextAction(
  prompt: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!prompt.trim()) {
      return { error: "Describe the document to generate first." };
    }

    // Embedded Deterministic Engine: template a markdown document from the prompt
    // with no model call.
    if (provider === "embedded") {
      return { text: scaffoldDocument(prompt) };
    }

    const styleBlock = await getWritingStyleBlock(user.id);

    const llmPrompt = `You are writing a polished course handout/document for students.

TOPIC / INSTRUCTION:
${prompt.trim()}

Write the document as clean plain text using this lightweight markdown:
- The first line is the document title, prefixed with a single "# ".
- Major sections use "## " headings.
- Use "- " for bullet points.
- Separate paragraphs with a blank line.

Requirements:
- Return ONLY the document text. No code fences, no commentary, no HTML.
- Be clear, well-organized, and professional.
- Do not invent specific facts, dates, names, or links that were not provided.${styleBlock}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    // Strip a stray ``` fence if the model wraps the output.
    let text = result.text.trim();
    const fenced = text.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
    if (!text) {
      return { error: "The model returned an empty document." };
    }
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function selectionChatAction(
  selectedText: string,
  question: string,
  history: SelectionChatMessage[],
  sessionId: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    // Embedded Deterministic Engine: the ask-anything router handles the
    // request with the highlighted text as primary context — Q&A over the
    // selection (with conversational follow-ups and glossary-backed
    // definitions), plus every other intent (rubric, quiz on the selection,
    // practice problems, case study, announcement). No model call, no external
    // web. The exchange is logged the same way as the LLM path.
    if (provider === "embedded") {
      const replyText = (await routeRequest(question, history, { contextText: selectedText })).reply;
      let embeddedUserId: string | undefined;
      try {
        const supabase = await createClient();
        const { data: session } = await supabase.auth.getUser();
        embeddedUserId = session.user?.id;
      } catch {
        // Non-fatal — continue without a user ID.
      }
      void logChatExchange({
        sessionId,
        source: "selection",
        userMessage: question,
        assistantReply: replyText,
        contextText: selectedText,
        userId: embeddedUserId,
      });
      return replyText;
    }

    const systemPrompt = `You are a helpful teaching assistant. The user has highlighted the following text and has a question about it. Answer concisely and helpfully. Use plain prose only — do not use any markdown formatting, bold, italics, bullet points, headers, or special symbols.

HIGHLIGHTED TEXT:
"""
${selectedText}
"""`;

    const contents = [
      { role: "user" as const, parts: [{ text: systemPrompt }] },
      { role: "model" as const, parts: [{ text: "Understood. I'll answer questions about the highlighted text in plain prose with no formatting." }] },
      ...history.map((m) => ({ role: m.role as "user" | "model", parts: [{ text: m.text }] })),
      { role: "user" as const, parts: [{ text: question }] },
    ];

    const result = await callLlm(
      {
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Chat failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const replyText = result.text || "No response from the model.";

    // Log the user message and assistant reply to the database (non-blocking).
    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: session } = await supabase.auth.getUser();
      userId = session.user?.id;
    } catch {
      // Non-fatal — continue without a user ID.
    }

    void logChatExchange({
      sessionId,
      source: "selection",
      userMessage: question,
      assistantReply: replyText,
      contextText: selectedText,
      userId,
    });

    return replyText;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateCopilotProjectPromptAction(
  fileContent: string,
  fileName: string,
  provider: LlmProvider = "gemini"
): Promise<{ prompt: string } | { error: string }> {
  try {
    if (provider === "other") {
      const resp = await courseEngineCopilotPrompt(fileContent, fileName);
      return resp.prompt
        ? { prompt: resp.prompt }
        : { error: "Course Engine returned an empty prompt." };
    }

    // Embedded Deterministic Engine: template a Copilot prompt from the schedule
    // with no model call.
    if (provider === "embedded") {
      return { prompt: scaffoldCopilotPrompt(fileContent, fileName) };
    }

    const prompt = `You are an expert software engineering educator. A teacher has provided a course schedule (as a CSV or text file) and wants to create a hands-on software project that gives students practice with every topic and assignment in the course.

FILE NAME: ${fileName}

SCHEDULE CONTENT:
${fileContent}

Your task: Write a detailed GitHub Copilot prompt that the teacher can paste into GitHub Copilot (Agent mode) to scaffold a complete software project.

Before writing the prompt, analyze the schedule to identify:
1. Which weeks are review weeks (weeks with titles like "Review", "Exam Review", "Midterm Review", etc.) and what topics from prior weeks they cover.
2. Which weeks are test/exam weeks (weeks with titles like "Midterm", "Final", "Exam", "Quiz", etc.) and what topics those assessments cover.
3. The primary programming language and domain of the course (e.g., Python → data science; JavaScript → web development; Java → enterprise/Android; R → statistics/data analysis; SQL → data engineering) so the project can showcase skills that employers in that domain commonly want.

The project must:
- Be themed around employer-relevant skills for the course's language and domain (e.g., a data science pipeline and dashboard for Python courses, a full-stack web app for JavaScript courses, an Android app for Java courses) so students can showcase the project to prospective employers
- Include a frontend (a web UI, dashboard, or interactive interface) that is part of the project repository and deployed to Vercel
- Cover every topic listed in the schedule in roughly the same order
- Reference or incorporate each assignment described in the schedule
- Be realistic and buildable by a student over the course of the term
- Use a simple tech stack that deploys to Vercel out of the box — prefer Next.js for full-stack or data-heavy courses, or a plain HTML/CSS/JavaScript static site for lighter courses. First evaluate whether the course goals can be met entirely with Next.js, Vercel, and GitHub alone (e.g., static data, local state, file-based storage, or Vercel Edge/API routes). Only introduce additional services if the course goals genuinely cannot be achieved without them (for example, if the course requires a persistent relational database, real-time data, or authentication across users). When additional services are necessary, prioritize free tiers of tools that integrate natively with Vercel and GitHub — such as Supabase (PostgreSQL database, auth, storage, and realtime, with first-class Vercel and GitHub integrations and a generous free tier) — over self-hosted or paid infrastructure. Avoid any service that requires DevOps experience, paid plans at student scale, or complex setup beyond clicking "Connect to Vercel" in a dashboard. The architecture must be something a beginner can fork, deploy, and iterate on with zero DevOps experience

Assignment structure rules — the prompt MUST specify all of the following:
- There must be an "assignment0" folder that serves as an onboarding exercise. This assignment must walk students step-by-step through: (1) forking the repository, (2) deploying the fork to Vercel and getting a live preview URL, (3) creating a new branch, (4) opening the branch in GitHub Codespaces, (5) making a simple code change (e.g., changing a variable in a designated file to their own name so their name appears in the frontend), (6) running the unit tests for assignment0 using the Testing panel in GitHub Codespaces (not the terminal), (7) committing the change using the Source Control panel in GitHub Codespaces (not the terminal), (8) pushing the branch using the Source Control panel in GitHub Codespaces (not the terminal), (9) opening a pull request using the GitHub website, (10) verifying the Vercel preview deployment on the PR, (11) merging the PR using the GitHub website. The instructions for this assignment must be in assignment0/INSTRUCTIONS.md.
- Every assignment folder (assignment0, assignment1, assignment2, …) must live inside a single root-level "assignments/" directory (e.g., assignments/assignment0/, assignments/assignment1/, etc.). No assignment folder should exist outside of this directory.
- In each assignment folder there must be exactly ONE file that students edit to complete the assignment. All other files in the folder must be read-only scaffolding. The prompt must name the file students edit.
- Each assignment folder must contain an INSTRUCTIONS.md file with verbose, beginner-friendly instructions for that assignment, including several worked examples that illustrate the concepts WITHOUT giving away the solution. Examples should use different scenarios or data than the actual assignment tasks. All instructions throughout every INSTRUCTIONS.md file must guide students to use GitHub and GitHub Codespaces graphical interfaces (e.g., the Source Control panel for committing and pushing, the Testing panel for running tests, the GitHub website for pull requests and merging) rather than terminal commands wherever possible. Any step that can be accomplished through a UI must describe how to do so through the UI and must NOT instruct students to open the terminal.
- Each assignment folder must contain unit tests (e.g., test_assignment{N}.py, assignment{N}.test.js, etc.) that verify the student's implementation. Tests must import/require only the one file the student edits.
- The assignment files must be wired into the frontend so that the very act of a student completing their one editable assignment file — and nothing else — automatically unlocks the corresponding feature on the frontend. Students must NOT need to edit any configuration files, environment variables, feature flags, or any file outside their assignment folder for the unlock to take effect. The integration must work by having the frontend directly import or dynamically read only the student's assignment file at build or runtime (for example, the frontend imports the student's module and checks whether the exported function/class returns non-trivial output, or reads a value the student set). The prompt must specify this mechanism precisely: name the exact import/read path for each assignment file, describe what the frontend checks, and show how the UI state changes when the check passes. No manual wiring step should ever be required of the student beyond completing the assignment file itself.
- Review weeks (identified from the schedule) must have their own full assignment folder named "reviewN" containing: an INSTRUCTIONS.md with review guide and study materials describing exactly which topics and assignments are covered, one editable file students complete as a review exercise, unit tests that verify the review exercise, and the same frontend-unlock wiring as regular assignments. All instructions must follow the no-terminal rule above.
- Test/exam weeks (identified from the schedule) must also have their own full assignment folder named "examN" (or "midterm", "final", etc.) containing: an INSTRUCTIONS.md that describes the topics assessed and provides a practice exercise mirroring the exam format, one editable file students complete as a practice exercise, unit tests that verify the practice exercise, and the same frontend-unlock wiring as regular assignments. The project README must also note these weeks and the topics they assess. All instructions must follow the no-terminal rule above.

The prompt you write should be self-contained — someone should be able to paste it directly into GitHub Copilot Agent mode and get a fully scaffolded project back. Be specific about: the repository's top-level file structure, each assignment folder's contents (listing every file by name), the frontend framework and how it is structured, the Vercel configuration, how assignment completion unlocks frontend features, and how the project evolves week by week to match the schedule.

Return ONLY the prompt text — no preamble, no explanation, no markdown code fences. Just the raw prompt the teacher will paste into GitHub Copilot.`;

    const llmResult = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!llmResult.ok) {
      return { error: `Prompt generation failed: HTTP ${llmResult.status} — ${llmResult.body.slice(0, 200)}` };
    }

    const generated = llmResult.text;

    if (!generated.trim()) {
      return { error: "The model did not return a prompt. Please try again." };
    }

    return { prompt: generated.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateCourseRubricFromZipAction(
  zipBase64: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  const TEXT_EXTENSIONS = new Set([
    ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
    ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
    ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
  ]);

  const ASSIGNMENTS_PATTERN = /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;
  const MAX_FILE_CHARS = 3000;

  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(zipBase64, "base64");
    const zip = await JSZip.loadAsync(buffer);

    const allPaths = Object.keys(zip.files);

    const topFolders = new Set<string>();
    for (const path of allPaths) {
      const m = path.match(/^([^/]+)\//);
      if (m) topFolders.add(m[1]);
    }

    let assignmentsPrefix = "";
    for (const folder of topFolders) {
      if (ASSIGNMENTS_PATTERN.test(folder)) {
        assignmentsPrefix = folder + "/";
        break;
      }
    }

    if (!assignmentsPrefix) {
      for (const path of allPaths) {
        const m = path.match(/^[^/]+\/([^/]+)\//);
        if (m && ASSIGNMENTS_PATTERN.test(m[1])) {
          const firstSlash = path.indexOf("/");
          const secondSlash = path.indexOf("/", firstSlash + 1);
          if (firstSlash !== -1 && secondSlash !== -1) {
            assignmentsPrefix = path.slice(0, secondSlash + 1);
            break;
          }
        }
      }
    }

    if (!assignmentsPrefix) {
      return {
        error: "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const assignmentFolders = new Set<string>();
    for (const path of allPaths) {
      if (path.startsWith(assignmentsPrefix)) {
        const relative = path.slice(assignmentsPrefix.length);
        const parts = relative.split("/");
        if (parts.length >= 2 && parts[0]) {
          assignmentFolders.add(parts[0]);
        }
      }
    }

    if (assignmentFolders.size === 0) {
      return { error: "No assignment subfolders found inside the assignments folder." };
    }

    // Collect the README/instructions from every assignment
    const aggregatedInstructions: string[] = [];

    for (const folder of Array.from(assignmentFolders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    )) {
      const folderPrefix = assignmentsPrefix + folder + "/";
      const folderFiles = allPaths.filter((p) => p.startsWith(folderPrefix) && !zip.files[p].dir);

      const mdFiles = folderFiles.filter((p) => p.toLowerCase().endsWith(".md"));
      const readmeFile =
        mdFiles.find((p) => p.slice(folderPrefix.length).toLowerCase().startsWith("readme")) ??
        mdFiles[0];

      if (readmeFile) {
        try {
          let content = await zip.files[readmeFile].async("string");
          if (content.length > MAX_FILE_CHARS) {
            content = content.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
          }
          if (content.trim()) {
            aggregatedInstructions.push(`=== ${folder} ===\n${content.trim()}`);
          }
        } catch {
          // skip unreadable file
        }
      } else {
        // Fall back to any text file in the folder
        const textFiles = folderFiles.filter((p) => {
          const ext = p.includes(".") ? "." + p.split(".").pop()!.toLowerCase() : "";
          return TEXT_EXTENSIONS.has(ext);
        });
        for (const filePath of textFiles.slice(0, 2)) {
          try {
            let content = await zip.files[filePath].async("string");
            if (content.length > MAX_FILE_CHARS) {
              content = content.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
            }
            if (content.trim()) {
              aggregatedInstructions.push(`=== ${folder} ===\n${content.trim()}`);
              break;
            }
          } catch {
            // skip
          }
        }
      }
    }

    if (aggregatedInstructions.length === 0) {
      return { error: "No readable assignment instructions found in the uploaded zip." };
    }

    const aggregatedText = aggregatedInstructions.join("\n\n");
    return await generateRubric(aggregatedText, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate a course rubric from course description and schedule (used when
 * no repository is available). Returns the rubric text or an error.
 */
export async function generateCourseRubricFromScheduleAction(
  courseDescription: string,
  scheduleJson: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    await requireOwner();

    const { buildRubricSourceFromSchedule } = await import("@/app/utils/rubric");

    let schedule: ScheduleWeekPlan[] = [];
    try {
      const parsed = JSON.parse(scheduleJson);
      if (Array.isArray(parsed)) {
        schedule = parsed;
      }
    } catch {
      // Tolerate invalid/empty JSON by treating it as no schedule
    }

    const sourceText = buildRubricSourceFromSchedule(courseDescription, schedule);

    if (!sourceText.trim()) {
      return { error: "No course description or schedule provided to generate the rubric from." };
    }

    return await generateRubric(sourceText, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// researchCurrentEventsAction moved to ./current-events.ts (split out to keep
// this file under 1000 lines) - re-exported from actions.ts alongside this
// file's other exports.
