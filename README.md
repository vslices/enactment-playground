# VSlices Enactment Playground

Browser-only, reversible simulation of architectural decisions. **No GitHub Actions, Railway, SQL Server or deployment effects** are performed.

## Default: Landing Composition promotion (2026-11-01)

The default scenario reproduces a bounded subset of the **documented, not yet fully implemented** Landing Composition operational decision:

[Landing Composition — desarrollo, verificación y promoción](https://github.com/atom-dev-serviu/landing-composition/blob/64c0c4996e39c9abe9d8e07fb7e354a8c6cde98f/docs/ci-cd-composition-promotion-decision-2026-11-01.md)

### Operational boundaries

- Owners (\`identity-service\`, \`account-service\`, \`landing-product\`) validate their own behavior with functional \`test-linux.yml\` and own the technical publication mechanism. Their PRs and \`main\` do **not** independently trigger publication.
- \`landing-composition\` coordinates the exact participating revisions (gitlinks in the real system), Linux transversal E2E/SQL evidence, and Windows/IIS-specific regression evidence for interactive products. Not every service requires Windows tests.
- Merge applicable owner PRs **before** Composition, preserving tested exact revisions and verifying evidence validity after merge. An altered merge tree invalidates reused evidence in this simple simulator.
- Only Composition/main with complete passing evidence authorizes a \`request-promotion\` simulation for **QA interno**; eligibility alone does not issue effects.
- Owners execute authorized requests and report observed terminal status and exact deployed revision. Missing, incompatible or unhealthy dependency revisions block Landing. Dependency observations re-evaluate **publication only**, not CI.
- QA Serviu and PROD are **manual** and are not automated by this simulator.
- Evidence is illustrative user-entered data; the simulator does not verify real Git provenance, runner configuration, approvals or IIS fidelity.

### Reproduction

In **Overview**, interact with the Composition card and the three participant cards. Use **Restablecer ejemplo** for candidates/PR CI evidence without deployment, or **Desde cero** to build a new linear history. Example sequence:

1. Merge Identity, Accounts, Landing (each owner's PR validation is already simulated as green).
2. Merge Composition (its simulated Linux E2E and Windows/IIS tests are already green).
3. **Evaluar evidencia** on Composition: the decision becomes \`eligible\`; no publication is queued yet.
4. **Solicitar QA interno** from Composition.
5. Start and complete authorized Identity and Accounts publications, observing \`SUCCESS\` and the exact versions; Landing becomes queued without repeating tests.
6. Start and complete Landing publication. Inspect raw inputs, derived logs, the history cursor and the shareable URL.

Try merging a different tree, an inconclusive Windows result, or an incompatible observed Identity revision to see why promotion is blocked. If a merge changes a tree, re-run the necessary simulated test for that same tree before evaluation.

The two tabs remain **Overview** and **Raw Config**. The latter contains separate editors for **Raw Config** and **Raw Interactions**. The current state is a deterministic replay of the interaction prefix selected by the cursor. Interactions are local browser simulation; real infrastructure is never contacted.

## Compatibility and sharing

The previous three-repository MVP remains at [legacy.html](legacy.html). Existing \`#v1.\` links are redirected there automatically. The Composition scenario uses a separate \`#v2.\` document format; compression is URL-safe and local-only, with no backend or credentials.

## Build and publishing

\`\`\`sh
npm install
npm run check
python3 -m http.server -d site 8080
\`\`\`

The canonical hosted surface is \`https://vslices.alive-lab.dev/playground/enactment/\`, assembled and published by \`vslices/index\` from an exact tested source commit. The Enactment PR and CI must be checked before updating the Index SHA; deployment is never an action of the playground.

## Out of scope

Real CI/CD, permissions and workflow dispatch, branch protection, real Git SHA/tree attestation, isolated SQL Server, genuine Windows/IIS regression harness, staging migration and secrets, multi-environment promotion, production-grade concurrency and cancellation, arbitrary composition graphs, persistent fork histories and accounts. The experimental model is evidence for evolving protocol design, not evidence that the operational agreement has been realized.
