"use server";

// Concept Visualizer actions - split out of research.ts (which was at the
// 1000-line cap) so this module can grow with the deck-driven concept
// extraction action alongside the two original concept-page actions.
// Re-exported from actions.ts alongside research.ts's own exports, so every
// existing caller (steps.knowledge.ts's ensure-visualizer-pages step) keeps
// importing findVisualizerConceptAction / createVisualizerConceptAction from
// "@/app/actions" unchanged.
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { putFile, getFileText } from "@/lib/github";
import {
  TOPIC_ROUTES,
  TOPIC_TO_EXPORT_MAP,
  parseNavItems,
  matchConcept,
  insertNavLeaf,
  insertTopicPageCase,
  creatableTopics,
  topicByKey,
} from "@/lib/visualizer";
import {
  parseDeckConcepts,
  clampDeckConcepts,
  conceptsFromSlideTitles,
  type DeckConcept,
} from "@/lib/workflows/deck-concepts";

/**
 * Check if a concept exists on the visualizer.
 * Reads navItems.ts from the visualizer repo and returns the URL if found,
 * or { found: false } if not found.
 */
export async function findVisualizerConceptAction(
  concept: string
): Promise<
  { found: true; url: string; topic: string; slug: string; label: string } |
  { found: false } |
  { error: string }
> {
  try {
    await requireOwner();
    if (!concept.trim()) {
      return { found: false };
    }

    const navItemsContent = await getFileText("alexandergshaw", "programming-concept-visualizer", "components/pageComponents/navItems.ts");
    const entries = parseNavItems(navItemsContent);
    const match = matchConcept(entries, concept);

    if (!match) {
      return { found: false };
    }

    // Find the topic route by reverse-mapping from the export name
    let topicRoute: string | undefined;
    for (const [key, exportName] of Object.entries(TOPIC_TO_EXPORT_MAP)) {
      if (exportName === match.topicExport) {
        topicRoute = TOPIC_ROUTES[key];
        break;
      }
    }
    if (!topicRoute) {
      return { found: false };
    }

    const url = `https://programming-concept-visualizer.vercel.app${topicRoute}?concept=${encodeURIComponent(match.value)}`;
    return {
      found: true,
      url,
      topic: match.topicExport,
      slug: match.value,
      label: match.label,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find the visualizer concept." };
  }
}

/**
 * Create a new concept page on the visualizer.
 * Generates a React component, commits it to the repo, and updates navItems.ts and the topic page.
 * Returns the URL of the created concept or an error.
 *
 * The topic is picked ONLY from creatableTopics() - five of the fifteen
 * topic keys (html, php, typescript, deploying-a-website, github) are
 * UnderConstruction stubs with no nav array and no switch/case, so a concept
 * routed to one of them could never actually be committed. The topic's own
 * page path and concept-import prefix come from its VisualizerTopic entry,
 * which fixes SQL: the page actually rendered at /languages/sql is the
 * TOP-LEVEL components/pageComponents/SqlPage.tsx (there is no
 * SQL/SQLPage.tsx), and it imports concept components from "./SQL/", not "./".
 */
export async function createVisualizerConceptAction(
  concept: string,
  context: string = "",
  provider: LlmProvider = "gemini"
): Promise<{ url: string; slug: string; topic: string } | { error: string }> {
  try {
    await requireOwner();

    if (provider === "embedded") {
      return { error: "Creating visualizer pages requires an LLM provider." };
    }

    if (!concept.trim()) {
      return { error: "Enter a concept name." };
    }

    // Pick the best topic for the concept using LLM, offering only topics
    // that can actually receive a new concept.
    const topicKeys = creatableTopics().map((t) => t.key).join(", ");
    const topicPrompt = `Given the concept "${concept}"${context ? ` and context "${context}"` : ""}, choose the BEST category from: ${topicKeys}. Return ONLY the key (no other text).`;

    const topicResult = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: topicPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 50 },
      },
      provider
    );

    if (!topicResult.ok) {
      return { error: "Could not determine the best topic for this concept." };
    }

    const pickedKey = topicResult.text.trim().toLowerCase();
    const picked = topicByKey(pickedKey);
    const topic = picked && picked.creatable ? picked : topicByKey("programming-basics");
    if (!topic) {
      return { error: "Unknown topic mapping." };
    }

    // Generate the component
    const componentPrompt = `You are a React/TypeScript expert building educational concept visualizations.

Create a React component named "${concept.replace(/[^a-zA-Z0-9]/g, "")}Concept" that teaches "${concept}"${context ? ` with this context: "${context}"` : ""}.

Requirements:
- Export a default function component (no 'use client')
- Import ConceptWrapper, TableOfContents, Section, CalloutBox, CodeSnippet from components/common
- Structure: ConceptWrapper with title/description, wrapping TableOfContents with Sections
- Include at least: a "Big Idea" section with a CalloutBox, a "Code Walkthrough" section with CodeSnippet, and a "Common Mistakes" section
- Use ONLY theme tokens for colors: var(--ink), var(--info), var(--success), var(--warning), var(--danger), or themed MUI props
- NO hardcoded hex colors or emojis
- NO external imports except from components/common
- Valid TypeScript

Return ONLY the complete component code (starting with import statements).`;

    const componentResult = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: componentPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!componentResult.ok) {
      return { error: "Could not generate the component." };
    }

    let componentCode = componentResult.text.trim();

    // Validate the component (retry once on validation failure)
    let validationAttempt = 0;
    while (validationAttempt < 2) {
      const hasExportDefault = /export\s+default\s+function/.test(componentCode);
      const hasConceptWrapper = /ConceptWrapper/.test(componentCode);
      const hasHexColor = /#[0-9a-fA-F]{3,8}\b/.test(componentCode);

      if (hasExportDefault && hasConceptWrapper && !hasHexColor) {
        // Validation passed
        break;
      }

      validationAttempt++;
      if (validationAttempt < 2) {
        // Retry once
        const retryResult = await callLlm(
          {
            contents: [{ role: "user", parts: [{ text: componentPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          },
          provider
        );

        if (!retryResult.ok) {
          return { error: "Could not regenerate the component after validation failure." };
        }

        componentCode = retryResult.text.trim();
      } else {
        // Both attempts failed
        if (!hasExportDefault || !hasConceptWrapper) {
          return { error: "Generated component is invalid. Missing required structure." };
        }
        if (hasHexColor) {
          return { error: "Generated component contains hardcoded colors. Please regenerate." };
        }
      }
    }

    // Normalize the slug from the concept name
    const slug = concept
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!slug) {
      return { error: "Could not generate a valid slug from the concept name." };
    }

    const componentName = concept.replace(/[^a-zA-Z0-9]/g, "");
    const componentFileName = `${componentName}Concept.tsx`;
    const topicDirName = topic.conceptDir;

    // Read current navItems and the topic's OWN page (its pagePath, not a
    // guessed "<Dir>/<Dir>Page.tsx" - that guess is wrong for SQL).
    const navItemsContent = await getFileText("alexandergshaw", "programming-concept-visualizer", "components/pageComponents/navItems.ts");
    const topicPagePath = topic.pagePath;
    const topicPageContent = await getFileText("alexandergshaw", "programming-concept-visualizer", topicPagePath);

    const topicExportName = topic.navExport;

    const updatedNavItems = insertNavLeaf(navItemsContent, topicExportName, concept, slug);
    if (!updatedNavItems) {
      return { error: "Concept already exists or could not update navItems." };
    }

    // Update topic page - the import path uses the topic's own prefix (every
    // topic except SQL imports from "./"; SQL imports from "./SQL/").
    const updatedTopicPage = insertTopicPageCase(
      topicPageContent,
      `${componentName}Concept`,
      slug,
      `${topic.conceptImportPrefix}${componentName}Concept`
    );
    if (!updatedTopicPage) {
      return { error: "Could not update topic page." };
    }

    // Commit three files: component first, topic page second, navItems last
    const componentPath = `components/pageComponents/${topicDirName}/${componentFileName}`;
    await putFile("alexandergshaw", "programming-concept-visualizer", componentPath, componentCode, `feat(concepts): Add ${concept} concept component`);
    await putFile("alexandergshaw", "programming-concept-visualizer", topicPagePath, updatedTopicPage, `feat(concepts): Add ${concept} case to ${topicDirName}Page`);
    await putFile("alexandergshaw", "programming-concept-visualizer", "components/pageComponents/navItems.ts", updatedNavItems, `feat(concepts): Add ${concept} to navigation`);

    const url = `https://programming-concept-visualizer.vercel.app${topic.route}?concept=${encodeURIComponent(slug)}`;
    return { url, slug, topic: topic.key };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the visualizer concept." };
  }
}

// Deck text is sliced to this many characters before being sent to the
// model, matching the current-events research pipeline's DECK_TEXT_CHAR_CAP -
// a lecture deck can be long, and this keeps the prompt (and cost) bounded.
const DECK_TEXT_CHAR_CAP = 12000;

/**
 * Extract the teachable programming concepts a lecture deck actually covers.
 * Provider "embedded" derives concepts deterministically from slide titles
 * (no model call, never errors). Otherwise calls the LLM once and parses its
 * JSON; if that yields nothing, falls back to the slide-titles heuristic
 * before giving up - a total failure (both paths empty) is the only error.
 */
export async function extractDeckConceptsAction(
  deckText: string,
  maxConcepts: number,
  provider: LlmProvider = "gemini"
): Promise<{ concepts: DeckConcept[] } | { error: string }> {
  try {
    await requireOwner();

    const trimmedDeck = deckText.trim();
    if (!trimmedDeck) {
      return { error: "Provide a slide deck to analyze." };
    }

    const cap = clampDeckConcepts(maxConcepts);

    if (provider === "embedded") {
      const concepts = conceptsFromSlideTitles(trimmedDeck, cap);
      if (concepts.length === 0) {
        return { error: "Could not find any teachable concepts in this deck." };
      }
      return { concepts };
    }

    const prompt = `You are an expert programming instructor. Below is a lecture slide deck. List up to ${cap} distinct TEACHABLE PROGRAMMING CONCEPTS the deck actually teaches - the canonical name a learner would search for (for example "for loops", "list comprehension", "inner join"), NOT the slide titles verbatim and NOT course-admin topics like syllabus, grading or office hours. For each, quote the slide title or phrase that shows it. Return ONLY valid JSON: {"concepts":[{"concept":"...","evidence":"..."}]} - no markdown fences, no commentary.

SLIDE DECK:
${trimmedDeck.slice(0, DECK_TEXT_CHAR_CAP)}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      },
      provider
    );

    let concepts: DeckConcept[] = [];
    if (result.ok && result.text.trim()) {
      concepts = parseDeckConcepts(result.text, cap);
    }

    if (concepts.length === 0) {
      concepts = conceptsFromSlideTitles(trimmedDeck, cap);
    }

    if (concepts.length === 0) {
      return { error: "Could not find any teachable concepts in this deck." };
    }

    return { concepts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not extract concepts from the deck." };
  }
}
