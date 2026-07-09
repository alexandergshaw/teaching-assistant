"use client";

import { useEffect, useState } from "react";
import {
  listOrgMembersAction,
  inviteOrgMemberAction,
  setOrgMemberRoleAction,
  listRepoCollaboratorsAction,
  setRepoCollaboratorAction,
  createPullRequestAction,
  setBranchProtectionAction,
  listGithubBranchesAction,
  deleteOrgReposAction,
} from "../actions";
import type { GithubRepo } from "@/lib/github";
import Typeahead from "./ui/Typeahead";
import { submitOnEnter } from "./ui/submitOnEnter";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../page.module.css";

type OrgMember = { login: string; role: "admin" | "member" };
type RepoCollaborator = { login: string; permission: "pull" | "triage" | "push" | "maintain" | "admin" };
type BranchProtectionOptions = {
  requirePullRequestReviews: boolean;
  requiredApprovingReviewCount: number;
  requireStatusChecks: boolean;
  statusCheckContexts: string[];
  strictStatusChecks: boolean;
  enforceAdmins: boolean;
  requireLinearHistory: boolean;
};

const permissionLabel = (perm: string): string => {
  const map: Record<string, string> = {
    pull: "Read",
    triage: "Triage",
    push: "Write",
    maintain: "Maintain",
    admin: "Admin",
  };
  return map[perm] || perm;
};

const permissionValue = (label: string): "pull" | "triage" | "push" | "maintain" | "admin" => {
  const map: Record<string, "pull" | "triage" | "push" | "maintain" | "admin"> = {
    Read: "pull",
    Triage: "triage",
    Write: "push",
    Maintain: "maintain",
    Admin: "admin",
  };
  return map[label] || "push";
};

const roleLabel = (role: string): string => {
  return role === "admin" ? "Owner" : "Member";
};

const roleValue = (label: string): "admin" | "member" => {
  return label === "Owner" ? "admin" : "member";
};

interface OrgManagementPanelProps {
  org: string;
  repos: GithubRepo[];
  onReposChanged?: () => void;
}

export default function OrgManagementPanel({ org, repos, onReposChanged }: OrgManagementPanelProps) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersState, setMembersState] = useState<"loading" | "ready" | "error">("loading");
  const [membersError, setMembersError] = useState<string | null>(null);
  const [inviteValue, setInviteValue] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const [accessRepo, setAccessRepo] = useState("");
  const [collaborators, setCollaborators] = useState<RepoCollaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [accessUsername, setAccessUsername] = useState("");
  const [accessPermission, setAccessPermission] = useState<"pull" | "triage" | "push" | "maintain" | "admin">("push");
  const [accessMsg, setAccessMsg] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);

  const [prRepo, setPrRepo] = useState("");
  const [prBranches, setPrBranches] = useState<string[]>([]);
  const [prDefaultBranch, setPrDefaultBranch] = useState("");
  const [prHead, setPrHead] = useState("");
  const [prBase, setPrBase] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prResult, setPrResult] = useState<{ number: number; htmlUrl: string } | null>(null);
  const [prMsg, setPrMsg] = useState<string | null>(null);
  const [prBusy, setPrBusy] = useState(false);

  const [bpRepo, setBpRepo] = useState("");
  const [bpBranches, setBpBranches] = useState<string[]>([]);
  const [bpBranch, setBpBranch] = useState("");
  const [bpRequirePr, setBpRequirePr] = useState(false);
  const [bpApprovals, setBpApprovals] = useState(1);
  const [bpRequireChecks, setBpRequireChecks] = useState(false);
  const [bpContexts, setBpContexts] = useState("");
  const [bpStrict, setBpStrict] = useState(false);
  const [bpEnforceAdmins, setBpEnforceAdmins] = useState(false);
  const [bpLinear, setBpLinear] = useState(false);
  const [bpMsg, setBpMsg] = useState<string | null>(null);
  const [bpBusy, setBpBusy] = useState(false);

  const [delFilter, setDelFilter] = useState("");
  const [delSelected, setDelSelected] = useState<Set<string>>(new Set());
  const [delBusy, setDelBusy] = useState(false);
  const [delNote, setDelNote] = useState<string | null>(null);

  // Load members on mount and when org changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    setMembersState("loading");
    setMembersError(null);
    (async () => {
      const r = await listOrgMembersAction(org);
      if (cancelled) return;
      if ("error" in r) {
        setMembersState("error");
        setMembersError(r.error);
        return;
      }
      setMembers(r.members);
      setMembersState("ready");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [org]);

  // Load collaborators when access repo changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!accessRepo) {
      setCollaborators([]);
      return;
    }
    let cancelled = false;
    setCollaboratorsLoading(true);
    (async () => {
      const r = await listRepoCollaboratorsAction(accessRepo);
      if (cancelled) return;
      setCollaboratorsLoading(false);
      if (!("error" in r)) setCollaborators(r.collaborators);
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [accessRepo]);

  // Load branches when PR repo changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!prRepo) {
      setPrBranches([]);
      setPrDefaultBranch("");
      setPrHead("");
      setPrBase("");
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await listGithubBranchesAction(prRepo);
      if (cancelled) return;
      if (!("error" in r)) {
        setPrBranches(r.branches);
        setPrDefaultBranch(r.defaultBranch);
        setPrBase(r.defaultBranch);
      }
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [prRepo]);

  // Load branches when branch protection repo changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!bpRepo) {
      setBpBranches([]);
      setBpBranch("");
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await listGithubBranchesAction(bpRepo);
      if (cancelled) return;
      if (!("error" in r)) {
        setBpBranches(r.branches);
        setBpBranch(r.defaultBranch);
      }
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [bpRepo]);

  const handleMemberRoleChange = async (login: string, newRole: "admin" | "member") => {
    const r = await setOrgMemberRoleAction(org, login, newRole);
    if ("error" in r) {
      setMembersError(r.error);
    } else {
      setMembers(members.map((m) => (m.login === login ? { ...m, role: newRole } : m)));
    }
  };

  const handleInvite = async () => {
    if (!inviteValue.trim()) return;
    setInviteBusy(true);
    setInviteMsg(null);
    const r = await inviteOrgMemberAction(org, inviteValue.trim(), inviteRole);
    setInviteBusy(false);
    if ("error" in r) {
      setInviteMsg(`Error: ${r.error}`);
    } else {
      setInviteMsg(`Invitation sent to ${inviteValue.trim()}.`);
      setInviteValue("");
    }
  };

  const handleAccessApply = async () => {
    if (!accessRepo || !accessUsername.trim()) return;
    setAccessBusy(true);
    setAccessMsg(null);
    const r = await setRepoCollaboratorAction(accessRepo, accessUsername.trim(), accessPermission);
    setAccessBusy(false);
    if ("error" in r) {
      setAccessMsg(`Error: ${r.error}`);
    } else {
      // Reload collaborators
      const collab = await listRepoCollaboratorsAction(accessRepo);
      if (!("error" in collab)) {
        setCollaborators(collab.collaborators);
      }
      setAccessMsg("Access updated.");
      setAccessUsername("");
    }
  };

  const handleCreatePr = async () => {
    if (!prRepo || !prHead || !prBase || !prTitle.trim()) return;
    setPrBusy(true);
    setPrMsg(null);
    const r = await createPullRequestAction(prRepo, prTitle.trim(), prHead, prBase, prBody);
    setPrBusy(false);
    if ("error" in r) {
      setPrMsg(`Error: ${r.error}`);
    } else {
      setPrResult(r);
      setPrTitle("");
      setPrBody("");
      setPrHead("");
      setPrBase(prDefaultBranch);
    }
  };

  const handleBranchProtection = async () => {
    if (!bpRepo || !bpBranch) return;
    setBpBusy(true);
    setBpMsg(null);

    const contexts = bpContexts
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const opts: BranchProtectionOptions = {
      requirePullRequestReviews: bpRequirePr,
      requiredApprovingReviewCount: Math.max(0, Math.floor(bpApprovals)),
      requireStatusChecks: bpRequireChecks,
      statusCheckContexts: contexts,
      strictStatusChecks: bpStrict,
      enforceAdmins: bpEnforceAdmins,
      requireLinearHistory: bpLinear,
    };

    const r = await setBranchProtectionAction(bpRepo, bpBranch, opts);
    setBpBusy(false);
    if ("error" in r) {
      setBpMsg(`Error: ${r.error}`);
    } else {
      setBpMsg(`Protection updated on ${bpBranch}.`);
    }
  };

  const handleDeleteRepos = async () => {
    const names = [...delSelected];
    if (names.length === 0) return;
    const typed = typeof window !== "undefined"
      ? window.prompt(`This permanently deletes ${names.length} repositor${names.length === 1 ? "y" : "ies"} from ${org}, including all code and history. Type DELETE to confirm.`)
      : null;
    if (typed !== "DELETE") return;
    setDelBusy(true);
    setDelNote(null);
    const r = await deleteOrgReposAction(org, names);
    setDelBusy(false);
    if ("error" in r) {
      setDelNote(`Error: ${r.error}`);
      return;
    }
    const failed = r.results.filter((x) => x.error);
    const deleted = r.results.length - failed.length;
    setDelNote(
      `Deleted ${deleted} repositor${deleted === 1 ? "y" : "ies"}.` +
        (failed.length > 0 ? ` Failed: ${failed.map((f) => `${f.name} (${f.error})`).join(", ")}` : "")
    );
    setDelSelected(new Set());
    onReposChanged?.();
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Manage {org}</h3>

      <details className={styles.adaptDisclosure} style={{ marginTop: 12 }}>
        <summary>Members</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          {membersState === "loading" && <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Loading members...</p>}
          {membersState === "error" && membersError && <p className={styles.error}>{membersError}</p>}
          {membersState === "ready" && members.length === 0 && <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No members.</p>}
          {membersState === "ready" &&
            members.map((member) => (
              <div key={member.login} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "0.95rem", flex: 1 }}>{member.login}</span>
                <TextField
                  select
                  size="small"
                  value={roleLabel(member.role)}
                  onChange={(e) => handleMemberRoleChange(member.login, roleValue(e.target.value))}
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="Owner">Owner</MenuItem>
                  <MenuItem value="Member">Member</MenuItem>
                </TextField>
              </div>
            ))}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--field-border)" }}>
            <TextField
              size="small"
              fullWidth
              placeholder="GitHub username or email"
              value={inviteValue}
              onChange={(e) => setInviteValue(e.target.value)}
              onKeyDown={submitOnEnter(handleInvite)}
              disabled={inviteBusy}
            />
            <TextField
              select
              size="small"
              value={roleLabel(inviteRole)}
              onChange={(e) => setInviteRole(roleValue(e.target.value))}
              disabled={inviteBusy}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="Owner">Owner</MenuItem>
              <MenuItem value="Member">Member</MenuItem>
            </TextField>
            <Button
              type="button"
              variant="contained"
              size="small"
              onClick={handleInvite}
              disabled={inviteBusy || !inviteValue.trim()}
            >
              {inviteBusy ? "Inviting..." : "Invite"}
            </Button>
          </div>
          {inviteMsg && (inviteMsg.startsWith("Error:") ? <p className={styles.error}>{inviteMsg}</p> : <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 6 }}>{inviteMsg}</p>)}
        </div>
      </details>

      <details className={styles.adaptDisclosure} style={{ marginTop: 12 }}>
        <summary>Repository access</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <Typeahead
            options={repos.map((r) => ({ value: r.fullName, label: r.name }))}
            value={accessRepo}
            onChange={(v) => setAccessRepo(v)}
            placeholder="Select a repository..."
            noOptionsText="No repositories"
          />

          {accessRepo && (
            <>
              {collaboratorsLoading && <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Loading collaborators...</p>}
              {!collaboratorsLoading &&
                collaborators.map((collab) => (
                  <div key={collab.login} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem", flex: 1 }}>{collab.login}</span>
                    <TextField
                      select
                      size="small"
                      value={permissionLabel(collab.permission)}
                      onChange={(e) => {
                        const newPerm = permissionValue(e.target.value);
                        setCollaborators(collaborators.map((c) => (c.login === collab.login ? { ...c, permission: newPerm } : c)));
                        setRepoCollaboratorAction(accessRepo, collab.login, newPerm).then((r) => {
                          if ("error" in r) {
                            setAccessMsg(`Error updating ${collab.login}: ${r.error}`);
                          }
                        });
                      }}
                      sx={{ minWidth: 140 }}
                    >
                      <MenuItem value="Read">Read</MenuItem>
                      <MenuItem value="Triage">Triage</MenuItem>
                      <MenuItem value="Write">Write</MenuItem>
                      <MenuItem value="Maintain">Maintain</MenuItem>
                      <MenuItem value="Admin">Admin</MenuItem>
                    </TextField>
                  </div>
                ))}

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--field-border)" }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="GitHub username"
                  value={accessUsername}
                  onChange={(e) => setAccessUsername(e.target.value)}
                  onKeyDown={submitOnEnter(handleAccessApply)}
                  disabled={accessBusy}
                />
                <TextField
                  select
                  size="small"
                  value={permissionLabel(accessPermission)}
                  onChange={(e) => setAccessPermission(permissionValue(e.target.value))}
                  disabled={accessBusy}
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="Read">Read</MenuItem>
                  <MenuItem value="Triage">Triage</MenuItem>
                  <MenuItem value="Write">Write</MenuItem>
                  <MenuItem value="Maintain">Maintain</MenuItem>
                  <MenuItem value="Admin">Admin</MenuItem>
                </TextField>
                <Button
                  type="button"
                  variant="contained"
                  size="small"
                  onClick={handleAccessApply}
                  disabled={accessBusy || !accessUsername.trim()}
                >
                  {accessBusy ? "Applying..." : "Apply"}
                </Button>
              </div>
              {accessMsg && (accessMsg.startsWith("Error:") ? <p className={styles.error}>{accessMsg}</p> : <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 6 }}>{accessMsg}</p>)}
            </>
          )}
        </div>
      </details>

      <details className={styles.adaptDisclosure} style={{ marginTop: 12 }}>
        <summary>Create pull request</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <Typeahead
            options={repos.map((r) => ({ value: r.fullName, label: r.name }))}
            value={prRepo}
            onChange={(v) => setPrRepo(v)}
            placeholder="Select a repository..."
            noOptionsText="No repositories"
          />

          {prRepo && (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <Typeahead
                    options={prBranches.map((b) => ({ value: b, label: b }))}
                    value={prHead}
                    onChange={(v) => setPrHead(v)}
                    placeholder="Head branch..."
                    noOptionsText="No branches"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Typeahead
                    options={prBranches.map((b) => ({ value: b, label: b }))}
                    value={prBase}
                    onChange={(v) => setPrBase(v)}
                    placeholder="Base branch..."
                    noOptionsText="No branches"
                  />
                </div>
              </div>

              <TextField
                size="small"
                fullWidth
                placeholder="Pull request title"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                onKeyDown={submitOnEnter(handleCreatePr)}
                disabled={prBusy}
                sx={{ mb: 1.5 }}
              />

              <TextField
                size="small"
                fullWidth
                multiline
                placeholder="Description (optional)"
                rows={4}
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                disabled={prBusy}
                sx={{ mb: 1.5 }}
              />

              <Button
                type="button"
                variant="contained"
                size="small"
                onClick={handleCreatePr}
                disabled={prBusy || !prHead || !prBase || !prTitle.trim()}
              >
                {prBusy ? "Creating..." : "Create PR"}
              </Button>

              {prMsg && (prMsg.startsWith("Error:") ? <p className={styles.error}>{prMsg}</p> : <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 8 }}>{prMsg}</p>)}
              {prResult && (
                <p style={{ fontSize: "0.85rem", marginTop: 8, color: "var(--text-secondary)" }}>
                  PR{" "}
                  <a href={prResult.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>
                    #{prResult.number}
                  </a>{" "}
                  created.
                </p>
              )}
            </>
          )}
        </div>
      </details>

      <details className={styles.adaptDisclosure} style={{ marginTop: 12 }}>
        <summary>Branch protection</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <Typeahead
            options={repos.map((r) => ({ value: r.fullName, label: r.name }))}
            value={bpRepo}
            onChange={(v) => setBpRepo(v)}
            placeholder="Select a repository..."
            noOptionsText="No repositories"
          />

          {bpRepo && (
            <>
              <Typeahead
                options={bpBranches.map((b) => ({ value: b, label: b }))}
                value={bpBranch}
                onChange={(v) => setBpBranch(v)}
                placeholder="Select a branch..."
                noOptionsText="No branches"
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                <FormControlLabel
                  control={<Checkbox checked={bpRequirePr} onChange={(e) => setBpRequirePr(e.target.checked)} disabled={bpBusy} size="small" />}
                  label="Require pull request reviews"
                />

                {bpRequirePr && (
                  <div style={{ marginLeft: 24, display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Required approvals:</label>
                    <TextField
                      type="number"
                      size="small"
                      value={bpApprovals}
                      onChange={(e) => setBpApprovals(Math.max(0, parseInt(e.target.value) || 0))}
                      disabled={bpBusy}
                      sx={{ width: 90 }}
                      slotProps={{ htmlInput: { min: 0 } }}
                    />
                  </div>
                )}

                <FormControlLabel
                  control={<Checkbox checked={bpRequireChecks} onChange={(e) => setBpRequireChecks(e.target.checked)} disabled={bpBusy} size="small" />}
                  label="Require status checks"
                />

                {bpRequireChecks && (
                  <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Required checks (comma-separated)"
                      value={bpContexts}
                      onChange={(e) => setBpContexts(e.target.value)}
                      onKeyDown={submitOnEnter(handleBranchProtection)}
                      disabled={bpBusy}
                    />
                    <FormControlLabel
                      control={<Checkbox checked={bpStrict} onChange={(e) => setBpStrict(e.target.checked)} disabled={bpBusy} size="small" />}
                      label="Require branches up to date"
                    />
                  </div>
                )}

                <FormControlLabel
                  control={<Checkbox checked={bpEnforceAdmins} onChange={(e) => setBpEnforceAdmins(e.target.checked)} disabled={bpBusy} size="small" />}
                  label="Include administrators"
                />

                <FormControlLabel
                  control={<Checkbox checked={bpLinear} onChange={(e) => setBpLinear(e.target.checked)} disabled={bpBusy} size="small" />}
                  label="Require linear history"
                />
              </div>

              <Button
                type="button"
                variant="contained"
                size="small"
                onClick={handleBranchProtection}
                disabled={bpBusy || !bpBranch}
              >
                {bpBusy ? "Applying..." : "Apply protection"}
              </Button>

              {bpMsg && (bpMsg.startsWith("Error:") ? <p className={styles.error}>{bpMsg}</p> : <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 8 }}>{bpMsg}</p>)}
            </>
          )}
        </div>
      </details>

      <details className={styles.adaptDisclosure} style={{ marginTop: 12 }}>
        <summary>Delete repositories</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <p className={styles.fieldHint} style={{ margin: "0 0 8px" }}>
            Permanently deletes repositories from {org} on GitHub, including all code, issues, and history. This cannot be undone. The token needs the delete_repo scope.
          </p>
          <TextField size="small" fullWidth placeholder="Filter repositories" value={delFilter} onChange={(e) => setDelFilter(e.target.value)} />
          {(() => {
            const filtered = repos.filter((r) => !delFilter.trim() || r.name.toLowerCase().includes(delFilter.trim().toLowerCase()));
            const allSelected = filtered.length > 0 && filtered.every((r) => delSelected.has(r.name));
            return (
              <>
                <FormControlLabel
                  sx={{ marginTop: 0.5 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={!allSelected && filtered.some((r) => delSelected.has(r.name))}
                      onChange={() =>
                        setDelSelected((prev) => {
                          const next = new Set(prev);
                          if (allSelected) for (const r of filtered) next.delete(r.name);
                          else for (const r of filtered) next.add(r.name);
                          return next;
                        })
                      }
                    />
                  }
                  label={<span style={{ fontSize: "0.85rem" }}>Select all{delFilter.trim() ? " (filtered)" : ""} ({filtered.length})</span>}
                />
                <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  {filtered.map((r) => (
                    <FormControlLabel
                      key={r.fullName}
                      sx={{ marginLeft: 1 }}
                      control={
                        <Checkbox
                          size="small"
                          checked={delSelected.has(r.name)}
                          onChange={() =>
                            setDelSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.name)) next.delete(r.name);
                              else next.add(r.name);
                              return next;
                            })
                          }
                        />
                      }
                      label={
                        <span style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>
                          {r.name}
                          <span style={{ color: "var(--text-secondary)", marginLeft: 8, fontSize: "0.75rem" }}>
                            {r.private ? "private" : "public"}{r.isTemplate ? " · template" : ""}
                          </span>
                        </span>
                      }
                    />
                  ))}
                  {filtered.length === 0 && <p className={styles.fieldHint}>No repositories match.</p>}
                </div>
                <div style={{ marginTop: 8 }}>
                  <Button variant="contained" size="small" color="error" disabled={delBusy || delSelected.size === 0} onClick={handleDeleteRepos}>
                    {delBusy ? "Deleting..." : `Delete ${delSelected.size || ""} selected`.replace("  ", " ")}
                  </Button>
                </div>
                {delNote && (
                  <p className={delNote.startsWith("Error") || delNote.includes("Failed:") ? styles.error : styles.fieldHint} style={{ marginTop: 8 }}>
                    {delNote}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </details>
    </div>
  );
}
