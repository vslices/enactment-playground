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
5. **This iteration:** manually observe revisions, health and sequence numbers in each repository; invalidates queued authorization when dependency status drifts, and ignores duplicate or older observations. Concurrency across independent workers and authoritative remote attestation are not implemented yet.
6. Eventually connect real infrastructure adapters in owning repositories, not in this public web app.

## Run

Node.js 22+:

```bash
npm install
npm run check
python3 -m http.server -d site 8080
```

## GitHub Pages and public route

The repository is public. The workflow builds and publishes static output from `main` to its **own** GitHub Pages origin (when Pages is enabled). The application uses relative asset URLs and therefore can be hosted under a subpath.

**Canonical public URL (proposed):** `https://vslices.alive-lab.dev/playground/enactment/`

Do **not** configure `enactment.vslices.alive-lab.dev` as a CNAME: under a standard Cloudflare full DNS setup, Universal SSL does not cover that deeper hostname.

Publishing this repository to GitHub Pages **does not automatically install a route** on `vslices.alive-lab.dev`. The hosting authority for that domain must either:

1. Import the built `site/` output into its static site at `/playground/enactment/`, retaining ownership of the route and static assets; or
2. Route this path and its assets to a separately hosted origin through a verified reverse proxy / Cloudflare Worker. This requires explicit host routing and asset-path validation.

The first option is the simpler default if the VSlices site is generated from a static deployment. Confirm the actual site repository and hosting mechanism before changing production routing.

The `the-alive-lab/index` repository contains `public-surfaces.md`, an **orientation document** favoring low-cost static publication; it does **not** establish that this repository hosts or routes the existing VSlices website.

Check the canonical route with the trailing slash, CSS and JS asset loading, direct refresh and browser navigation after the host integrates it. There is currently **no claim** that the canonical path serves this app.

## Important limits

Illustrative revisions like A1/I1/L2 are **not** real Git SHAs. This is an evolving proof of concept, not a security boundary or deployment authorization system. Before connecting to real environments, model idempotency, concurrency, configuration/migrations, keyring, CI attestations and revision verification.
