// Pure audio-output (speaker) selection logic for teleprompter mode (T6,
// docs/teleprompter-mode-acceptance-criteria.md). This module is a leaf: no
// imports, no browser globals referenced at module scope, so it is directly
// testable under vitest's node environment (finding 6 in the acceptance
// criteria doc). `setSinkId` itself, and enumerating `audiooutput` devices,
// can only be exercised against a real HTMLMediaElement / MediaDevices - that
// glue lives in the (untested) hook, not here.
//
// T6 requires the feature to degrade HONESTLY: where `setSinkId` is not
// supported, the caller must render no control at all, with a stated reason -
// never a select that silently does nothing. `AudioOutputResult` exists so
// the caller can tell "applied" apart from "unsupported" apart from "failed"
// instead of collapsing all three into a boolean.

/** The minimal structural shape this module needs from an HTMLMediaElement.
 * Deliberately NOT importing the DOM lib type here - accepting a minimal
 * shape (rather than `HTMLMediaElement`) is what makes `supportsSinkId`
 * callable from a plain object in a node-env test, with no jsdom. */
export interface SinkCapableElement {
  setSinkId?: (sinkId: string) => Promise<void>;
}

/** A device as this module needs to see it - mirrors the fields useDevices
 * already produces for cameras/mics (deviceId + label), so the same shape
 * covers audiooutput entries without importing that hook's types. */
export interface OutputDevice {
  readonly deviceId: string;
  readonly label: string;
}

/**
 * Feature-detect `setSinkId` on a given element. Takes the element as an
 * argument rather than reading a global, so it is callable with a plain
 * object in a test and works the same way in the browser.
 */
export function supportsSinkId(element: SinkCapableElement | null | undefined): boolean {
  return !!element && typeof element.setSinkId === "function";
}

/** The system default output device id, per the Audio Output Devices API. */
export const DEFAULT_SINK_ID = "default";

/**
 * Decide which sinkId to use given the currently available output devices and
 * a previously stored/selected id. A device can be unplugged between
 * sessions, so a stored id that is no longer present falls back to the system
 * default rather than being applied blindly or throwing.
 */
export function resolveSinkId(devices: OutputDevice[], storedId: string | null | undefined): string {
  if (!storedId) return DEFAULT_SINK_ID;
  const stillPresent = devices.some((d) => d.deviceId === storedId);
  return stillPresent ? storedId : DEFAULT_SINK_ID;
}

export type AudioOutputStatus = "applied" | "unsupported" | "failed";

export interface AudioOutputResult {
  readonly status: AudioOutputStatus;
  readonly sinkId: string | null;
  readonly reason: string | null;
}

/**
 * Build the result the UI renders after attempting to apply a sinkId. This is
 * a pure constructor over the outcome, not the act of calling `setSinkId`
 * itself (that call is a Promise against a real element and belongs in the
 * untested hook) - it exists so every call site produces the same shape and
 * the same three distinguishable states, rather than each caller inventing
 * its own ad hoc success/failure representation.
 */
export function describeApplyResult(
  outcome: "applied" | "unsupported" | { failed: unknown },
  sinkId: string
): AudioOutputResult {
  if (outcome === "applied") {
    return { status: "applied", sinkId, reason: null };
  }
  if (outcome === "unsupported") {
    return {
      status: "unsupported",
      sinkId: null,
      reason: "This browser cannot direct audio to a chosen output device.",
    };
  }
  const err = outcome.failed;
  const message = err instanceof Error ? err.message : "Could not switch the audio output device.";
  return { status: "failed", sinkId: null, reason: message };
}
