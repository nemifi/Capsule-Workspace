# AGENTS.md

Root operating rules for agents working in this projection capsule.

Keep this file stable across projection names, bodies, surfaces, proofs, and
implementation stacks. Body-specific agent rules belong in the current body.

## Authority

Follow instructions in this order:

1. System, developer, tool, and security instructions.
2. The user's newest explicit request.
3. This root `AGENTS.md`.
4. The current body `AGENTS.md`, when one exists.
5. Root orientation and architecture maps: `PROJECTION.md`,
   `projection-root/policy/ARCHITECTURE.md`,
   `projection-root/framework/ARCHITECTURE.md`, and
   `projection-root/kit/ARCHITECTURE.md`.
6. Current body architecture and active docs, when they exist.
7. Current body archive docs as background and history, not active truth.

If local discovery cannot resolve a real blocker, stop and name it precisely.

## Projection Boundary

- The current body declaration is carried by `projection-root/core/body-ref/`;
  `kind` is `single` or `fleet`, and `ref` names the body root or fleet
  manifest.
- Root owns orientation, sealed declarations, framework, policy, and optional
  kit.
- The body owns implementation, runtime behavior, tooling, packages, proof
  details, body-local docs, and body-local rules.
- Keep `projection-root/core/` declaration-only. Do not move implementation,
  runtime behavior, docs lists, package lists, proof details, reusable tooling,
  history, or conventional app shape into root core.
- Keep projection-specific operational support under `projection-support/`.
  Manifests, locks, bootstrap/update scripts, doctors, workspace verifiers,
  E2E proofs, and generated support artifacts must not accumulate as ad hoc
  root files.
- Do not change the active origin, nucleus, or policy origin witness as a
  normal update. Treat that as root surgery or a different projection claim
  unless the user explicitly asks for it.
- Keep the current atom nucleus token length fixed at 48 characters by default.
  A future grammar may increase that length, but must not reduce it.

## Default Mutable Area

- For ordinary implementation, documentation, tooling, and proof work, edit
  only the current body declared by `projection-root/core/body-ref/` and
  `projection-support/`.
- In a fleet projection, the current body area is the set of fleet members named
  by the body-ref manifest, plus `projection-support/`.
- Treat `AGENTS.md`, `PROJECTION.md`, `README.md`, and `projection-root/` as
  sealed root material during ordinary work.
- Editing root orientation, framework, kit, policy, core, origin, nucleus,
  body-ref, root documents, or seed-owned system files requires an explicit
  root surgery or body replacement request.

## Workflow

- Never create or switch git branches unless the user explicitly asks.
- If the user asks for a new branch and does not name it, use the `codex/`
  prefix.
- Preserve user-authored changes and commit only scoped assistant changes.
- Prefer the next safe action over asking for permission.
- Do not introduce schema machinery, registries, logs, or root-level app shape
  as workarounds unless the user explicitly asks.
- Use `rg` or `rg --files` for search.
- Use `apply_patch` for manual file edits.
- Keep edits scoped and prose concise.

## Verification

Use the smallest proof that matches the change:

- Projection policy: `node projection-root/policy/verify/run.mjs`
- Generic framework shape: `node projection-root/framework/verify/run.mjs`
- Projection core capsules only: `node projection-root/framework/verify/run.mjs --core`
- Body replacement or multiplicity: `node projection-root/framework/verify/run.mjs --replacement`
- Body-local change: use the current body verifier.
- Documentation-only change: `git diff --check`

If verification cannot run, report the exact reason and the nearest check that
did run.

## Commit Policy

- After completed repository changes, commit and push the assistant's scoped
  changes unless the user explicitly asks not to.
- Before committing, inspect `git status` and `git diff`.
- Push to the current branch. Do not create or switch branches for the push.
- If commit or push cannot complete, report the exact reason.

## Verification Contract

The verifier checks these operating-rule obligations without freezing the exact
wording of the rest of this file.

```txt
id | obligation | scope
agents:body-archive-background | Body archive docs remain background and history, not active truth. | agents,body
agents:body-rules-delegated | Body-specific agent rules are delegated through the current body authority chain. | agents,body
agents:branch-explicit | Branch creation or switching requires an explicit user request, with codex prefix only when an unnamed new branch is requested. | agents,repository
agents:commit-scoped-current-branch | Completed scoped assistant changes are committed and pushed to the current branch without branch switching. | agents,repository
agents:default-mutable-area | Ordinary implementation, documentation, tooling, and proof work stays within the current body or projection-support; root documents and projection-root changes require explicit root surgery or body replacement. | agents,repository,root-docs,body,projection-support
agents:origin-protected | Active origin, nucleus, policy origin witness, and nonshrinking nucleus length stay protected unless explicitly requested. | agents,projection-core,projection-policy
agents:projection-support-boundary | Projection-specific operational support stays under projection-support rather than accumulating as ad hoc root files. | agents,projection-support,repository
agents:root-body-boundary | Root ownership and body implementation ownership remain separated. | agents,projection-core,body
agents:verification-routes | Agent verification routes name policy, framework, core, replacement, body-local, and documentation checks. | agents,projection-framework,projection-policy,body
agents:workflow-tools | Root workflow keeps search, manual edits, and prose scope rules discoverable. | agents,repository
```
