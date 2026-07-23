import { describe, it, expect } from "vitest";
import {
  decideNewMessages,
  decideNewEmails,
} from "@/lib/workflow-triggers";
import type { Json } from "./supabase/types";

describe("decideNewMessages", () => {
  it("first eval records a baseline and does not fire", () => {
    const d = decideNewMessages(null, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z" } });
    expect(d.advanced).toEqual([]);
  });

  it("fires when a conversation's lastMessageAt advances to a lexicographically greater ISO string", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T15:00:00Z" }]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T15:00:00Z" } });
    expect(d.advanced).toEqual(["1"]);
  });

  it("does not fire when the lastMessageAt is unchanged", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z" } });
    expect(d.advanced).toEqual([]);
  });

  it("fires for a brand-new conversation appearing with a non-empty lastMessageAt on a non-first eval", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({
      convs: { "MCC:1": "2026-07-13T10:00:00Z", "MCC:2": "2026-07-13T12:00:00Z" },
    });
    expect(d.advanced).toEqual(["2"]);
  });

  it("a conversation with a null lastMessageAt is stored as empty string and never triggers by itself", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: null }]);
    expect(base.fired).toBe(false);
    expect(base.cursor).toEqual({ convs: { "MCC:1": "" } });
    expect(base.advanced).toEqual([]);
    const d = decideNewMessages(base.cursor, [{ institution: "MCC", id: 1, lastMessageAt: null }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "" } });
    expect(d.advanced).toEqual([]);
  });

  it("does not fire when conversations are steady with no changes", () => {
    const base = decideNewMessages(null, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    const d = decideNewMessages(base.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.advanced).toEqual([]);
  });

  it("legacy cursor { count: 3 } re-baselines silently without firing", () => {
    const d = decideNewMessages({ count: 3 } as unknown as Json, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z", "MCC:2": "2026-07-13T11:00:00Z" } });
    expect(d.advanced).toEqual([]);
    // The next tick should work normally
    const d2 = decideNewMessages(d.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d2.fired).toBe(true);
    expect(d2.advanced).toEqual(["2"]);
  });

  it("cursor round-trip: output from one call feeds into the next", () => {
    const d1 = decideNewMessages(null, [{ institution: "UT", id: 10, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d2 = decideNewMessages(d1.cursor, [
      { institution: "UT", id: 10, lastMessageAt: "2026-07-13T15:00:00Z" },
      { institution: "MPCC", id: 20, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d2.fired).toBe(true);
    expect(d2.cursor).toEqual({
      convs: { "UT:10": "2026-07-13T15:00:00Z", "MPCC:20": "2026-07-13T11:00:00Z" },
    });
    expect(d2.advanced).toEqual(["10", "20"]);
  });

  it("handles multiple institutions keyed correctly", () => {
    const d = decideNewMessages(null, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "UT", id: 1, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z", "UT:1": "2026-07-13T11:00:00Z" } });
  });

  it("advanced field contains ids as strings", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T15:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d.advanced).toEqual(["1", "2"]);
  });
});

describe("decideNewEmails", () => {
  it("first eval records a baseline and does not fire", () => {
    const d = decideNewEmails(null, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ emails: { "MCC:email-1": "2026-07-13T10:00:00Z" } });
    expect(d.advanced).toEqual([]);
  });

  it("fires when an email's receivedAt advances to a lexicographically greater ISO string", () => {
    const base = decideNewEmails(null, [{ institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewEmails(base.cursor, [{ institution: "MCC", id: "email-1", receivedAt: "2026-07-13T15:00:00Z" }]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ emails: { "MCC:email-1": "2026-07-13T15:00:00Z" } });
    expect(d.advanced).toEqual(["email-1"]);
  });

  it("does not fire when the receivedAt is unchanged", () => {
    const base = decideNewEmails(null, [{ institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewEmails(base.cursor, [{ institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ emails: { "MCC:email-1": "2026-07-13T10:00:00Z" } });
    expect(d.advanced).toEqual([]);
  });

  it("fires for a brand-new email appearing with a non-empty receivedAt on a non-first eval", () => {
    const base = decideNewEmails(null, [{ institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewEmails(base.cursor, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: "email-2", receivedAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({
      emails: { "MCC:email-1": "2026-07-13T10:00:00Z", "MCC:email-2": "2026-07-13T12:00:00Z" },
    });
    expect(d.advanced).toEqual(["email-2"]);
  });

  it("an email with a null receivedAt is stored as empty string and never triggers by itself", () => {
    const base = decideNewEmails(null, [{ institution: "MCC", id: "email-1", receivedAt: null }]);
    expect(base.fired).toBe(false);
    expect(base.cursor).toEqual({ emails: { "MCC:email-1": "" } });
    expect(base.advanced).toEqual([]);
    const d = decideNewEmails(base.cursor, [{ institution: "MCC", id: "email-1", receivedAt: null }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ emails: { "MCC:email-1": "" } });
    expect(d.advanced).toEqual([]);
  });

  it("does not fire when emails are steady with no changes", () => {
    const base = decideNewEmails(null, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: "email-2", receivedAt: "2026-07-13T11:00:00Z" },
    ]);
    const d = decideNewEmails(base.cursor, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: "email-2", receivedAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.advanced).toEqual([]);
  });

  it("legacy cursor { count: 3 } re-baselines silently without firing", () => {
    const d = decideNewEmails({ count: 3 } as unknown as Json, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: "email-2", receivedAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ emails: { "MCC:email-1": "2026-07-13T10:00:00Z", "MCC:email-2": "2026-07-13T11:00:00Z" } });
    expect(d.advanced).toEqual([]);
    const d2 = decideNewEmails(d.cursor, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: "email-2", receivedAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d2.fired).toBe(true);
    expect(d2.advanced).toEqual(["email-2"]);
  });

  it("cursor round-trip: output from one call feeds into the next", () => {
    const d1 = decideNewEmails(null, [{ institution: "UT", id: "msg-1", receivedAt: "2026-07-13T10:00:00Z" }]);
    const d2 = decideNewEmails(d1.cursor, [
      { institution: "UT", id: "msg-1", receivedAt: "2026-07-13T15:00:00Z" },
      { institution: "MPCC", id: "msg-2", receivedAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d2.fired).toBe(true);
    expect(d2.cursor).toEqual({
      emails: { "UT:msg-1": "2026-07-13T15:00:00Z", "MPCC:msg-2": "2026-07-13T11:00:00Z" },
    });
    expect(d2.advanced).toEqual(["msg-1", "msg-2"]);
  });

  it("handles multiple institutions keyed correctly", () => {
    const d = decideNewEmails(null, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" },
      { institution: "UT", id: "email-1", receivedAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.cursor).toEqual({ emails: { "MCC:email-1": "2026-07-13T10:00:00Z", "UT:email-1": "2026-07-13T11:00:00Z" } });
  });

  it("advanced field contains email ids as strings", () => {
    const base = decideNewEmails(null, [{ institution: "MCC", id: "email-1", receivedAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewEmails(base.cursor, [
      { institution: "MCC", id: "email-1", receivedAt: "2026-07-13T15:00:00Z" },
      { institution: "MCC", id: "email-2", receivedAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d.advanced).toEqual(["email-1", "email-2"]);
  });
});
