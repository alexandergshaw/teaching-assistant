import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const repo = "synthetic/repository";
const retained = "Retained result 1 for exercise";
const disclosure = `summary[aria-label="Score and feedback for ${repo}, exercise"]`;
const retainedDisclosure = `summary[aria-label="${retained} in ${repo}"]`;
const section = `section[aria-label="${retained} draft for ${repo}"]`;
const overallLabel = `${retained} overall feedback for ${repo}`;
const expand = `button[aria-label="Expand ${overallLabel}"]`;
const copyOverall = `button[aria-label="Copy ${overallLabel}"]`;
const copyAll = `button[aria-label="Copy all ${retained} feedback for ${repo}"]`;
const currentScore = `input[aria-label="exercise score for ${repo}"]`;
const currentStrengths = `textarea[aria-label="exercise what went well for ${repo}"]`;
const retainedScore = `input[aria-label="${retained} score for ${repo}"]`;
const overall = `textarea[aria-label="${overallLabel}"]`;
const expanded = `textarea[aria-label="${overallLabel} (expanded)"]`;
const dialog = `[role="dialog"][aria-label="${overallLabel}"]`;
const original = `${section} details`;
const status = `${section} [role="status"]`;
const saveRefusal = "Saved grading results could not be stored. Your work remains available while Repo Grades stays open.";
const copyFailure = "Could not copy to the clipboard. Select the feedback text to copy it manually.";

const keys = {
  Enter: ["Enter", "Enter", 13, "\r"],
  Space: [" ", "Space", 32, " "],
  Tab: ["Tab", "Tab", 9],
  Escape: ["Escape", "Escape", 27],
};
const element = (selector) => `document.querySelector(${JSON.stringify(selector)})`;

export async function verifyEditor({ send }) {
  async function read(expression) {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  async function expect(expression, expected, message) {
    const deadline = Date.now() + 2000;
    let actual;
    do {
      actual = await read(expression);
      if (actual === expected) return;
      await delay(25);
    } while (Date.now() < deadline);
    assert.equal(actual, expected, message);
  }

  async function key(name, modifiers = 0) {
    const [key, code, windowsVirtualKeyCode, text] = keys[name];
    const event = { key, code, windowsVirtualKeyCode, modifiers };
    await send("Input.dispatchKeyEvent", { ...event, type: text ? "keyDown" : "rawKeyDown", text });
    await send("Input.dispatchKeyEvent", { ...event, type: "keyUp" });
  }

  async function focus(selector) {
    await read(`${element(selector)}.focus()`);
    assert.equal(await read(`document.activeElement === ${element(selector)}`), true, `Focus ${selector}`);
  }

  async function activate(selector, name = "Enter") {
    await focus(selector);
    await key(name);
  }

  async function enter(selector, value) {
    await focus(selector);
    await read(`${element(selector)}.select()`);
    await send("Input.insertText", { text: value });
    await expect(`${element(selector)}?.value`, value, `Edit ${selector}`);
  }

  async function openRetained() {
    await activate(disclosure, "Enter");
    await expect(`${element(retainedDisclosure)} !== null`, true, "Enter opens the outer disclosure");
    await activate(retainedDisclosure, "Space");
    await expect(`${element(overall)} !== null`, true, "Space opens the retained disclosure");
  }

  async function expectAX(role, name) {
    const { nodes } = await send("Accessibility.getFullAXTree");
    assert(nodes.some((node) => !node.ignored && node.role?.value === role && node.name?.value === name),
      `Chrome accessibility tree contains ${role} named ${name}`);
  }

  async function copyAndWait(selector, text) {
    const nextWrite = (await read("fixtureClipboard.writes.length")) + 1;
    await activate(selector);
    await expect("fixtureClipboard.writes.length", nextWrite, "The clipboard stub receives the write");
    assert.equal(await read("fixtureClipboard.writes.at(-1)"), text);
  }

  const settle = (success) => read(`fixtureClipboard.settle(${success})`);
  const statusText = `${element(status)}?.textContent`;
  const courseTitle = `${element("h1")}?.textContent`;
  const saveStatus = `${element("main > [role=status]")}?.textContent`;
  const originalText = `${element(original)}?.innerText`;
  const originalOverall = "Original A overall";
  const editedOverall = "Reviewed \u2014 detail";
  const latestOverall = "Second review";

  await expect(courseTitle, "Synthetic course A", "React renders the fixture");
  await expectAX("DisclosureTriangle", `Score and feedback for ${repo}, exercise`);
  assert.equal(await read(`${element(currentScore)} === null`), true);
  await openRetained();
  await expectAX("DisclosureTriangle", `${retained} in ${repo}`);
  await expectAX("button", `Expand ${overallLabel}`);
  await expect(`${element(overall)}.value`, originalOverall, "The retained draft starts at its source");

  await activate(expand);
  await expect(`${element(dialog)}?.getAttribute('aria-modal')`, "true", "Expanded editor is modal");
  await expectAX("dialog", overallLabel);
  assert.equal(await read(`getComputedStyle(${element(dialog)}.parentElement).position`), "fixed", "Real backdrop CSS applies");
  const close = `${dialog} button`;
  await expect(`document.activeElement === ${element(close)}`, true, "Modal takes initial focus");
  await key("Tab", 8);
  await expect(`document.activeElement === ${element(expanded)}`, true, "Shift+Tab wraps to the last control");
  await key("Tab");
  await expect(`document.activeElement === ${element(close)}`, true, "Tab wraps to the first control");
  await key("Tab");
  await expect(`document.activeElement === ${element(expanded)}`, true, "Tab advances to the editor");
  await enter(expanded, editedOverall);
  await key("Escape");
  await expect(`${element(dialog)} === null && document.activeElement === ${element(expand)}`, true,
    "Escape closes the modal and restores focus to the trigger");
  await expect(`${element(overall)}.value`, editedOverall, "The modal updates the inline retained editor");
  await enter(retainedScore, "7");
  await expect(`${element(currentScore)}.value`, "3", "Editing retained score leaves current score alone");
  await expect(`${element(currentStrengths)}.value`, "Current strengths A", "Retained edits leave current sections alone");
  assert.equal(await read(`${element(currentScore)}.closest('div').innerText.includes('Current A')`), true);
  await activate(`${original} > summary`);
  assert.match(await read(originalText), /Original generated score 8/);
  assert.match(await read(originalText), /Original A overall/);
  assert.match(await read(originalText), /Original rubric evidence/);
  assert.doesNotMatch(await read(originalText), /Reviewed/);
  await expect(saveStatus, saveRefusal, "The controller reports the simulated save refusal");

  await copyAndWait(copyAll, "A strength, evidence\n\nImprove, detail");
  await settle(true);
  await expect(statusText, "Copied", "Successful copy gets a status");
  await expectAX("button", `Copy all ${retained} feedback for ${repo}`);
  await copyAndWait(copyOverall, "Reviewed, detail");
  await settle(false);
  await expect(statusText, copyFailure, "Rejected active copy gives manual-copy guidance");

  await copyAndWait(copyOverall, "Reviewed, detail");
  await enter(overall, latestOverall);
  await settle(true);
  assert.equal(await read(statusText), "", "An edit suppresses the previous copy completion");
  await copyAndWait(copyOverall, latestOverall);
  await activate(retainedDisclosure, "Space");
  await expect(`${element(overall)} === null`, true, "Space collapses and unmounts the retained editor");
  await activate(retainedDisclosure, "Enter");
  await expect(`${element(overall)}?.value`, latestOverall, "The retained edit survives collapse");
  await settle(false);
  assert.equal(await read(statusText), "", "A collapsed instance cannot show a stale copy error in the reopened editor");

  await copyAndWait(copyOverall, latestOverall);
  await activate("main > button:nth-of-type(2)");
  await expect(courseTitle, "Synthetic course B", "Select B while the A clipboard request is pending");
  await openRetained();
  await expect(`${element(overall)}.value`, "Original B overall", "A draft does not appear in B");
  await expect(`${element(currentScore)}.value`, "4", "B has its own current draft");
  await activate("main > button:nth-of-type(1)");
  await expect(courseTitle, "Synthetic course A", "Return to A while its old clipboard request is pending");
  await openRetained();
  await settle(true);
  assert.equal(await read(statusText), "", "A previous course selection cannot show a late copy status");
  await expect(`${element(overall)}.value`, latestOverall, "A's unsaved retained feedback returns from session cache");
  await expect(`${element(retainedScore)}.value`, "7", "A's unsaved retained score returns from session cache");
  await expect(saveStatus, saveRefusal, "A's save refusal returns with the unsaved draft");
  await copyAndWait(copyOverall, latestOverall);
  await settle(true);
  await expect(statusText, "Copied", "A fresh copy works after returning to A");
}
