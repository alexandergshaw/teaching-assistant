// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  runSubmissionCodeAction,
  listRunArtifactsAction,
  setupTestsWorkflowAction,
  dispatchTestsAction,
  getTestRunStatusAction,
} from "@/app/actions";
import type { StepDefinition } from "@/lib/workflows/registry-helpers";

export const testingSteps: StepDefinition[] = [
  {
    type: "run-submission-code",
    name: "Run submission code",
    description:
      "Execute a student's submitted code in the sandbox and capture its output as grading evidence.",
    inputs: [
      { key: "code", label: "Code", type: "longtext", required: true },
      {
        key: "fileName",
        label: "File name",
        type: "text",
        required: false,
        help: "Defaults to solution.py; the extension picks the language.",
      },
    ],
    outputs: [{ key: "output", label: "Run output", type: "longtext" }],
    run: async (values, helpers, onProgress) => {
      const code = String(values.code ?? "").trim();
      if (!code) {
        throw new Error("Provide the code to run.");
      }

      const fileName = String(values.fileName ?? "").trim() || "solution.py";
      const dot = fileName.lastIndexOf(".");
      const extension = dot >= 0 ? fileName.slice(dot) : ".py";

      onProgress("Running code...");
      const result = await runSubmissionCodeAction([
        { name: fileName, extension, previewContent: code },
      ]);

      if (!result) {
        throw new Error("The code could not be run.");
      }

      let outputText = "";

      if (result.stdout) {
        outputText += result.stdout;
      }

      if (result.stderr) {
        if (outputText) outputText += "\n";
        outputText += result.stderr;
      }

      if (result.exitCode !== null && result.exitCode !== 0) {
        if (outputText) outputText += "\n";
        outputText += `Exit code: ${result.exitCode}`;
      }

      if (result.compileOutput) {
        if (outputText) outputText += "\n";
        outputText += `Compiler output:\n${result.compileOutput}`;
      }

      if (result.error) {
        if (outputText) outputText += "\n";
        outputText += `Error: ${result.error}`;
      }

      return {
        outputs: { output: outputText },
        summary: { kind: "text", text: outputText || "(No output)" },
      };
    },
  },

  {
    type: "list-ci-artifacts",
    name: "List CI run artifacts",
    description: "List the artifacts (e.g. autograder reports) produced by a repo's CI run, with their download URLs.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "runId", label: "CI run id", type: "text", required: true, help: "The numeric GitHub Actions run id." },
    ],
    outputs: [
      { key: "artifacts", label: "Artifacts", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error("Provide a repository.");
      }

      const runIdRaw = String(values.runId ?? "").trim();
      if (!/^\d+$/.test(runIdRaw)) {
        throw new Error("Provide the numeric CI run id.");
      }

      onProgress("Listing artifacts...");
      const r = await listRunArtifactsAction(repo, Number(runIdRaw));
      if ("error" in r) {
        throw new Error(r.error);
      }

      const lines: string[] = [];
      const names: string[] = [];

      for (const artifact of r.artifacts) {
        lines.push(`Name: ${artifact.name}`);
        lines.push(`Size: ${(artifact.sizeInBytes / 1024 / 1024).toFixed(2)} MB`);
        lines.push(`Expired: ${artifact.expired ? "yes" : "no"}`);
        if (artifact.expiresAt) {
          lines.push(`Expires: ${artifact.expiresAt}`);
        }
        if (artifact.createdAt) {
          lines.push(`Created: ${artifact.createdAt}`);
        }
        lines.push("");
        names.push(artifact.name);
      }

      const artifactsText = lines.join("\n").trim();

      return {
        outputs: { artifacts: artifactsText },
        summary: { kind: "list", label: `${r.artifacts.length} artifact(s)`, items: r.artifacts.length ? names : ["(none)"] },
      };
    },
  },

  {
    type: "setup-tests-workflow",
    name: "Install an autograder CI workflow",
    description: "Commit a GitHub Actions autograder tests workflow into a repository. Attended-only.",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "branch",
        label: "Branch (optional)",
        type: "text",
        required: false,
      },
      {
        key: "template",
        label: "Test template",
        type: "text",
        required: true,
      },
      {
        key: "customCommand",
        label: "Custom test command (optional)",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const branch = String(values.branch ?? "").trim() || undefined;
      const template = String(values.template ?? "").trim();
      if (!template) throw new Error("Provide a test template.");

      const customCommand = String(values.customCommand ?? "").trim();

      onProgress("Installing tests workflow...");
      const r = await setupTestsWorkflowAction(repo, branch, template, customCommand);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: "Autograder CI workflow installed successfully." },
      };
    },
  },

  {
    type: "dispatch-tests",
    name: "Run the autograder tests",
    description: "Trigger the autograder tests workflow for a repository. Emits the run id for a later poll step.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "ref", label: "Branch or ref", type: "text", required: false },
    ],
    outputs: [
      { key: "runId", label: "CI run id", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const ref = String(values.ref ?? "").trim() || undefined;

      onProgress("Dispatching tests...");
      const r = await dispatchTestsAction(repo, ref);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { runId: String(r.since) },
        summary: { kind: "text", text: `Dispatched tests (run id ${r.since}). Use Poll test run to fetch results.` },
      };
    },
  },

  {
    type: "poll-test-run",
    name: "Poll the autograder run",
    description: "Check the status and pass/fail result of a dispatched autograder run.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "runId", label: "Run id", type: "text", required: true, help: "The run id (timestamp) from Run the autograder tests." },
      { key: "ref", label: "Branch or ref", type: "text", required: false },
    ],
    outputs: [
      { key: "status", label: "Status", type: "text" },
      { key: "results", label: "Results", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const runId = String(values.runId ?? "").trim();
      if (!runId) throw new Error("Provide the run id.");

      const ref = String(values.ref ?? "").trim() || undefined;

      onProgress("Checking run status...");
      const r = await getTestRunStatusAction(repo, ref || "main", runId);
      if ("error" in r) throw new Error(r.error);

      const status = r.run?.status || "unknown";
      let resultsText = `Status: ${status}`;
      if (r.run?.conclusion) {
        resultsText += `\nConclusion: ${r.run.conclusion}`;
      }
      if (r.summary) {
        resultsText += `\n\nTest Results:\n`;
        resultsText += `Tests run: ${r.summary.tests}\n`;
        resultsText += `Passed: ${r.summary.passed}\n`;
        resultsText += `Failed: ${r.summary.failures}\n`;
        resultsText += `Errors: ${r.summary.errors}\n`;
        resultsText += `Skipped: ${r.summary.skipped}`;
      }

      return {
        outputs: { status, results: resultsText },
        summary: { kind: "text", text: `Run ${status}${r.summary ? ` - ${r.summary.passed}/${r.summary.tests} tests passed` : ""}` },
      };
    },
  },
];
