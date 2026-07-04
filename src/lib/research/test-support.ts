/**
 * Test support utilities for the research library.
 */

import type { KnowledgeRow } from "./db";

/**
 * Create a test KnowledgeRow with sensible defaults. Override any field as needed.
 */
export function makeKnowledgeRow(overrides: Partial<KnowledgeRow> = {}): KnowledgeRow {
  return {
    id: "x",
    kind: "case_study",
    source: "curated",
    title: "T",
    topics: [],
    summary: "",
    lesson: null,
    organization: null,
    year: null,
    language: null,
    difficulty: null,
    prompt: null,
    example_code: null,
    solution_code: null,
    url: null,
    verified: true,
    times_served: 0,
    last_served_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}
