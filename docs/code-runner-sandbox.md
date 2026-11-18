# Isolated code runner

The optional Vercel runner is disabled by default. It is separate from the
repository grader's fenced dispatch path and does not replace a configured
Piston instance.

To prepare C and C++ execution, use a trusted Vercel Container Registry image
with GCC and G++ already installed. Pin the image by digest in
`CODE_RUNNER_SANDBOX_IMAGE` (for example, `team/project/runner@sha256:<digest>`).
Set `CODE_RUNNER_VERCEL_ENABLED=true` only after validating that exact image,
credentials, startup time, compiler, output capture, timeout and cleanup in a
disposable synthetic run. Do not put student files into an image or a probe.
JavaScript and Python use a separate pinned Vercel universal image, so the C++
image does not need those interpreters. To enable common scientific Python
packages, an operator may instead set `CODE_RUNNER_PYTHON_SNAPSHOT` to a trusted
snapshot ID with NumPy, pandas, Matplotlib, SciPy and scikit-learn already
installed. The runner checks those imports in isolated Python before uploading
student files. Build and validate the snapshot separately with pinned, vetted
dependencies and no student content; track provenance and expiration, and
replace it before expiry. The runner never installs a submission's dependencies.
Without this setting Python continues to use the universal image, which does
not guarantee those packages. This setting alone does not provide notebook
execution or establish compatibility with every dependency. Coordinated
repository runs cannot use this snapshot: they return an explicit unavailable
result rather than silently choosing another runner. A configured Piston
endpoint continues to take precedence.

The runtime refuses an absent or unpinned image, checks the required toolchain
before uploading files, starts a nonpersistent VM with network access denied,
and does not retry a run whose outcome is uncertain. It retains the existing
12-second total execution budget; if the image cannot start and execute within
that budget, the run is reported unavailable rather than scored as a student
failure. A live Vercel Sandbox probe has not been completed for this candidate.
