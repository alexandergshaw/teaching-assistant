// Pins resolveDocumentAuthor's resolution order (BUG 3 / AC R1): an
// explicitly supplied display name, then the signed-in user's own auth
// metadata, then the deployment-wide NEXT_PUBLIC_DOC_AUTHOR override, then a
// neutral fallback that names no one. The previous implementation checked
// the env override FIRST and fell back to a hardcoded personal name
// ("Alex Shaw", the deployment owner) LAST, which meant every second
// person's generated document could be silently stamped with the owner's
// own name. This suite pins the ordering and the "no person's name" fact,
// not the exact spelling of the neutral fallback string itself.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveDocumentAuthor } from "./author";

describe("resolveDocumentAuthor", () => {
  const ENV_BEFORE = process.env.NEXT_PUBLIC_DOC_AUTHOR;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_DOC_AUTHOR;
  });

  afterEach(() => {
    if (ENV_BEFORE === undefined) {
      delete process.env.NEXT_PUBLIC_DOC_AUTHOR;
    } else {
      process.env.NEXT_PUBLIC_DOC_AUTHOR = ENV_BEFORE;
    }
  });

  describe("step 1: an explicitly supplied display name", () => {
    it("wins over everything else, including user metadata and the env override", () => {
      process.env.NEXT_PUBLIC_DOC_AUTHOR = "Deployment Default";
      const user = { email: "a@example.com", user_metadata: { full_name: "Metadata Name" } };

      expect(resolveDocumentAuthor(user, "Explicit Name")).toBe("Explicit Name");
    });

    it("is trimmed before use", () => {
      expect(resolveDocumentAuthor(null, "  Padded Name  ")).toBe("Padded Name");
    });

    it("an empty string is treated as absent and falls through to the next step", () => {
      const user = { email: "a@example.com", user_metadata: { full_name: "Metadata Name" } };
      expect(resolveDocumentAuthor(user, "")).toBe("Metadata Name");
    });

    it("a whitespace-only string is treated as absent and falls through", () => {
      const user = { email: "a@example.com", user_metadata: { full_name: "Metadata Name" } };
      expect(resolveDocumentAuthor(user, "   ")).toBe("Metadata Name");
    });

    it("null is treated as absent and falls through", () => {
      const user = { email: "a@example.com", user_metadata: { full_name: "Metadata Name" } };
      expect(resolveDocumentAuthor(user, null)).toBe("Metadata Name");
    });
  });

  describe("step 2: the signed-in user's own auth metadata", () => {
    it("is used when no display name was supplied", () => {
      const user = { email: "a@example.com", user_metadata: { full_name: "User Metadata Name" } };
      expect(resolveDocumentAuthor(user)).toBe("User Metadata Name");
    });

    it("prefers full_name over name when both are present", () => {
      const user = {
        email: "a@example.com",
        user_metadata: { full_name: "Full Name Wins", name: "Name Loses" },
      };
      expect(resolveDocumentAuthor(user)).toBe("Full Name Wins");
    });

    it("falls back to name when full_name is absent", () => {
      const user = { email: "a@example.com", user_metadata: { name: "Just A Name" } };
      expect(resolveDocumentAuthor(user)).toBe("Just A Name");
    });

    it("falls back to name when full_name is blank", () => {
      const user = { email: "a@example.com", user_metadata: { full_name: "   ", name: "Just A Name" } };
      expect(resolveDocumentAuthor(user)).toBe("Just A Name");
    });

    it("trims the resolved metadata name", () => {
      const user = { email: "a@example.com", user_metadata: { full_name: "  Padded  " } };
      expect(resolveDocumentAuthor(user)).toBe("Padded");
    });

    it("wins over the env override when both are available", () => {
      process.env.NEXT_PUBLIC_DOC_AUTHOR = "Deployment Default";
      const user = { email: "a@example.com", user_metadata: { full_name: "User Metadata Name" } };
      expect(resolveDocumentAuthor(user)).toBe("User Metadata Name");
    });

    it("ignores a non-string full_name/name value", () => {
      const user = {
        email: "a@example.com",
        user_metadata: { full_name: 12345 as unknown as string, name: null as unknown as string },
      };
      expect(resolveDocumentAuthor(user)).not.toBe("12345");
    });
  });

  describe("step 3: NEXT_PUBLIC_DOC_AUTHOR", () => {
    it("is used when there is no display name and no user metadata", () => {
      process.env.NEXT_PUBLIC_DOC_AUTHOR = "Deployment Default";
      expect(resolveDocumentAuthor(null)).toBe("Deployment Default");
    });

    it("is used when a user is supplied but has no usable metadata", () => {
      process.env.NEXT_PUBLIC_DOC_AUTHOR = "Deployment Default";
      const user = { email: "a@example.com", user_metadata: {} };
      expect(resolveDocumentAuthor(user)).toBe("Deployment Default");
    });

    it("is trimmed before use", () => {
      process.env.NEXT_PUBLIC_DOC_AUTHOR = "  Deployment Default  ";
      expect(resolveDocumentAuthor(null)).toBe("Deployment Default");
    });

    it("a blank override is treated as unset", () => {
      process.env.NEXT_PUBLIC_DOC_AUTHOR = "   ";
      const result = resolveDocumentAuthor(null);
      expect(result).not.toBe("");
      expect(result.trim()).toBe(result);
    });

    it("no longer runs ahead of the signed-in user's own name (the regression this fix closes)", () => {
      // Before the fix, NEXT_PUBLIC_DOC_AUTHOR was checked FIRST, so setting
      // it would silently overwrite every signed-in user's own name.
      process.env.NEXT_PUBLIC_DOC_AUTHOR = "Deployment Default";
      const user = { email: "a@example.com", user_metadata: { full_name: "Real Person" } };
      expect(resolveDocumentAuthor(user)).toBe("Real Person");
    });
  });

  describe("step 4: the neutral fallback", () => {
    it("is used when nothing else resolves", () => {
      const result = resolveDocumentAuthor();
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("is used for a null user and no display name", () => {
      const result = resolveDocumentAuthor(null, null);
      expect(result).toBeTruthy();
    });

    it("never contains a hardcoded person's name (the previous default was the deployment owner's own name)", () => {
      const result = resolveDocumentAuthor().toLowerCase();
      expect(result).not.toContain("alex");
      expect(result).not.toContain("shaw");
    });

    it("is distinct from any of the per-user/per-deployment sources - never used when one of them resolved", () => {
      const neutral = resolveDocumentAuthor();

      process.env.NEXT_PUBLIC_DOC_AUTHOR = "Deployment Default";
      expect(resolveDocumentAuthor(null)).not.toBe(neutral);

      delete process.env.NEXT_PUBLIC_DOC_AUTHOR;
      const user = { email: "a@example.com", user_metadata: { full_name: "Real Person" } };
      expect(resolveDocumentAuthor(user)).not.toBe(neutral);

      expect(resolveDocumentAuthor(null, "Explicit Name")).not.toBe(neutral);
    });

    it("is stable across repeated calls with no arguments (pure, no hidden state)", () => {
      expect(resolveDocumentAuthor()).toBe(resolveDocumentAuthor());
    });
  });

  describe("callers that pass no arguments at all (e.g. an attended action with no user in scope)", () => {
    it("does not throw", () => {
      expect(() => resolveDocumentAuthor()).not.toThrow();
    });
  });
});
