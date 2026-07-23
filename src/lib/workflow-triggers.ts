// Event-triggered workflow runs. This barrel re-exports the full public API
// from three split modules: decisions (pure decision logic), event-sources
// (the event registry and evaluation), and store (database persistence).

// Re-export everything from decisions (the pure deciders)
export {
  decideNewMessages,
  decideNewEmails,
  decideCountRise,
  decideThresholdEdge,
  decideRepoPush,
  decideRepoInactive,
  decideBrokenLinks,
  decideRosterChanged,
  decideCourseStart,
  decideDeadlinePassed,
  decideWorkflowCompleted,
  decideCartridgeDrops,
} from "./workflow-triggers/decisions";

// Re-export everything from event-sources
export {
  type TriggerEventType,
  type TriggerEventCategory,
  type TriggerConfigField,
  type TriggerEvalResult,
  type TriggerEvalContext,
  type EventSourceDef,
  EVENT_SOURCES,
  getEventSource,
  evaluateTrigger,
  isTriggerDueForCheck,
  LIFECYCLE_EVENT_TYPES,
  isLifecycleEventType,
  lifecycleCooldownElapsed,
  describeTrigger,
  ALL_INSTITUTIONS,
  parseInstitutionsConfig,
  resolveInstitutionList,
} from "./workflow-triggers/event-sources";

// Re-export everything from store
export {
  type WorkflowTrigger,
  mapTrigger,
  generateWebhookToken,
  listWorkflowTriggers,
  createWorkflowTrigger,
  updateWorkflowTrigger,
  deleteWorkflowTrigger,
  claimAndAdvanceTrigger,
  touchTriggerChecked,
  listUnattendedTriggersDue,
  STALE_CLAIM_MS as TRIGGER_STALE_CLAIM_MS,
  decideStaleTriggerRecovery,
  listStaleClaimedWorkflowTriggers,
  recoverStaleWorkflowTrigger,
  listEnabledRepoPushTriggers,
  matchRepoPushTriggers,
  advanceRepoPushCursor,
  findEnabledWebhookTrigger,
  claimWebhookTrigger,
} from "./workflow-triggers/store";
