# VSlices Enactment Playground

Interactive, browser-only TypeScript sandbox for **evidence-gated transitions**. The first scenario is Landing conditional publication. No real GitHub Actions or Railway deployments are executed by the application.

## Protocol owner

Reusable, revisable procedure: [vslices/protocols — Enactment PR #5](https://github.com/vslices/protocols/pull/5). Real releases, versions, secrets, CI evidence and deploy operations remain in their consuming repositories.

## What you can do

- Create N repositories, each depending on previously created repositories.
- Create candidate versions and select a specific version of every dependency.
- Run simulated `test.yml` once per candidate; approve or reject it.
- Run simulated `publish.yml`: report absent, incompatible or unhealthy dependencies.
- Simulate deployment success or failure. A successful dependency publication re-evaluates blocked consumers, queuing **only** `try-deploy-railway`; tests are not repeated.
- Observe all transitions in an event log; reset or load the Landing example.

## Iterative scenarios

0. Model Identity, Accounts and Landing and select exact dependency versions.
1. L2 has green CI but both dependencies are missing: blocked, not a test failure.
2. Publish Identity I1: Landing still blocked by missing Accounts.
3. Publish Accounts A1: one Landing deploy attempt is queued without rerunning tests.
4. Mismatched or unhealthy revisions block publication.
5. Next iterations: duplicate/out-of-order events, concurrency, lifecycle evidence freshness.
6. Eventually connect real infrastructure adapters in owning repositories, not in this public web app.

## Run

Node.js 22+:

```bash
npm install
npm run check
python3 -m http.server -d site 8080
```

## GitHub Pages

CI validates before deploying the `site/` artifact from `main`. Intended custom domain: `enactment.vslices.alive-lab.dev`. Pages and DNS must be configured by the organization. This repository is private; verify Pages access and publishing eligibility.

## Important limits

Illustrative revisions like A1/I1/L2 are **not** real Git SHAs. This is an evolving proof of concept, not a security boundary or deployment authorization system. Before connecting to real environments, model idempotency, concurrency, configuration/migrations, keyring, CI attestations and revision verification.
