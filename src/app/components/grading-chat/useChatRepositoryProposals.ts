"use client";
import { useEffect, useState } from "react";
import type { RepositoryCollectRequest, RepositoryCollectResponse, RepositoryEvidenceSource } from "@/lib/grade/repository-evidence-types";
import { ITEM_REQUEST_BYTE_BUDGET } from "../grading/incrementalRunPlan";
import { collectionMatches, collectionRequest, confirmRepositoryMapping, freezeCollection, stagedItemId, studentKeyId } from "./chatRepositoryProposals";
import type { RepositoryEvidenceState } from "./chatRepositoryBatch";
import type { RepositorySessionStudent } from "./continuousRepositoryAdapter";
import type { ContinuousRepositoryAdapter } from "./continuousRepositoryAdapter";
import { createRepositoryWorkflow, type RepositoryModelTransport, type RepositoryWorkflowCounts, type RepositoryWorkflowOperation } from "./chatRepositoryWorkflow";
import type { RepositoryProposeResponse, RepositoryReviewResponse } from "@/lib/grade/repository-evidence-types";

export type CollectionState = { status: "needs_collection" | "pending" | "collected" | "failed"; error?: string; response?: RepositoryCollectResponse };
export const REPOSITORY_COLLECTION_BATCH_STUDENTS = 3;
export type RepositoryCollectTransport = (request: RepositoryCollectRequest, signal: AbortSignal) => Promise<RepositoryCollectResponse>;
export async function postRepositoryCollection(request: RepositoryCollectRequest, signal: AbortSignal): Promise<RepositoryCollectResponse> {
  const response = await fetch("/api/grading-chat-repository", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal });
  if (!response.ok) throw new Error("Repository collection failed.");
  return await response.json() as RepositoryCollectResponse;
}

interface RepositoryProposalParams {
  driver?: ContinuousRepositoryAdapter;
  modelTransport?: RepositoryModelTransport;
  onWorkflowSettled?: (operation: RepositoryWorkflowOperation, success: boolean, startedAtMs: number, counts: RepositoryWorkflowCounts) => void;
  sessionEpoch: string; evidence: RepositoryEvidenceState; students: () => readonly RepositorySessionStudent[];
  collect?: RepositoryCollectTransport;
  onSettled?: (success: boolean, response: RepositoryCollectResponse | undefined, startedAtMs: number, acceptedLinks: number) => void;
}

function createRepositoryController(initial: RepositoryProposalParams) {
  let params = initial;
  const current = { epoch: params.sessionEpoch, mappings: new Map<string, RepositoryEvidenceSource>(), collections: new Map<string, CollectionState>(),
    revision: 0, attempt: 0, batch: null as object | null,
    active: null as { controller: AbortController; signature: string; studentId: string } | null, attempts: new Map<string, { signature: string; count: number }>() };
  let publish: (next: ReturnType<typeof snapshot>) => void = () => {};
  const eligibleCollection = (id: string): RepositoryCollectResponse | undefined => {
    const collection = current.collections.get(id);
    if (collection?.status !== "collected" || !collection.response) return undefined;
    const mappings = [...current.mappings.values()].filter((mapping) => studentKeyId(mapping.studentKey) === id);
    return mappings.length > 0 && JSON.stringify(mappings) === JSON.stringify(collection.response.mappings) ? collection.response : undefined;
  };
  const workflows: ReturnType<typeof createRepositoryWorkflow> = createRepositoryWorkflow({
    context: () => ({ epoch: current.epoch, driver: params.driver, collection: eligibleCollection,
      collections: [...current.collections.keys()].flatMap((id) => { const response = eligibleCollection(id); return response ? [response] : []; }),
      retainedBytes: new TextEncoder().encode(JSON.stringify([[...current.collections], [...workflows.states]])).byteLength + params.students().reduce((sum, student) => sum + student.retainedBytes, 0) }),
    reserve: (studentId) => {
      if (current.active || current.batch) return null;
      const active = { controller: new AbortController(), signature: "workflow", studentId }; current.active = active;
      return { signal: active.controller.signal, current: () => current.active === active,
        release: () => { if (current.active === active) current.active = null; } };
    },
    transport: () => params.modelTransport ?? (async (request, signal) => {
      const response = await fetch("/api/grading-chat-repository", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal });
      if (!response.ok) throw new Error("Repository operation failed");
      const text = await response.text(); if (new TextEncoder().encode(text).byteLength > 262_144) throw new Error("Repository response limit");
      return JSON.parse(text) as RepositoryProposeResponse | RepositoryReviewResponse;
    }),
    publish: () => refresh(), record: (operation, success, start, counts) => params.onWorkflowSettled?.(operation, success, start, counts),
  });
  const invalidate = () => { current.active?.controller.abort(); current.active = null; current.batch = null; current.collections.clear(); current.attempts.clear(); workflows.reset(); };
  const invalidateTarget = (id: string) => {
    workflows.invalidate(id);
    current.batch = null;
    if (current.active?.studentId === id) { current.active.controller.abort(); current.active = null; }
    const response = current.collections.get(id)?.response;
    current.collections.set(id, { status: "needs_collection", response });
    current.attempts.delete(id);
  };
  const sync = (next: RepositoryProposalParams) => {
    params = next;
    let changed = false;
    if (current.epoch !== params.sessionEpoch) { invalidate(); current.epoch = params.sessionEpoch; current.mappings.clear(); changed = true; }
    const liveIds = new Set(params.evidence.lines.filter((line) => line.status === "accepted").map(stagedItemId));
    for (const [id, mapping] of current.mappings) if (!liveIds.has(id)) { invalidateTarget(studentKeyId(mapping.studentKey)); current.mappings.delete(id); changed = true; }
    if (workflows.sync()) changed = true;
    if (current.active?.signature === "workflow" && workflows.states.get(current.active.studentId)?.stale) { current.active.controller.abort(); current.active = null; changed = true; }
    if (changed) refresh();
  };
  const refresh = () => publish(snapshot());
  const reset = () => { invalidate(); current.mappings.clear(); current.revision += 1; refresh(); };
  const confirm = (choices: readonly { id: string; studentId: string; ref?: string; path?: string }[]): boolean => {
    const next = new Map<string, RepositoryEvidenceSource | null>();
    for (const choice of choices) {
      const line = params.evidence.lines.find((item) => stagedItemId(item) === choice.id && item.status === "accepted");
      if (!line) return false;
      if (!choice.studentId) { next.set(choice.id, null); continue; }
      const student = params.students().find((item) => studentKeyId(item.key) === choice.studentId && item.key.sessionEpoch === current.epoch);
      if (!student) return false;
      const mapping = confirmRepositoryMapping(line, student, current.revision + 1, choice.ref, choice.path);
      if (!mapping) return false;
      next.set(choice.id, mapping);
    }
    if (!next.size) return false;
    const same = (left: RepositoryEvidenceSource | undefined, right: RepositoryEvidenceSource | null) =>
      JSON.stringify(left ? { ...left, mappingRevision: 0 } : null) === JSON.stringify(right ? { ...right, mappingRevision: 0 } : null);
    const changes = [...next].filter(([id, mapping]) => !same(current.mappings.get(id), mapping));
    if (!changes.length) return true;
    current.revision += 1;
    const affected = new Set<string>();
    for (const [id, mapping] of changes) {
      const previous = current.mappings.get(id);
      if (previous) affected.add(studentKeyId(previous.studentKey));
      if (mapping) { mapping.mappingRevision = current.revision; current.mappings.set(id, mapping); affected.add(studentKeyId(mapping.studentKey)); }
      else current.mappings.delete(id);
    }
    for (const id of affected) invalidateTarget(id);
    refresh(); return true;
  };
  const collect = async (studentId: string, refreshEvidence = false, batchToken?: object): Promise<void> => {
    if (current.active || (current.batch && batchToken !== current.batch)) return;
    if (current.collections.get(studentId)?.status === "collected" && !refreshEvidence) return;
    const mappings = [...current.mappings.values()].filter((mapping) => studentKeyId(mapping.studentKey) === studentId);
    if (!params.students().some((student) => studentKeyId(student.key) === studentId)) return;
    if (refreshEvidence) { current.revision += 1; for (const mapping of mappings) mapping.mappingRevision = current.revision; }
    const signature = JSON.stringify(mappings);
    const priorAttempt = current.attempts.get(studentId);
    const attempts = priorAttempt?.signature === signature ? priorAttempt.count : 0;
    if (attempts >= 2) return;
    const request = collectionRequest(`collect-${++current.attempt}`, mappings);
    if (!request) { current.collections.set(studentId, { status: "failed", error: "Confirm one to three sources for this student before fetching." }); refresh(); return; }
    const controller = new AbortController();
    const active = { controller, signature, studentId }; current.active = active;
    current.attempts.set(studentId, { signature, count: attempts + 1 });
    const previousResponse = current.collections.get(studentId)?.response;
    current.collections.set(studentId, { status: "pending", response: previousResponse }); refresh();
    const startedAtMs = performance.now();
    let settled: RepositoryCollectResponse | undefined;
    try {
      const response = await (params.collect ?? postRepositoryCollection)(request, controller.signal);
      if (current.active !== active || current.epoch !== request.studentKey.sessionEpoch) return;
      if (!collectionMatches(request, response)) throw new Error("Invalid repository collection.");
      const bytes = new TextEncoder().encode(JSON.stringify(response)).byteLength;
      const retained = [...current.collections].filter(([id]) => id !== studentId).reduce((sum, [, item]) => sum + (item.response ? new TextEncoder().encode(JSON.stringify(item.response)).byteLength : 0), 0);
      const originals = params.students();
      const originalBytes = originals.find((student) => studentKeyId(student.key) === studentId)?.retainedBytes ?? ITEM_REQUEST_BYTE_BUDGET;
      const workflowBytes = new TextEncoder().encode(JSON.stringify([...workflows.states])).byteLength;
      if (bytes + originalBytes > ITEM_REQUEST_BYTE_BUDGET || bytes + retained + workflowBytes + originals.reduce((sum, student) => sum + student.retainedBytes, 0) > 12_000_000) throw new Error("Repository retention limit.");
      settled = freezeCollection(response);
      workflows.invalidate(studentId);
      current.collections.set(studentId, { status: "collected", response: settled });
    } catch {
      if (current.active === active) current.collections.set(studentId, { status: "failed", response: previousResponse, error: "Repository collection failed or exceeded a limit. Existing grades are unchanged." });
    } finally {
      if (current.active === active) {
        current.active = null; refresh();
        try { params.onSettled?.(!!settled, settled, startedAtMs, request.mappings.length); } catch { /* Diagnostics cannot change collection. */ }
      }
    }
  };
  const collectAll = async (): Promise<void> => {
    if (current.batch || current.active) return;
    const token = {}; current.batch = token; refresh();
    const targets = eligibleTargets().slice(0, REPOSITORY_COLLECTION_BATCH_STUDENTS);
    try {
      for (const target of targets) {
        if (current.batch !== token) break;
        await collect(target, false, token);
      }
    } finally { if (current.batch === token) { current.batch = null; refresh(); } }
  };
  function eligibleTargets() {
    return [...new Set([...current.mappings.values()].map((mapping) => studentKeyId(mapping.studentKey)))].filter((id) =>
      current.collections.get(id)?.status !== "collected" && (current.attempts.get(id)?.count ?? 0) < 2);
  }
  function snapshot() {
    const eligible = eligibleTargets();
    return { mappings: [...current.mappings.values()], collections: new Map(current.collections), busy: !!current.active || !!current.batch,
      nextBatch: eligible.slice(0, REPOSITORY_COLLECTION_BATCH_STUDENTS), remainingAfterBatch: Math.max(0, eligible.length - REPOSITORY_COLLECTION_BATCH_STUDENTS),
      exhausted: new Map([...current.attempts].filter(([, attempt]) => attempt.count >= 2).map(([id]) => [id, "This revision used both collection attempts. Start a new evidence revision to try again."])),
      workflow: workflows.adapter(!!current.active || !!current.batch),
      confirm, collect, collectAll, reset };
  }
  return { snapshot, sync, subscribe(listener: typeof publish) { publish = listener; return () => { publish = () => {}; }; } };
}

export function useChatRepositoryProposals(params: RepositoryProposalParams) {
  const [controller] = useState(() => createRepositoryController(params));
  const [view, setView] = useState(controller.snapshot);
  useEffect(() => controller.subscribe(setView), [controller]);
  useEffect(() => controller.sync(params), [controller, params]);
  return view;
}
