# ReviewBot sealed Render DEV publisher

This public repository intentionally contains no ReviewBot application source, plaintext build artifacts, or credentials.

On a schedule (or an explicit trusted dispatch), the workflow resolves the current private `dev` revision through a repository-scoped read-only deploy key. It runs the complete release gates against isolated PostgreSQL and Redis services, builds both ordinary production containers, encrypts and authenticates the backend's complete runtime payload with AES-256-GCM, attack-tests the result, and publishes only the sealed image. Render DEV is changed only after every gate and anonymous image-pull verification pass.

Operational guarantees:

- The private-source deploy key is read-only and scoped to the ReviewBot repository.
- GitHub's published Ed25519 host key is pinned with strict host verification.
- The current private `dev` 40-character source revision is verified before compilation.
- Private test/build output is withheld from this public repository's logs.
- A missing key, wrong key, modified ciphertext, visible plaintext filesystem, or leaked key fails the workflow.
- The public GHCR image contains Node, the small decryptor, and authenticated ciphertext only.
- Render stores the decryption key as a secret file and can pull the public sealed image after an ordinary restart without any expiring registry credential.
- The short-lived Render access token is derived from a rotating refresh credential. Only its AES-256-GCM ciphertext is committed; the independent wrapping key remains an Actions secret.
- The anonymously pullable image is resolved to a registry SHA-256 digest, and Render is configured with that immutable digest instead of a mutable tag.
- Every DEV deployment forces the linked-device socket runtime off, forces central proactive messaging off, and removes the retired artificial-typing variable while preserving every non-allowlisted environment entry byte-for-byte.
- The rotated refresh ciphertext is committed before deployment, and the deployed source/digest markers are committed only after Render reports a live deployment and both public health gates pass.
