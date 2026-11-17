# Isolated code runner

The optional Vercel runner is disabled by default. It is separate from the
repository grader's fenced dispatch path and does not replace a configured
Piston instance.

To prepare it, use a trusted Vercel Container Registry image with Python, Node,
GCC and G++ already installed. Pin the image by digest in
`CODE_RUNNER_SANDBOX_IMAGE` (for example, `team/project/runner@sha256:<digest>`).
Set `CODE_RUNNER_VERCEL_ENABLED=true` only after validating that exact image,
credentials, startup time, compiler, output capture, timeout and cleanup in a
disposable synthetic run. Do not put student files into an image or a probe.

The runtime refuses an absent or unpinned image, checks the required toolchain
before uploading files, starts a nonpersistent VM with network access denied,
and does not retry a run whose outcome is uncertain. It retains the existing
12-second total execution budget; if the image cannot start and execute within
that budget, the run is reported unavailable rather than scored as a student
failure. A live Vercel Sandbox probe has not been completed for this candidate.
