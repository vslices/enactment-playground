# VSlices Enactment Playground

**MVP 01: Landing conditional publication** — browser-only, static, deterministic. No real GitHub Actions, Railway API, credentials or deployments are executed by the app.

The initial scenario demonstrates why Landing L2, with passing `test.yml`, remains **blocked** until the exact versions Identity I1 and Accounts A1 are published and healthy. Publishing the final dependency queues **only** `try-deploy-railway` for Landing; no tests are re-run.

## UI

- **Overview:** Railway-canvas-inspired three-repository topology, actual VSlices mark from [vslices/icons](https://github.com/vslices/icons/blob/main/official/icon.svg), and primary purple `#9C2FA0`. Each repo can create a version, simulate test outcome, try publishing, start a queued deploy, mark success/failure or record a dependency observation.
- **Raw Config:** JSON scenario topology for the three known Landing repositories, plus a separate editable **Raw Interactions** JSON log. Both validate before applying and share one replay model.
- **History:** step back/forward, jump to any interaction, or take a new action from the past (discarding only the prior redo tail in this local simulation).
- **Share:** document version, config, interactions and cursor are encoded as compressed URL-safe JSON in the URL hash. Edits update the hash using `history.replaceState`; no server-side persistence.

A successful deployment observation and its resulting automatic re-evaluations are different from the input interaction that triggered them. Overview's event log is a **derived projection**, not a second authoritative history.

## Try the MVP

The starter document already has three candidates and passing simulated CI for I1, A1, L2, followed by one blocked Landing publication attempt:

1. Under Identity I1, choose **Intentar publish.yml** → **Iniciar deploy** → **SUCCESS**.
2. Landing remains blocked on Accounts.
3. Do the same for Accounts A1; Landing's previous evidence automatically queues one `try-deploy-railway` attempt.
4. Start and complete Landing L2. Use the history slider to rewind, or **Copiar enlace** to reproduce the exact point in a new browser.
5. For an incompatible/unhealthy variant, create a new Identity revision or use **Observar** to change the observed revision/health.

Revisable protocol and scope: [vslices/protocols PR #5](https://github.com/vslices/protocols/pull/5), `enactment/mvp-landing.md`.

## Run locally

Node.js 22 or newer:

```sh
npm install
npm run check
python3 -m http.server -d site 8080
```

Open `http://localhost:8080/`. Unit tests cover state transitions, linear replay/branching, JSON validation and compressed URL roundtrips.

## Publication

The canonical public surface is `https://vslices.alive-lab.dev/playground/enactment/`, **assembled and published by** [vslices/index](https://github.com/vslices/index) using a specifically pinned Enactment source revision. Merge and validate the Enactment PR first, then promote the exact tested revision through a separate Index PR. This repository's own GitHub Pages workflow is not the canonical VSlices host.

No changes to Cloudflare DNS, Railway, real CI release gates or the Landing product/service repositories are part of this MVP.

## Post-MVP

Arbitrary graph authoring, unlimited repositories/environments, persistent branching trees, collaborations/accounts, search, analytics, true attestation/observability and integrations with real deployment services. These are not prerequisites for demonstrating the Landing scenario.
