# ReviewBot Render DEV bootstrap

This repository intentionally contains no ReviewBot application source or credentials.

It provides the reproducible Docker build entry point for the Render DEV service. At build time, Render mounts a repository-scoped, read-only GitHub deploy key as a BuildKit secret. The Dockerfile fetches the exact 40-character `SOURCE_SHA`, verifies it before building, and does not copy the key or Git metadata into the runtime image.

Operational guarantees:

- The deploy key can read only `netanel24A/ReviewBot` and cannot write to it.
- GitHub's published Ed25519 host key is pinned with strict host verification.
- The requested source revision is checked before compilation.
- Render stores the resulting image in its internal registry, so ordinary restarts do not depend on a short-lived external registry token.
- Automatic deploys are disabled; ReviewBot's gated `dev` CI workflow supplies the verified source revision and triggers deployment.
