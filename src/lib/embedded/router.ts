/**
 * The deterministic "ask anything" router. The most LLM-like thing about an
 * LLM is a single text box that does everything; this is the engine's version:
 * a freeform request is classified by rule into an intent — draft an
 * announcement, generate a rubric, practice problems, a case study, quiz
 * questions, define a term, summarize, or plain Q&A — and dispatched to the
 * engine's existing deterministic capabilities. Powers the chat FAB under the
 * embedded provider.
 *
 * No external web calls: knowledge comes from the pasted conversation, the
 * stored knowledge base, the glossary, and the rubric bank. When nothing can
 * answer, the reply says so honestly.
 */

import { answerFromContext, DEFINE_INTENT, NO_MATCH_REPLY, type ChatTurn } from "./answer";
import { scaffoldAnnouncement } from "./communication";
import { renderQuizText, scaffoldQuizQuestions } from "./quiz";
import { generateEmbeddedRubricText } from "@/lib/embedded-grader/rubric";
import { findRubricForTopic } from "@/lib/research/rubric-bank";
import { findCaseStudyMaterial, findPracticeProblems, searchStoredKnowledge } from "@/lib/research";
import { answerFromGlossary } from "@/lib/research/glossary";

export interface RoutedReply {
  intent:
    | "announcement"
    | "rubric"
    | "quiz"
    | "practice_problems"
    | "case_study"
    | "define"
    | "qa"
    | "knowledge"
    | "guidance";
  reply: string;
}

export const GUIDANCE_REPLY =
  "The embedded deterministic engine runs locally. Ask it to draft an announcement, generate a rubric, share practice problems or a case study on a topic, quiz you on pasted material, define a term, or answer questions about text you paste into this chat. For open-ended conversation, switch the provider toggle to an LLM (Gemini).";

const IS_ANNOUNCEMENT = /\b(?:draft|write|make|create|compose)\b[\s\S]*\bannouncements?\b/i;
const IS_RUBRIC = /\b(?:draft|write|make|create|compose|generate|build)\b[\s\S]*\brubrics?\b/i;
const IS_QUIZ = /\bquiz\b|\btest me\b|\bflash ?cards?\b/i;
const IS_PRACTICE = /\bpractice (?:problems?|questions?|exercises?)\b|\bexercises?\b/i;
const IS_CASE_STUDY = /\bcase stud(?:y|ies)\b|\breal[- ]world (?:example|story)\b/i;

/** The subject of a request: the words after its lead-in preposition. */
function topicOf(message: string, keyword: RegExp): string {
  const afterKeyword = new RegExp(
    `${keyword.source}\\s*(?:that|about|on|for|regarding|covering|saying)?\\s*[:,-]?\\s*(.+)$`,
    "i"
  ).exec(message);
  const tail = afterKeyword?.[1] ?? /(?:about|on|for|regarding|covering)\s+(.+)$/i.exec(message)?.[1] ?? "";
  return tail.replace(/["'.?!]+$/g, "").trim();
}

/** The material the user has pasted into this conversation so far. */
function pastedMaterial(history: ChatTurn[]): string {
  return history
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text)
    .join("\n\n");
}

function renderPracticeProblems(problems: Awaited<ReturnType<typeof findPracticeProblems>>): string {
  return problems
    .map((p) =>
      [
        `Practice problem: ${p.title}`,
        p.prompt,
        "",
        "Worked example (not the solution):",
        p.exampleCode,
        "",
        "Solution:",
        p.solutionCode,
      ].join("\n")
    )
    .join("\n\n---\n\n");
}

/** Classify a freeform request and dispatch it to the engine's capabilities. */
export async function routeRequest(message: string, history: ChatTurn[] = []): Promise<RoutedReply> {
  const trimmed = message.trim();
  if (!trimmed) return { intent: "guidance", reply: GUIDANCE_REPLY };
  const corpus = pastedMaterial(history);

  if (IS_ANNOUNCEMENT.test(trimmed)) {
    const content = topicOf(trimmed, /\bannouncements?\b/);
    if (content.split(/\s+/).length < 3) {
      return {
        intent: "announcement",
        reply: "Tell me what the announcement should say (for example: draft an announcement that the midterm moved to Friday).",
      };
    }
    const draft = scaffoldAnnouncement(content);
    return { intent: "announcement", reply: `Title: ${draft.title}\n\n${draft.message}` };
  }

  if (IS_RUBRIC.test(trimmed)) {
    const topic = topicOf(trimmed, /\brubrics?\b/) || corpus;
    if (!topic.trim()) {
      return {
        intent: "rubric",
        reply: "Tell me what the rubric should grade (for example: make a rubric for a python assignment on loops).",
      };
    }
    const banked = await findRubricForTopic(topic);
    const rubric = banked ?? generateEmbeddedRubricText(topic);
    const lead = banked
      ? "Here is a rubric you previously used for a matching topic:"
      : "Here is a rubric generated from your request:";
    return { intent: "rubric", reply: `${lead}\n\n${rubric}` };
  }

  if (IS_QUIZ.test(trimmed)) {
    // Quiz from pasted material when there is enough of it; otherwise from what
    // the knowledge base holds on the topic.
    let material = corpus.trim().split(/\s+/).filter(Boolean).length >= 20 ? corpus : "";
    if (!material) {
      const topic = topicOf(trimmed, /\b(?:quiz|test me|flash ?cards?)\b/) || trimmed;
      const stored = await searchStoredKnowledge(topic, { limit: 5 });
      material = stored.map((r) => r.summary).join(" ");
    }
    const questions = scaffoldQuizQuestions(material, 5);
    if (questions.length === 0) {
      return {
        intent: "quiz",
        reply: "I couldn't find enough factual material to quiz you on. Paste the material into this chat and ask again.",
      };
    }
    return {
      intent: "quiz",
      reply: `Here are ${questions.length} questions generated from the material:\n\n${renderQuizText(questions)}`,
    };
  }

  if (IS_PRACTICE.test(trimmed)) {
    const topic = topicOf(trimmed, /\b(?:problems?|questions?|exercises?)\b/) || trimmed;
    const problems = await findPracticeProblems(topic, 2);
    if (problems.length === 0) {
      return {
        intent: "practice_problems",
        reply: `I don't have verified practice problems on that topic yet. The knowledge base grows as it is used, so try again later or ask about another topic.`,
      };
    }
    return { intent: "practice_problems", reply: renderPracticeProblems(problems) };
  }

  if (IS_CASE_STUDY.test(trimmed)) {
    const topic = topicOf(trimmed, /\bcase stud(?:y|ies)\b|\bexample\b|\bstory\b/) || trimmed;
    const material = await findCaseStudyMaterial(topic);
    if (!material) {
      return {
        intent: "case_study",
        reply: "I don't have a case study on that topic yet. The knowledge base grows as it is used, so try again later or ask about another topic.",
      };
    }
    return { intent: "case_study", reply: `${material.title}\n\n${material.bullets.join("\n")}` };
  }

  // Definition questions: the pasted material answers first (inside the QA path
  // below), the glossary second — checked here so a define question without
  // pasted material still gets the instructor's own definition.
  const hasCorpus = corpus.trim().split(/\s+/).filter(Boolean).length >= 20;
  if (DEFINE_INTENT.test(trimmed) && !hasCorpus) {
    const fromGlossary = await answerFromGlossary(trimmed);
    if (fromGlossary) return { intent: "define", reply: fromGlossary };
  }

  // Plain Q&A over pasted material (summaries, definitions, retrieval).
  if (hasCorpus) {
    const answer = answerFromContext(trimmed, corpus, history);
    if (answer !== NO_MATCH_REPLY) return { intent: "qa", reply: answer };
    const fromGlossary = await answerFromGlossary(trimmed);
    if (fromGlossary) return { intent: "define", reply: fromGlossary };
  }

  // Last knowledge layer: what the stored knowledge base knows about the topic.
  const stored = await searchStoredKnowledge(trimmed, { limit: 2 });
  if (stored.length > 0) {
    const parts = stored.map((r) => `${r.title}: ${r.summary}${r.url ? ` (${r.url})` : ""}`);
    return {
      intent: "knowledge",
      reply: `Here is what I know about that:\n\n${parts.join("\n\n")}`,
    };
  }

  return { intent: "guidance", reply: hasCorpus ? NO_MATCH_REPLY : GUIDANCE_REPLY };
}
