import { describe, it, expect } from "vitest";
import {
  buildGenerateRequestBody,
  buildRegenerateRequestBody,
  selectedKinds,
  reduceGenerateResponse,
  deckDownloadFilename,
  readPersistedString,
  readPersistedJSON,
  writePersistedString,
  writePersistedJSON,
  CONTENT_ARTIFACT_KINDS,
  DEFAULT_ARTIFACT_SELECTION,
  type KeyValueStorage,
} from "./panel-logic";
import type {
  ArtifactSelection,
  PresentationContext,
  ProducedArtifact,
  RegenerateInput,
} from "@/lib/presentations/types";

const context: PresentationContext = {
  text: "Week 3: recursion",
  sources: [{ name: "syllabus.txt", text: "recursion basics" }],
};

const selection: ArtifactSelection = {
  outline: true,
  activities: false,
  deck: true,
  review: true,
};

describe("buildGenerateRequestBody", () => {
  it("assembles exactly context, selection, kind - the fresh-generate contract", () => {
    const body = buildGenerateRequestBody(context, selection, "outline");
    expect(body).toEqual({ context, selection, kind: "outline" });
  });
});

describe("buildRegenerateRequestBody", () => {
  it("adds mode:\"regenerate\" to the RegenerateInput fields, nothing else", () => {
    const input: RegenerateInput = {
      kind: "deck",
      priorContext: context,
      priorCritique: { text: "too dense" },
      priorContent: null,
      withReview: true,
    };
    const body = buildRegenerateRequestBody(input);
    expect(body).toEqual({ mode: "regenerate", ...input });
  });

  it("preserves a null priorCritique and priorContent rather than dropping them", () => {
    const input: RegenerateInput = {
      kind: "outline",
      priorContext: context,
      priorCritique: null,
      priorContent: null,
      withReview: false,
    };
    const body = buildRegenerateRequestBody(input);
    expect(body.priorCritique).toBeNull();
    expect(body.priorContent).toBeNull();
    expect(body.mode).toBe("regenerate");
  });
});

describe("selectedKinds", () => {
  it("returns only the selected content kinds, in CONTENT_ARTIFACT_KINDS order", () => {
    expect(selectedKinds(selection)).toEqual(["outline", "deck"]);
  });

  it("returns an empty array when nothing is selected", () => {
    expect(selectedKinds({ outline: false, activities: false, deck: false, review: true })).toEqual(
      []
    );
  });

  it("returns all three when everything is selected", () => {
    expect(
      selectedKinds({ outline: true, activities: true, deck: true, review: false })
    ).toEqual([...CONTENT_ARTIFACT_KINDS]);
  });

  it("review never appears in the fetch plan - it is not a fourth content kind", () => {
    const kinds = selectedKinds(DEFAULT_ARTIFACT_SELECTION);
    expect(kinds).not.toContain("review");
  });
});

describe("reduceGenerateResponse", () => {
  const producedArtifact: ProducedArtifact = {
    kind: "outline",
    content: { markdown: "# Week 3" },
    critique: null,
  };

  it("200 + status:ok surfaces the artifact, defaulting reviewSkipped to false when absent", () => {
    const outcome = reduceGenerateResponse(200, { status: "ok", artifact: producedArtifact });
    expect(outcome).toEqual({ phase: "ok", artifact: producedArtifact, reviewSkipped: false });
  });

  it("200 + status:ok surfaces reviewSkipped:true from the body (B2 - a time-skipped critique is distinct from a null critique that ran)", () => {
    const outcome = reduceGenerateResponse(200, {
      status: "ok",
      artifact: producedArtifact,
      reviewSkipped: true,
    });
    expect(outcome).toEqual({ phase: "ok", artifact: producedArtifact, reviewSkipped: true });
  });

  it("a 200 with a malformed body is NOT treated as success", () => {
    const outcome = reduceGenerateResponse(200, { status: "ok" });
    expect(outcome.phase).toBe("error");
  });

  it("401 surfaces a signed-out message and is retryable", () => {
    const outcome = reduceGenerateResponse(401, { status: "error", error: "Not signed in" });
    expect(outcome).toEqual({ phase: "error", message: "Not signed in", retryable: true });
  });

  it("502 (generation failed) surfaces the server's error text and is retryable", () => {
    const outcome = reduceGenerateResponse(502, {
      status: "error",
      kind: "deck",
      error: "The AI did not return usable content for this artifact.",
    });
    expect(outcome).toEqual({
      phase: "error",
      message: "The AI did not return usable content for this artifact.",
      retryable: true,
    });
  });

  it("504 (deadline/partial) surfaces the timeout message and offers retry", () => {
    const outcome = reduceGenerateResponse(504, {
      status: "error",
      error: "Ran out of time.",
      partial: true,
    });
    expect(outcome).toEqual({ phase: "error", message: "Ran out of time.", retryable: true });
  });

  it("400 (bad input) is NOT retryable", () => {
    const outcome = reduceGenerateResponse(400, { status: "error", error: "Bad input." });
    expect(outcome).toEqual({ phase: "error", message: "Bad input.", retryable: false });
  });

  it("falls back to a generic message when the error body is missing entirely", () => {
    const outcome = reduceGenerateResponse(502, undefined);
    expect(outcome.phase).toBe("error");
    if (outcome.phase === "error") {
      expect(outcome.message.length).toBeGreaterThan(0);
    }
  });

  it("an unrecognized status still reports an error, never a silent success", () => {
    const outcome = reduceGenerateResponse(500, { status: "error", error: "boom" });
    expect(outcome).toEqual({ phase: "error", message: "boom", retryable: true });
  });
});

describe("deckDownloadFilename", () => {
  it("sanitizes a plain title into a .pptx filename", () => {
    expect(deckDownloadFilename("Week 3 Recursion")).toBe("Week-3-Recursion.pptx");
  });

  it("strips characters outside the safe set", () => {
    expect(deckDownloadFilename("Week 3: Recursion & Loops!")).toBe(
      "Week-3-Recursion-Loops.pptx"
    );
  });

  it("falls back to presentation.pptx for an empty/whitespace-only title", () => {
    expect(deckDownloadFilename("   ")).toBe("presentation.pptx");
    expect(deckDownloadFilename("")).toBe("presentation.pptx");
  });
});

function makeStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe("persisted string round-trip", () => {
  it("writes then reads back the same string", () => {
    const storage = makeStorage();
    writePersistedString(storage, "ta-pres-context-text", "hello world");
    expect(readPersistedString(storage, "ta-pres-context-text", "")).toBe("hello world");
  });

  it("returns the fallback when the key is absent", () => {
    const storage = makeStorage();
    expect(readPersistedString(storage, "missing", "fallback")).toBe("fallback");
  });

  it("returns the fallback when getItem throws", () => {
    const storage: KeyValueStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {},
    };
    expect(readPersistedString(storage, "k", "fallback")).toBe("fallback");
  });

  it("swallows a setItem failure rather than throwing", () => {
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("quota exceeded");
      },
    };
    expect(() => writePersistedString(storage, "k", "v")).not.toThrow();
  });
});

describe("persisted JSON round-trip", () => {
  it("writes then reads back an ArtifactSelection object", () => {
    const storage = makeStorage();
    writePersistedJSON(storage, "ta-pres-selection", selection);
    expect(readPersistedJSON(storage, "ta-pres-selection", DEFAULT_ARTIFACT_SELECTION)).toEqual(
      selection
    );
  });

  it("falls back on corrupt JSON instead of throwing", () => {
    const storage = makeStorage({ "ta-pres-sources": "{not json" });
    expect(readPersistedJSON(storage, "ta-pres-sources", [])).toEqual([]);
  });

  it("falls back when the key is absent", () => {
    const storage = makeStorage();
    expect(readPersistedJSON(storage, "ta-pres-sources", [])).toEqual([]);
  });
});
