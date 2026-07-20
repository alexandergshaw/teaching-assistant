import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserStyle, saveUserStyle, clearVoiceClone, clearWritingSample } from "./user-style";

// Mock SupabaseClient behavior
const createMockSupabase = () => {
  const mockFrom = vi.fn();
  const supabase = {
    from: mockFrom,
  } as unknown as SupabaseClient;

  return { supabase, mockFrom };
};

describe("user-style", () => {
  describe("getUserStyle", () => {
    it("returns null when no row exists", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      });

      const result = await getUserStyle(supabase, "user-123");
      expect(result).toBeNull();
    });

    it("coerces row data to UserStyle interface", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const rowData = {
        voice_id: "voice-abc",
        voice_sample_path: "/path/to/sample.mp3",
        voice_sample_name: "sample.mp3",
        writing_sample: "This is my writing style.",
      };

      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: rowData, error: null }),
          }),
        }),
      });

      const result = await getUserStyle(supabase, "user-123");
      expect(result).toEqual({
        voiceId: "voice-abc",
        voiceSamplePath: "/path/to/sample.mp3",
        voiceSampleName: "sample.mp3",
        writingSample: "This is my writing style.",
      });
    });

    it("coerces null fields correctly", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const rowData = {
        voice_id: null,
        voice_sample_path: null,
        voice_sample_name: null,
        writing_sample: null,
      };

      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: rowData, error: null }),
          }),
        }),
      });

      const result = await getUserStyle(supabase, "user-123");
      expect(result).toEqual({
        voiceId: null,
        voiceSamplePath: null,
        voiceSampleName: null,
        writingSample: null,
      });
    });

    it("logs error and returns null on query error", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "DB error" } }),
          }),
        }),
      });

      const result = await getUserStyle(supabase, "user-123");
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[user-style] Could not read user style:",
        "DB error"
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("saveUserStyle", () => {
    it("upserts with all fields provided", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert: upsertSpy,
      });

      await saveUserStyle(supabase, "user-123", {
        voiceId: "voice-xyz",
        voiceSamplePath: "/path/sample.mp3",
        voiceSampleName: "sample.mp3",
        writingSample: "My writing style.",
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-123",
          voice_id: "voice-xyz",
          voice_sample_path: "/path/sample.mp3",
          voice_sample_name: "sample.mp3",
          writing_sample: "My writing style.",
        }),
        { onConflict: "user_id" }
      );
    });

    it("merges only provided fields, omitting undefined fields", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert: upsertSpy,
      });

      await saveUserStyle(supabase, "user-123", {
        voiceId: "voice-new",
        // voiceSamplePath and voiceSampleName not provided - should not be in upsert row
        // writingSample not provided - should not be in upsert row
      });

      const callArg = upsertSpy.mock.calls[0][0];
      expect(callArg.user_id).toBe("user-123");
      expect(callArg.voice_id).toBe("voice-new");
      expect(callArg.voice_sample_path).toBeUndefined();
      expect(callArg.voice_sample_name).toBeUndefined();
      expect(callArg.writing_sample).toBeUndefined();
    });

    it("handles null values correctly (clearing fields)", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert: upsertSpy,
      });

      await saveUserStyle(supabase, "user-123", {
        voiceId: null,
        voiceSamplePath: null,
        voiceSampleName: null,
      });

      const callArg = upsertSpy.mock.calls[0][0];
      expect(callArg.voice_id).toBeNull();
      expect(callArg.voice_sample_path).toBeNull();
      expect(callArg.voice_sample_name).toBeNull();
    });

    it("throws on upsert error", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      mockFrom.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: "Upsert failed" } }),
      });

      await expect(
        saveUserStyle(supabase, "user-123", { writingSample: "text" })
      ).rejects.toThrow("Could not save user style: Upsert failed");
    });
  });

  describe("clearVoiceClone", () => {
    it("clears voice-related fields", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert: upsertSpy,
      });

      await clearVoiceClone(supabase, "user-123");

      const callArg = upsertSpy.mock.calls[0][0];
      expect(callArg.voice_id).toBeNull();
      expect(callArg.voice_sample_path).toBeNull();
      expect(callArg.voice_sample_name).toBeNull();
    });
  });

  describe("clearWritingSample", () => {
    it("clears writing_sample field", async () => {
      const { supabase, mockFrom } = createMockSupabase();
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert: upsertSpy,
      });

      await clearWritingSample(supabase, "user-123");

      const callArg = upsertSpy.mock.calls[0][0];
      expect(callArg.writing_sample).toBeNull();
      // Other fields should not be set
      expect(callArg.voice_id).toBeUndefined();
      expect(callArg.voice_sample_path).toBeUndefined();
    });
  });
});
