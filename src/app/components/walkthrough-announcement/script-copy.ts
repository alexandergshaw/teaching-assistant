/** Only the latest copy of the current script may update the status. */
export function createScriptCopyController() {
  let version = 0;
  return {
    invalidate() { version += 1; },
    async copy(text: string, write: (text: string) => Promise<void>, report: (status: "copied" | "failed") => void) {
      const request = ++version;
      try {
        await write(text);
        if (request === version) report("copied");
      } catch {
        if (request === version) report("failed");
      }
    },
  };
}
