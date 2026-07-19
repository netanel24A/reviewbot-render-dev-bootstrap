# ReviewBot sealed Render DEV publisher

This public repository intentionally contains no ReviewBot application source, plaintext build artifacts, or credentials.

After every gated `dev` build, the private ReviewBot workflow updates `SOURCE_SHA` through a repository-scoped deploy key. The workflow in this repository then fetches exactly that private revision with a separate read-only key, builds the backend, encrypts and authenticates its complete runtime payload with AES-256-GCM, attack-tests the result, and publishes only the sealed image.

Operational guarantees:

- Both deploy keys are scoped to one repository; only the marker key can write, and only to this public bootstrap.
- GitHub's published Ed25519 host key is pinned with strict host verification.
- The requested 40-character source revision is verified before compilation.
- A missing key, wrong key, modified ciphertext, visible plaintext filesystem, or leaked key fails the workflow.
- The public GHCR image contains Node, the small decryptor, and authenticated ciphertext only.
- Render stores the decryption key as a secret file and can pull the public sealed image after an ordinary restart without any expiring registry credential.
