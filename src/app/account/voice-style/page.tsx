"use client";

import { useEffect, useState } from "react";
import TopBar from "../../components/TopBar";
import {
  getUserStyleAction,
  saveWritingSampleAction,
  setVoiceCloneAction,
  removeVoiceCloneAction,
  getVoiceSampleUrlAction,
  synthesizeNarrationAction,
} from "../../actions";
import { setVoiceId, clearVoiceId } from "@/lib/voice-id";
import { WRITING_STYLE_PROMPTS, PROMPT_PREFIX, RESPONSE_PREFIX } from "@/lib/writing-style-prompts";
import styles from "../security/security.module.css";

type UserStyle = {
  voiceId: string | null;
  voiceSampleName: string | null;
  hasVoiceSample: boolean;
  writingSample: string | null;
};

export default function VoiceStylePage() {
  const [userStyle, setUserStyle] = useState<UserStyle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Voice upload state
  const [voiceUploadedFiles, setVoiceUploadedFiles] = useState<Array<{ base64: string; mimeType: string; fileName: string }>>([]);
  const [voiceName, setVoiceName] = useState("");
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [testingVoice, setTestingVoice] = useState(false);
  const [removeVoiceArmed, setRemoveVoiceArmed] = useState(false);

  // Writing sample state
  const [writingText, setWritingText] = useState("");
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number | null>(null);

  const getVoiceSampleUrl = async () => {
    try {
      const result = await getVoiceSampleUrlAction();
      if ("error" in result) {
        console.error("Could not get sample URL:", result.error);
      } else {
        setSampleUrl(result.url);
      }
    } catch (err) {
      console.error("Error fetching sample URL:", err);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await getUserStyleAction();
        if (!active) return;
        if ("error" in result) {
          setError(result.error);
        } else {
          setUserStyle(result.style);
          setWritingText(result.style.writingSample || "");
          if (result.style.hasVoiceSample) {
            await getVoiceSampleUrl();
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load voice and style settings.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load persisted prompt selection
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ta-voice-style-prompt");
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedPromptIndex(parseInt(saved, 10));
      }
    }
  }, []);

  // Auto-disarm remove voice button after timeout
  useEffect(() => {
    if (!removeVoiceArmed) return;
    const timer = setTimeout(() => {
      setRemoveVoiceArmed(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [removeVoiceArmed]);

  // Disarm remove button when error or notice changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemoveVoiceArmed(false);
  }, [error, notice]);

  const handleVoiceFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    const newFiles: Array<{ base64: string; mimeType: string; fileName: string }> = [];

    for (let i = 0; i < files.length && i < 5; i++) {
      const file = files[i];
      if (file.size > 7 * 1024 * 1024) {
        setError("One or more files exceed 7 MB. Please select smaller audio files.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const result = evt.target?.result;
        if (typeof result === "string") {
          const base64 = result.split(",")[1] || result;
          newFiles.push({
            base64,
            mimeType: file.type || "audio/mpeg",
            fileName: file.name,
          });

          if (newFiles.length === Math.min(files.length, 5)) {
            setVoiceUploadedFiles(newFiles);
          }
        }
      };
      reader.onerror = () => {
        setError("Could not read one or more audio files.");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateVoiceClone = async () => {
    if (!voiceUploadedFiles.length) {
      setError("Please select an audio file to upload.");
      return;
    }
    if (!voiceName.trim()) {
      setError("Please name your voice clone (e.g., your name).");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await setVoiceCloneAction(voiceName.trim(), voiceUploadedFiles);
      if ("error" in result) {
        setError(result.error);
      } else {
        setNotice("Voice clone created successfully.");
        setVoiceId(result.voiceId);
        setVoiceUploadedFiles([]);
        setVoiceName("");
        const styleResult = await getUserStyleAction();
        if (!("error" in styleResult)) {
          setUserStyle(styleResult.style);
          setWritingText(styleResult.style.writingSample || "");
          if (styleResult.style.hasVoiceSample) {
            await getVoiceSampleUrl();
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create voice clone.");
    } finally {
      setBusy(false);
    }
  };

  const handleTestVoice = async () => {
    setError(null);
    setTestingVoice(true);

    try {
      const result = await synthesizeNarrationAction(
        "Hi class, this is a quick test of my narration voice."
      );
      if ("error" in result) {
        setError(result.error);
      } else {
        const binaryString = atob(result.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch((err) => {
          setError("Could not play audio: " + (err instanceof Error ? err.message : String(err)));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not test voice.");
    } finally {
      setTestingVoice(false);
    }
  };

  const handleRemoveVoice = async () => {
    if (!removeVoiceArmed) {
      setRemoveVoiceArmed(true);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await removeVoiceCloneAction();
      if ("error" in result) {
        setError(result.error);
      } else {
        setNotice("Voice clone removed.");
        clearVoiceId();
        setSampleUrl(null);
        setVoiceName("");
        const styleResult = await getUserStyleAction();
        if (!("error" in styleResult)) {
          setUserStyle(styleResult.style);
          setWritingText(styleResult.style.writingSample || "");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove voice clone.");
    } finally {
      setBusy(false);
      setRemoveVoiceArmed(false);
    }
  };

  // Takes the text explicitly: Clear passes "" so it never reads the stale
  // closure value from the same render.
  const handleSaveWritingSample = async (text: string = writingText) => {
    if (!text.trim() && userStyle?.writingSample) {
      // Clearing - allow empty
    } else if (text.length > 20000) {
      setError("Writing sample must be under 20,000 characters.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await saveWritingSampleAction(text.trim());
      if ("error" in result) {
        setError(result.error);
      } else {
        setNotice(text.trim() ? "Writing sample saved." : "Writing sample cleared.");
        const styleResult = await getUserStyleAction();
        if (!("error" in styleResult)) {
          setUserStyle(styleResult.style);
          setWritingText(styleResult.style.writingSample || "");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save writing sample.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearWritingSample = async () => {
    if (!window.confirm("Clear your writing sample?")) return;
    setWritingText("");
    await handleSaveWritingSample("");
  };

  const handleInsertPrompt = () => {
    if (selectedPromptIndex === null || selectedPromptIndex < 0 || selectedPromptIndex >= WRITING_STYLE_PROMPTS.length) {
      setError("Please select a prompt first.");
      return;
    }

    const prompt = WRITING_STYLE_PROMPTS[selectedPromptIndex];
    const insertion = `\n\n${PROMPT_PREFIX}${prompt}\n${RESPONSE_PREFIX} `;
    setWritingText((prev) => prev + insertion);
  };

  const handlePromptSelect = (index: number) => {
    setSelectedPromptIndex(index);
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-voice-style-prompt", String(index));
    }
  };

  const charCount = writingText.length;
  const charPercentage = (charCount / 20000) * 100;

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Voice & Style</h1>
          <p className={styles.subtitle}>
            Customize your narration voice and writing style for all generated content.
          </p>

          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}

          {loading ? (
            <p className={styles.empty}>Loading your settings…</p>
          ) : (
            <>
              {/* Voice Card */}
              <div className={styles.section}>
                <p className={styles.sectionTitle}>Your Voice</p>

                <div className={styles.empty}>
                  {userStyle?.voiceId ? (
                    <>
                      <strong>Voice clone:</strong> {userStyle.voiceSampleName || userStyle.voiceId}
                    </>
                  ) : (
                    <>Using the default voice</>
                  )}
                </div>

                {userStyle?.hasVoiceSample && sampleUrl && (
                  <div style={{ marginTop: 12 }}>
                    <p className={styles.label}>Recorded sample</p>
                    <audio controls style={{ width: "100%", marginTop: 6 }} src={sampleUrl} />
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <label className={styles.label} htmlFor="voice-upload">
                    {userStyle?.voiceId ? "Replace your voice" : "Upload a voice sample"}
                  </label>
                  <p className={styles.help}>
                    Audio file (30 seconds to 3 minutes of clear speech); max 7 MB total.
                  </p>
                  <input
                    id="voice-upload"
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleVoiceFileSelect}
                    className={styles.input}
                    style={{ padding: 12 }}
                  />
                </div>

                {voiceUploadedFiles.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p className={styles.help}>
                      {voiceUploadedFiles.length} file(s) selected. Name your voice:
                    </p>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g., My Voice"
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      style={{ marginTop: 8 }}
                    />
                  </div>
                )}

                <div className={styles.row}>
                  {voiceUploadedFiles.length > 0 ? (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={handleCreateVoiceClone}
                      disabled={busy}
                    >
                      {busy ? "Creating…" : userStyle?.voiceId ? "Replace voice" : "Create voice"}
                    </button>
                  ) : null}

                  {userStyle?.voiceId && (
                    <>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={handleTestVoice}
                        disabled={busy || testingVoice}
                      >
                        {testingVoice ? "Testing…" : "Test my voice"}
                      </button>

                      <button
                        type="button"
                        className={styles.remove}
                        onClick={handleRemoveVoice}
                        disabled={busy}
                      >
                        {removeVoiceArmed ? "Click again to confirm" : "Remove"}
                      </button>
                    </>
                  )}
                </div>

                <p className={styles.tip}>
                  Workflow narration (including scheduled weekly runs) uses this voice automatically.
                </p>
              </div>

              {/* Writing Card */}
              <div className={styles.section}>
                <p className={styles.sectionTitle}>Your Writing</p>

                <p className={styles.help}>
                  Respond to two or three prompts in your natural voice. The prompts themselves are
                  stripped before your style is learned.
                </p>

                <div style={{ marginTop: 14 }}>
                  <label htmlFor="prompt-select" className={styles.label}>
                    Writing prompt
                  </label>
                  <select
                    id="prompt-select"
                    className={styles.input}
                    value={selectedPromptIndex === null ? "" : selectedPromptIndex}
                    onChange={(e) =>
                      handlePromptSelect(
                        e.target.value === "" ? -1 : parseInt(e.target.value, 10)
                      )
                    }
                  >
                    <option value="">Select a prompt…</option>
                    {WRITING_STYLE_PROMPTS.map((prompt, idx) => (
                      <option key={idx} value={idx}>
                        {prompt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={handleInsertPrompt}
                    style={{ marginTop: 10 }}
                    disabled={selectedPromptIndex === null || selectedPromptIndex < 0}
                  >
                    Insert prompt
                  </button>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label htmlFor="writing-sample" className={styles.label}>
                    Your writing sample
                  </label>
                  <textarea
                    id="writing-sample"
                    className={styles.input}
                    rows={12}
                    placeholder="Paste your responses to the prompts above…"
                    value={writingText}
                    onChange={(e) => setWritingText(e.target.value)}
                    style={{ fontFamily: "inherit", resize: "vertical" }}
                  />
                  <div className={styles.help} style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>
                      Character count: {charCount.toLocaleString()} / 20,000
                    </span>
                    <div style={{ width: "150px", height: "6px", background: "var(--field-border)", borderRadius: "3px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(charPercentage, 100)}%`,
                          height: "100%",
                          background: charPercentage > 100 ? "var(--danger)" : "var(--accent)",
                          transition: "width 0.2s",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <p className={styles.help} style={{ marginTop: 12 }}>
                  Your writing style is used in: announcements, message replies, student nudges,
                  lecture scripts, and generated documents.
                </p>

                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => void handleSaveWritingSample()}
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  {userStyle?.writingSample && (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={handleClearWritingSample}
                      disabled={busy}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
