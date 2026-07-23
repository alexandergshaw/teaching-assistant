// Client-side step catalog: assignment quiz step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  createQuizQuestionAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { scaffoldQuizQuestions, renderQuizText } from "@/lib/embedded/quiz";

export const assignmentQuizSteps: StepDefinition[] = [
  {
    type: "generate-quiz-from-material",
    name: "Generate a quiz from material",
    description: "Generate cloze and multiple-choice questions (with a verbatim answer key) from the instructor's own material. Emits the questions as JSON for an LMS import step.",
    inputs: [
      { key: "material", label: "Source material", type: "longtext", required: true },
      { key: "count", label: "How many questions", type: "number", required: false, help: "Default 5." },
    ],
    outputs: [
      { key: "quiz", label: "Quiz (with answer key)", type: "longtext" },
      { key: "questionsJson", label: "Questions (JSON)", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const material = String(values.material ?? "").trim();
      if (!material) throw new Error("Provide the source material.");
      const countRaw = String(values.count ?? "").trim();
      const count = countRaw && Number.isInteger(Number(countRaw)) && Number(countRaw) > 0 ? Number(countRaw) : 5;

      onProgress("Generating quiz...");
      const questions = scaffoldQuizQuestions(material, count);
      const quiz = renderQuizText(questions);

      return {
        outputs: { quiz, questionsJson: JSON.stringify(questions) },
        summary: { kind: "text", text: quiz || "(no questions could be generated from this material)" },
      };
    },
  },

  {
    type: "import-quiz-questions",
    name: "Import questions into a quiz",
    description: "Create quiz questions in a Canvas quiz from a generated question set (JSON from Generate a quiz). Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "quizId", label: "Quiz id", type: "text", required: true, help: "The numeric Canvas quiz id." },
      { key: "questionsJson", label: "Questions (JSON)", type: "longtext", required: true, help: "Wired from Generate a quiz from material." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "created", label: "Questions created", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");

      const quizIdRaw = String(values.quizId ?? "").trim();
      if (!/^\d+$/.test(quizIdRaw)) throw new Error("Provide the numeric quiz id.");
      const quizId = Number(quizIdRaw);

      const raw = String(values.questionsJson ?? "").trim();
      if (!raw) throw new Error("Provide the questions JSON (wire it from Generate a quiz from material).");

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The questions JSON is not valid JSON.");
      }

      if (!Array.isArray(parsed)) throw new Error("The questions JSON must be an array.");

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Creating quiz questions...");
      let created = 0;
      const failures: string[] = [];

      for (let i = 0; i < parsed.length; i++) {
        const q = parsed[i] as { type?: string; prompt?: string; answer?: string; choices?: string[] };
        const prompt = String(q.prompt ?? "");
        const answer = String(q.answer ?? "");
        const question = (q.type === "multiple_choice" && Array.isArray(q.choices))
          ? { name: `Question ${i + 1}`, text: prompt, type: "multiple_choice_question" as const, points: 1, answers: q.choices.map((c) => ({ text: String(c), correct: String(c) === answer })) }
          : { name: `Question ${i + 1}`, text: prompt, type: "short_answer_question" as const, points: 1, answers: [{ text: answer, correct: true }] };
        const r = await createQuizQuestionAction(course, quizId, question, inst);
        if ("error" in r) {
          failures.push(`Question ${i + 1}: ${r.error}`);
        } else {
          created++;
        }
      }

      const items = failures.length ? failures : [`Created ${created} question(s).`];
      return { outputs: { created }, summary: { kind: "list", label: `Created ${created} of ${parsed.length} question(s)`, items } };
    },
  },
];
