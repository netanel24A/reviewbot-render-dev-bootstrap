# syntax=docker/dockerfile:1.7

# This public bootstrap contains no ReviewBot source. Render injects a
# repository-scoped, read-only deploy key for this single instruction only.
FROM node:22-bookworm-slim AS builder

ARG SOURCE_SHA

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
    && rm -rf /var/lib/apt/lists/*

# GitHub's current Ed25519 host key is published at:
# https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
RUN install -d -m 0700 /root/.ssh \
    && printf '%s\n' \
      'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' \
      > /root/.ssh/known_hosts \
    && chmod 0600 /root/.ssh/known_hosts

RUN --mount=type=secret,id=reviewbot_deploy_key,dst=/run/secrets/reviewbot_deploy_key,mode=0400 \
    test "${#SOURCE_SHA}" -eq 40 \
    && case "$SOURCE_SHA" in *[!0-9a-f]*) exit 64 ;; esac \
    && git init /src \
    && cd /src \
    && git remote add origin git@github.com:netanel24A/ReviewBot.git \
    && GIT_SSH_COMMAND='ssh -F /dev/null -i /run/secrets/reviewbot_deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/root/.ssh/known_hosts' \
      git fetch --depth=1 --filter=blob:none origin "$SOURCE_SHA" \
    && git -c advice.detachedHead=false checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "$SOURCE_SHA" \
    && rm -rf /src/.git

WORKDIR /src

RUN npm ci --workspace=@reviewbot/backend --include=optional
RUN npm run build --workspace=@reviewbot/backend

FROM node:22-bookworm-slim AS runtime

ARG SOURCE_SHA

LABEL org.opencontainers.image.revision=$SOURCE_SHA

ENV NODE_ENV=production
ENV PORT=4000
ENV NODE_OPTIONS="--max-old-space-size=1536"

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /src/package.json /src/package-lock.json ./
COPY --from=builder /src/backend/package.json ./backend/
COPY --from=builder /src/frontend/package.json ./frontend/
RUN npm ci --workspace=@reviewbot/backend --omit=dev --include=optional

COPY --from=builder /src/backend/dist ./backend/dist
COPY --from=builder /src/backend/src/database/migrations ./backend/dist/database/migrations

RUN useradd --system --create-home --shell /usr/sbin/nologin reviewbot
USER reviewbot

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "backend/dist/main.js"]
