import { createSupabaseAuthObserver } from "../context/supabase-auth-observer";
import { createRepoFeedbackBrowser } from "../lib/repo-feedback-browser";

const { accountId, sharedToken, privateToken, foreignOrigin } = globalThis.repoFeedbackNative;
const fetchInChrome = window.fetch.bind(window);
const path = "/auth/repo-feedback-session";
const readinessPath = "/auth/repo-feedback-readiness";

async function verify() {
  const { port, begin } = createSupabaseAuthObserver();
  const observer = begin();
  observer.onBootstrap({ access_token: sharedToken, user: { id: accountId } });
  const feedback = createRepoFeedbackBrowser(port);
  if (!feedback) throw new Error("The browser binding did not initialize.");
  let testForeignMode = false;
  window.fetch = async (url, init) => {
    if (url === location.origin + readinessPath) return fetchInChrome(url, init);
    if (url === "https://feedback-native.example.test/auth/v1/token?grant_type=password") {
      return Response.json({
        access_token: privateToken,
        refresh_token: "synthetic-refresh",
        expires_in: 120,
        token_type: "bearer",
        user: { id: accountId, is_anonymous: false },
      });
    }
    if (url !== location.origin + path) throw new Error("Unexpected fixture request.");
    // A second negative control changes only the URL at the final boundary so
    // native same-origin mode is exercised independently of redirect handling.
    return fetchInChrome(testForeignMode ? foreignOrigin + path : url, init);
  };

  try {
    if (!document.cookie.includes("native_feedback_fixture=1")) throw new Error("Missing fixture cookie.");
    const credentials = { email: "fixture@example.test", password: "synthetic-password" };
    if ((await feedback.signInWithPassword(credentials)).status !== "unlocked") return "FAIL_NATIVE_SESSION_ADMISSION";
    if ((await feedback.signInWithPassword(credentials)).status !== "unavailable") return "FAIL_NATIVE_REDIRECT_ACCEPTED";
    testForeignMode = true;
    if ((await feedback.signInWithPassword(credentials)).status !== "unavailable") return "FAIL_NATIVE_FOREIGN_ACCEPTED";
    return "PASS_NATIVE_FEEDBACK_SESSION";
  } finally {
    window.fetch = fetchInChrome;
    feedback.dispose();
    observer.close();
  }
}

verify().then(
  (result) => { document.querySelector("#result").textContent = result; },
  () => { document.querySelector("#result").textContent = "FAIL_NATIVE_FIXTURE"; },
).finally(() => fetchInChrome("/done"));
