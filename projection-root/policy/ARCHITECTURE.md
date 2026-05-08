# Projection Policy Architecture

Current projection-local policy map.

Policy is not core, framework, kit, or body implementation. It keeps this
projection's witness and root document policy outside generic framework and
optional adoption layers.

## Current Layout

```txt
projection-root/policy/
  ARCHITECTURE.md
  origin-witness/
  verify/
```

## Policy Role

`projection-root/policy/` owns this projection's active origin witness, root
placement policy, root support-boundary policy, and root document checks.

The framework verifies generic grammar and relations. Policy checks that the
generic result still matches this projection's active witness and root contract.
For this capsule, that root contract includes a protected `projection-root/kit/`
layer; kit adoption remains optional, but the shared kit vocabulary is not a
disposable body artifact.

`projection-support/` is the standard boundary for projection-specific
operational support. Policy may allow that root entry without treating its
contents as core, framework, kit, policy, body implementation, or projection
validity.

## Default Mutable Area

Ordinary implementation, documentation, tooling, and proof work belongs in the
current body declared by body-ref, or in `projection-support/`. In a fleet
projection, the current body area is the set of member root entries named by the
fleet manifest, plus `projection-support/`.

Root material is sealed by default. Normal policy verification rejects git
diffs outside the default mutable area, including root documents,
`projection-root/`, framework, kit, policy, core, origin, nucleus, body-ref, and
seed-owned system files. A root mutation outside the default mutable area must
be covered by a canonical `PROJECTION_ROOT_OPERATION` artifact, or by explicit
root surgery. Set `PROJECTION_ROOT_SURGERY=1`, or pass `--root-surgery` to
`projection-root/policy/verify/run.mjs`, only for an explicit root surgery or
body replacement request.

Capsule Base is the one projection that authors the reusable system layer, but
it does so only through the `base-seed-authoring` operation. That operation
requires the target root and actor root to both be Capsule Base, the current
body role to be `capsule-base`, and the write set to stay inside the seed-owned
paths declared by `projection-root/policy/seed-manifest.json`. It does not open
`projection-root/core/`, `projection-root/policy/origin-witness/`,
`projection-support/`, body material, or projection-owned root documents.

## Root Operations

`PROJECTION_ROOT_OPERATION` points at a canonical operation artifact. The
artifact declares `operation`, `actorRoot`, `targetRoot`, `targetRole`,
`writeSet`, `forbiddenSet`, and `preconditions`. Policy verification compares
the current git diff with that artifact:

```txt
changed paths outside the default mutable area must be inside writeSet
changed paths must not be inside forbiddenSet
targetRoot must match the verified projection root
targetRole must match the verified projection body identity
```

Supported operation kinds are:

- `base-adoption-apply`: a consumer adopts a Capsule Base release. Base is a
  read-only source, the target must not be Capsule Base, and writes stay inside
  adopted system paths plus the adoption witness.
- `base-seed-authoring`: Capsule Base authors its own seed-owned system layer.
  Actor and target are the same Capsule Base root.
- `base-seed-proposal`: any projection may write a proposal under
  `projection-support/proposals/base-seed/`; it does not mutate Capsule Base.
- `consumer-root-surgery`: a non-Base projection may perform an explicitly
  scoped root improvement against itself, without writing active origin
  material.

## Seed Boundary

`projection-root/policy/seed-manifest.json` declares which root paths are seed-owned, which root paths are projection-owned, and which family-level seed docs are forbidden. Seed ownership means the file was materialized from the Capsule Base scaffold so the capsule can run independently after creation; it is not a runtime dependency on Capsule Base. Projection-owned paths remain local claim material, current root documentation, active body ref target material, and the `projection-support/` boundary.

The seed manifest is canonical JSON. Policy verification checks its contract, stable shape, seed-owned path list, projection-owned path list, body-ref source, and forbidden interop family doc patterns. This keeps normal shared seed copies visible without allowing repeated family documentation to grow back under `projection-root/kit/interop/*/`.

## Origin Witness

The active origin witness is sealed data in `projection-root/policy/origin-witness/`,
not hard-coded verifier authority. The verifier checks witness shape, seal,
bounded ref, sha256 commitment, and agreement with active origin.

Changing active origin is not a normal update. It is a different projection
claim unless an explicit root-surgery exception says otherwise. Root surgery
must not reduce the current 48-character nucleus grammar.

Normal policy verification also rejects git diffs in origin material. Set
`PROJECTION_ROOT_SURGERY=1` only for explicit root surgery.

Policy also rejects nested single body refs, reserved root entries, invalid
fleet body manifests, root-level fleet manifests, and fleet manifests that try
to hide body-owned support files as root entries. A single body remains one
ignored root entry. A fleet body manifest lives under `projection-support/` and
may declare member root entries without making policy execute or interpret the
members.

## Verification

`verify/run.mjs` verifies:

- generic framework checks,
- active origin witness data and negative tamper proofs,
- origin material diff guard for normal updates,
- changed-origin, nested single body ref, and invalid fleet manifest rejection,
- default mutable area git diff guard for ordinary work,
- operation artifact validation for scoped root mutation,
- root PROJECTION, AGENTS, README, policy, and kit document policy,
- document contract records and concept record graph shape,
- invalid kit dependency, duplicate, cycle, and document-drift proofs,
- root placement for policy, framework, kit, core, support, ignored current
  body members, and the seed boundary manifest.

Body-local implementation and proof checks stay inside the current body.

## Verification Contract

The verifier checks these policy obligations as records instead of depending on
the exact wording of the surrounding prose.

```txt
id | obligation | scope
policy:base-authoring-seed-window | Capsule Base policy verification permits seed-owned system-layer diffs only through a base-seed-authoring operation artifact, without opening projection-owned root material. | projection-policy,repository,root-docs
policy:body-ref-root-placement | Policy rejects nested single body refs, reserved root entries, and invalid fleet body manifests so current body declarations cannot hide unrelated root shape. | projection-policy,projection-core,body
policy:data-witness | The policy layout carries active origin witness data and root policy verification. | projection-policy
policy:default-mutable-area-diff-guard | Normal policy verification rejects git diffs outside the current body or projection-support unless an operation artifact, explicit root surgery, or body replacement covers them. | projection-policy,repository,root-docs,body,projection-support
policy:kit-protected-root-layer | This projection policy keeps projection-root/kit as a protected root layer while kit adoption remains optional and not projection validity. | projection-policy,projection-kit,body
policy:origin-change-different-claim | Active origin changes remain different projection claims unless explicitly handled as root surgery. | projection-policy,projection-core
policy:projection-local | Projection policy stays local to this projection and outside core, framework, kit, and body implementation. | projection-policy,projection-core,projection-framework,projection-kit,body
policy:projection-support-boundary | Policy allows projection-support as the standard operational support boundary while rejecting ad hoc root support files, root-level fleet manifests, and fleet body-owned root support entries. | projection-policy,projection-support,repository,body
policy:root-operation-artifacts | Policy verifies scoped root operation artifacts by matching target identity, write set, forbidden set, and operation kind before allowing root mutation. | projection-policy,repository,root-docs,body,projection-support
policy:seed-boundary-manifest | Policy carries a canonical seed boundary manifest that names seed-owned paths, projection-owned paths, the body-ref source, and forbidden interop family docs without creating a runtime dependency on Capsule Base. | projection-policy,projection-framework,projection-kit,body
policy:verification-covers-witness-records | Policy verification covers witness shape, root placement, document contracts, concept record graph shape, and negative proofs. | projection-policy,projection-framework,projection-kit,root-docs
policy:witness-not-hardcoded | The origin witness is sealed policy data, not hard-coded verifier authority, and must match active origin ref and commitment. | projection-policy,projection-core
```
