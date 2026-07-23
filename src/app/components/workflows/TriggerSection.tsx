"use client";

import { Button } from "@mui/material";
import { describeTrigger, type WorkflowTrigger } from "@/lib/workflow-triggers";
import { triggerToForm, type TriggerFormData } from "@/lib/workflow-form-helpers";
import type { WorkflowDef } from "@/lib/workflows/types";
import { lastRunChip } from "./automation-inventory-logic";
import { TriggerEditForm } from "./TriggerEditForm";
import styles from "../../page.module.css";

interface TriggerSectionProps {
  triggerForm: TriggerFormData | null;
  setTriggerForm: (form: TriggerFormData | null | ((prev: TriggerFormData | null) => TriggerFormData | null)) => void;
  editingTriggerId: string | null;
  setEditingTriggerId: (id: string | null) => void;
  triggers: WorkflowTrigger[] | null;
  triggerBusy: boolean;
  triggerError: string | null;
  setTriggerError: (error: string | null) => void;
  triggerRemoveConfirm: string | null;
  setTriggerRemoveConfirm: (id: string | null) => void;
  selectedDef: WorkflowDef | null;
  selectedWorkflowId: string;
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  institutions: string[];
  activeInstitution: string | null;
  user: unknown;
  expandedError: string | null;
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  selectedHeadlessSafe: boolean;
  webhookSetup: null | { ok: true; org: string; url: string; alreadyExisted: boolean } | { ok: false; org: string; url: string; error: string };
  setWebhookSetup: (setup: null | { ok: true; org: string; url: string; alreadyExisted: boolean } | { ok: false; org: string; url: string; error: string }) => void;
  webhookBaseUrl: string;
  orgs: string[] | null;
  orgsError: string | null;
  workflows: WorkflowDef[];
  onCreate: () => void;
  onSaveEdit: (triggerId: string) => void;
  onToggle: (trigger: WorkflowTrigger) => void;
  onDelete: (triggerId: string) => void;
}

export function TriggerSection({
  triggerForm,
  setTriggerForm,
  editingTriggerId,
  setEditingTriggerId,
  triggers,
  triggerBusy,
  triggerError,
  setTriggerError,
  triggerRemoveConfirm,
  setTriggerRemoveConfirm,
  selectedDef,
  selectedWorkflowId,
  hubCourses,
  institutions,
  activeInstitution,
  user,
  expandedError,
  isWorkflowHeadlessSafeById,
  selectedHeadlessSafe,
  webhookSetup,
  setWebhookSetup,
  webhookBaseUrl,
  orgs,
  orgsError,
  workflows,
  onCreate,
  onSaveEdit,
  onToggle,
  onDelete,
}: TriggerSectionProps) {
  return (
    <>
      <h3 style={{ fontSize: "0.95rem", margin: "24px 0 4px 0", paddingTop: 16, borderTop: "1px solid var(--field-border)" }}>Triggers</h3>
      <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
        Run this workflow automatically when an event happens - a submission, a message, a repo push, another workflow finishing, or an inbound webhook.
      </p>
      <Button
        variant="outlined"
        size="small"
        disabled={!user || !!expandedError}
        onClick={() =>
          setTriggerForm((prev) =>
            prev
              ? null
              : {
                  eventType: "submission-received",
                  config: {},
                  courseId: "",
                  institution: activeInstitution || "",
                  unattended: false,
                }
          )
        }
      >
        {triggerForm ? "Cancel trigger" : "Trigger on event..."}
      </Button>

      {triggerForm && (
        <TriggerEditForm
          triggerForm={triggerForm}
          setTriggerForm={setTriggerForm}
          editingTriggerId={editingTriggerId}
          setEditingTriggerId={setEditingTriggerId}
          setTriggerError={setTriggerError}
          triggers={triggers}
          triggerBusy={triggerBusy}
          error={null}
          selectedDef={selectedDef}
          selectedWorkflowId={selectedWorkflowId}
          hubCourses={hubCourses}
          institutions={institutions}
          activeInstitution={activeInstitution}
          isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
          selectedHeadlessSafe={selectedHeadlessSafe}
          orgs={orgs}
          orgsError={orgsError}
          workflows={workflows}
          onSaveEdit={onSaveEdit}
          onCreate={onCreate}
        />
      )}

      {triggerError && <p className={styles.error}>{triggerError}</p>}

      {webhookSetup && (
        <div style={{ padding: "12px", marginBottom: "12px", borderRadius: "4px", backgroundColor: webhookSetup.ok ? "var(--success-bg, rgba(76, 175, 80, 0.1))" : "var(--field-bg)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "12px" }}>
            <p style={{ margin: 0, fontSize: "0.9em", lineHeight: "1.4" }}>
              {webhookSetup.ok && !webhookSetup.alreadyExisted && (
                <>Instant push webhook registered on <strong>{webhookSetup.org}</strong>. Pushes now fire this trigger immediately.</>
              )}
              {webhookSetup.ok && webhookSetup.alreadyExisted && (
                <>Instant push webhook already active on <strong>{webhookSetup.org}</strong>.</>
              )}
              {!webhookSetup.ok && (
                <>
                  Could not auto-register the instant webhook ({webhookSetup.error}). The trigger still works via the periodic poller. To enable instant firing, add a webhook under {webhookSetup.org} org settings with Payload URL <code style={{ backgroundColor: "var(--field-bg)", padding: "2px 6px", borderRadius: "2px", wordBreak: "break-all" }}>{webhookSetup.url}</code> (shown selectable), Content type application/json, Secret set to your GITHUB_WEBHOOK_SECRET value, and only the push event.
                </>
              )}
            </p>
            <button
              onClick={() => setWebhookSetup(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: 0,
                flex: "none",
                fontSize: "0.85em",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {(triggers ?? []).some((t) => t.workflowId === selectedDef?.id) && (
        <div style={{ marginTop: 16 }}>
          {(triggers ?? []).filter((t) => t.workflowId === selectedDef?.id).map((t) => {
            const courseName = t.courseId
              ? hubCourses?.find((c) => c.id === t.courseId)?.name ?? "course"
              : null;
            const attachment = [courseName, t.institution].filter(Boolean).join(", ");
            const webhookUrl =
              t.eventType === "webhook" && t.webhookToken
                ? `${webhookBaseUrl}/api/triggers/${t.webhookToken}`
                : null;
            const chip = lastRunChip(t.lastRunStatus, t.lastFiredAt);
            return (
              <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0", borderTop: "1px solid var(--field-border)", fontSize: "0.85em" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{t.workflowName}</span>
                  {t.unattended && (
                    <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>Unattended</span>
                  )}
                  {chip.text && (
                    <span className={`${styles.ghBadge} ${chip.class}`}>{chip.text}</span>
                  )}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {describeTrigger(t)}
                    {t.enabled ? "" : " - disabled"}
                    {attachment ? ` - ${attachment}` : ""}
                    {t.lastFiredAt ? ` - last fired ${new Date(t.lastFiredAt).toLocaleString()}` : ""}
                  </span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        setTriggerForm(triggerToForm(t));
                        setEditingTriggerId(t.id);
                      }}
                    >
                      Edit
                    </button>
                    {webhookUrl && (
                      <button type="button" className={styles.linkButton} onClick={() => void navigator.clipboard?.writeText(webhookUrl)}>
                        Copy URL
                      </button>
                    )}
                    <button type="button" className={styles.linkButton} onClick={() => void onToggle(t)}>
                      {t.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      style={{ color: "var(--danger)" }}
                      onClick={() =>
                        triggerRemoveConfirm === t.id
                          ? void onDelete(t.id)
                          : setTriggerRemoveConfirm(t.id)
                      }
                    >
                      {triggerRemoveConfirm === t.id ? "Confirm" : "Remove"}
                    </button>
                  </span>
                </div>
                {webhookUrl && (
                  <code style={{ flexBasis: "100%", fontSize: "0.8em", color: "var(--text-secondary)", wordBreak: "break-all" }}>{webhookUrl}</code>
                )}
                {t.lastRunDetail && (
                  <span className={styles.fieldHint} style={{ margin: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.lastRunDetail}>
                    {t.lastRunDetail}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
