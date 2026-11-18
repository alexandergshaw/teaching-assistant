import { expect, it } from "vitest";
import { notebookFeedbackClaimsRuntime } from "./notebook-unobserved-runtime";
it.each(["The notebook ran successfully.", "The code runs without errors.", "The test suite passed.", "The results are reproducible.", "I executed the notebook."])("recognizes unobserved runtime claim %s", (text) => expect(notebookFeedbackClaimsRuntime(text)).toBe(true));
it.each(["The saved chart shows the frontier.", "Your source defines five strategies.", "Explain your assumptions."])("allows static feedback %s", (text) => expect(notebookFeedbackClaimsRuntime(text)).toBe(false));
