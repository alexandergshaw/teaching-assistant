import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Group E, wave 3 - the four resolvers below now delegate credential
 * resolution to canvas-credentials.ts (resolveCanvasCredential) instead of
 * interpolating a client-supplied acronym into process.env themselves. Per
 * this wave's own brief and E-ARCH6 (docs/lms-credentials-acceptance-
 * criteria.md), and matching canvas-credentials.test.ts's own idiom: mock the
 * credential boundary at the module level and let canvas-core.ts's own
 * URL-matching / acronym-normalizing / error-collapsing logic run for real.
 * This file does not re-test resolveCanvasCredential's own branching (stored
 * vs. env vs. the one indistinguishable failure) - that is
 * canvas-credentials.test.ts's job - it only proves canvas-core.ts calls it
 * correctly and never re-introduces a process.env read of its own.
 */
vi.mock("./canvas-credentials", () => ({
  resolveCanvasCredential: vi.fn(),
  CANVAS_CREDENTIAL_REQUIRED_MESSAGE: "Connect your Canvas account for this institution in Settings.",
}));

import {
  resolveInstitution,
  resolveDefaultInstitution,
  resolveInstitutionByCode,
  resolveCourse,
  parseNextLink,
  canvasError,
  htmlToText,
  textToHtml,
  CANVAS_INSTITUTIONS,
} from "./canvas-core";
import { resolveCanvasCredential, CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "./canvas-credentials";

const mockResolveCanvasCredential = vi.mocked(resolveCanvasCredential);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CANVAS_INSTITUTIONS - the exported, credential-free lookup table", () => {
  it("still hardcodes MCC -> canvas.mccneb.edu (E10 - the fallback host must not move)", () => {
    expect(CANVAS_INSTITUTIONS).toEqual([
      { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
    ]);
  });
});

describe("resolveInstitution(url) - matches by host, then delegates", () => {
  it("resolves a known host by calling resolveCanvasCredential with that institution's code", async () => {
    mockResolveCanvasCredential.mockResolvedValue({
      source: "env",
      institution: "MCC",
      baseUrl: "https://canvas.mccneb.edu",
      token: "tok-123",
    });

    const result = await resolveInstitution("https://canvas.mccneb.edu/courses/55");

    expect(mockResolveCanvasCredential).toHaveBeenCalledWith("MCC");
    expect(result).toEqual({
      institution: { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
      token: "tok-123",
      baseUrl: "https://canvas.mccneb.edu",
    });
  });

  it("matches the host case-insensitively", async () => {
    mockResolveCanvasCredential.mockResolvedValue({
      source: "stored",
      institution: "MCC",
      baseUrl: "https://canvas.mccneb.edu",
      token: "tok",
    });

    await resolveInstitution("https://CANVAS.MCCNEB.EDU/courses/1");

    expect(mockResolveCanvasCredential).toHaveBeenCalledWith("MCC");
  });

  it("throws the ONE indistinguishable failure for an unrecognized host, never a list of configured hosts (E6)", async () => {
    await expect(resolveInstitution("https://canvas.somewhere-else.edu/courses/1")).rejects.toThrow(
      CANVAS_CREDENTIAL_REQUIRED_MESSAGE
    );
    // The old message ("Supported institutions: ...") named every configured
    // host outright - proving the resolver never reaches resolveCanvasCredential
    // for an unknown host is not enough; the failure text itself must carry
    // no institution names.
    expect(mockResolveCanvasCredential).not.toHaveBeenCalled();
  });

  it("throws the same failure for an unparseable URL", async () => {
    await expect(resolveInstitution("not-a-url")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
    expect(mockResolveCanvasCredential).not.toHaveBeenCalled();
  });

  it("propagates whatever resolveCanvasCredential throws for a recognized host with no credential", async () => {
    mockResolveCanvasCredential.mockRejectedValue(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE));

    await expect(resolveInstitution("https://canvas.mccneb.edu/courses/1")).rejects.toThrow(
      CANVAS_CREDENTIAL_REQUIRED_MESSAGE
    );
  });
});

describe("resolveDefaultInstitution() - first registered institution that resolves for the caller", () => {
  it("returns the first institution whose credential resolves", async () => {
    mockResolveCanvasCredential.mockResolvedValue({
      source: "stored",
      institution: "MCC",
      baseUrl: "https://canvas.mccneb.edu",
      token: "tok-456",
    });

    const result = await resolveDefaultInstitution();

    expect(mockResolveCanvasCredential).toHaveBeenCalledWith("MCC");
    expect(result).toEqual({
      institution: { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
      token: "tok-456",
      baseUrl: "https://canvas.mccneb.edu",
    });
  });

  it("throws the one indistinguishable failure when no registered institution resolves for the caller", async () => {
    mockResolveCanvasCredential.mockRejectedValue(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE));

    await expect(resolveDefaultInstitution()).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
    // Never the old message ("No Canvas API token is configured. Set
    // <CODE>_CANVAS_API_TOKEN...") which named an env var at a caller who
    // cannot set one (E7).
    expect(mockResolveCanvasCredential).toHaveBeenCalledTimes(CANVAS_INSTITUTIONS.length);
  });
});

describe("resolveInstitutionByCode(code) - normalizes, delegates, derives host for display", () => {
  it("trims and uppercases the code before delegating", async () => {
    mockResolveCanvasCredential.mockResolvedValue({
      source: "stored",
      institution: "ZZZ",
      baseUrl: "https://canvas.zzz.edu",
      token: "t",
    });

    const result = await resolveInstitutionByCode("  zzz  ");

    expect(mockResolveCanvasCredential).toHaveBeenCalledWith("ZZZ");
    expect(result).toEqual({
      institution: { code: "ZZZ", name: "ZZZ", host: "canvas.zzz.edu" },
      token: "t",
      baseUrl: "https://canvas.zzz.edu",
    });
  });

  it("throws describeInstitutionResolutionFailure() for an empty code, never the credential message", async () => {
    await expect(resolveInstitutionByCode("   ")).rejects.toThrow(
      "Could not determine which institution to use."
    );
    expect(mockResolveCanvasCredential).not.toHaveBeenCalled();
  });

  it("leaves host blank when the resolved base URL is malformed, rather than throwing", async () => {
    mockResolveCanvasCredential.mockResolvedValue({
      source: "env",
      institution: "ZZZ",
      baseUrl: "not a url",
      token: "t",
    });

    const result = await resolveInstitutionByCode("zzz");

    expect(result.institution.host).toBe("");
  });

  it("propagates the credential resolver's failure unchanged", async () => {
    mockResolveCanvasCredential.mockRejectedValue(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE));

    await expect(resolveInstitutionByCode("zzz")).rejects.toThrow(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });
});

describe("resolveCourse(courseUrl, code?) - parses the course id, then delegates institution resolution", () => {
  it("throws for a URL with no course id, without ever consulting a credential", async () => {
    await expect(resolveCourse("https://canvas.mccneb.edu/dashboard")).rejects.toThrow(
      "Could not read a course from that URL."
    );
    expect(mockResolveCanvasCredential).not.toHaveBeenCalled();
  });

  it("with an explicit code, resolves via resolveInstitutionByCode (not the URL host)", async () => {
    mockResolveCanvasCredential.mockResolvedValue({
      source: "stored",
      institution: "ZZZ",
      baseUrl: "https://canvas.zzz.edu",
      token: "t",
    });

    const result = await resolveCourse("https://canvas.mccneb.edu/courses/42", "zzz");

    expect(mockResolveCanvasCredential).toHaveBeenCalledWith("ZZZ");
    expect(result.courseId).toBe("42");
    expect(result.institution.code).toBe("ZZZ");
  });

  it("with no code, resolves via the URL's host through resolveInstitution", async () => {
    mockResolveCanvasCredential.mockResolvedValue({
      source: "env",
      institution: "MCC",
      baseUrl: "https://canvas.mccneb.edu",
      token: "t",
    });

    const result = await resolveCourse("https://canvas.mccneb.edu/courses/42");

    expect(mockResolveCanvasCredential).toHaveBeenCalledWith("MCC");
    expect(result.courseId).toBe("42");
  });
});

describe("parseNextLink - pure RFC-5988 Link header parsing, unchanged by this wave", () => {
  it("returns null for a missing header", () => {
    expect(parseNextLink(null)).toBeNull();
  });

  it("returns null when no rel=\"next\" entry is present", () => {
    expect(parseNextLink('<https://canvas.example.edu/api/v1/x?page=1>; rel="first"')).toBeNull();
  });

  it("extracts the next URL among multiple comma-separated links", () => {
    const header =
      '<https://canvas.example.edu/api/v1/x?page=1>; rel="first",' +
      '<https://canvas.example.edu/api/v1/x?page=3>; rel="next",' +
      '<https://canvas.example.edu/api/v1/x?page=5>; rel="last"';

    expect(parseNextLink(header)).toBe("https://canvas.example.edu/api/v1/x?page=3");
  });
});

describe("canvasError / htmlToText / textToHtml - pure helpers, unchanged by this wave", () => {
  it("canvasError names the institution's token env var on 401/403", () => {
    const inst = { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" };
    expect(canvasError(401, inst).message).toContain("MCC_CANVAS_API_TOKEN");
    expect(canvasError(403, inst).message).toContain("MCC_CANVAS_API_TOKEN");
  });

  it("canvasError has distinct messages for 404 and other statuses", () => {
    const inst = { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" };
    expect(canvasError(404, inst).message).toMatch(/could not find/i);
    expect(canvasError(500, inst).message).toMatch(/HTTP 500/);
  });

  it("htmlToText strips tags and normalizes whitespace", () => {
    expect(htmlToText("<p>Hello<br>world</p>")).toBe("Hello\nworld");
  });

  it("textToHtml wraps paragraphs and escapes markup characters", () => {
    expect(textToHtml("a < b\n\nc & d")).toBe("<p>a &lt; b</p><p>c &amp; d</p>");
  });
});
