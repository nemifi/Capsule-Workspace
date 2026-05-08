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
placement policy, and root document checks.

The framework verifies generic grammar and relations. Policy checks that the
generic result still matches this projection's active witness and root contract.
For this capsule, that root contract includes a protected `projection-root/kit/`
layer; kit adoption remains optional, but the shared kit vocabulary is not a
disposable body artifact.

## Seed Boundary

`projection-root/policy/seed-manifest.json` declares which root paths are seed-owned, which root paths are projection-owned, and which family-level seed docs are forbidden. Seed ownership means the file was materialized from the Capsule Base scaffold so the capsule can run independently after creation; it is not a runtime dependency on Capsule Base. Projection-owned paths remain local claim material, current root documentation, and the active body ref target.

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

Policy also rejects nested single body refs, reserved root entries, and invalid
fleet body manifests. A single body remains one ignored root entry. A fleet
body manifest may declare member root entries and body-owned support entries
that policy can ignore for root placement without executing or interpreting the
members.

## Verification

`verify/run.mjs` verifies:

- generic framework checks,
- active origin witness data and negative tamper proofs,
- origin material diff guard for normal updates,
- changed-origin, nested single body ref, and invalid fleet manifest rejection,
- root PROJECTION, AGENTS, README, policy, and kit document policy,
- document contract records and concept record graph shape,
- invalid kit dependency, duplicate, cycle, and document-drift proofs,
- root placement for policy, framework, kit, core, ignored current body, and the seed boundary manifest.

Body-local implementation and proof checks stay inside the current body.

## Verification Contract

The verifier checks these policy obligations as records instead of depending on
the exact wording of the surrounding prose.

```txt
id | obligation | scope
policy:body-ref-root-placement | Policy rejects nested single body refs, reserved root entries, and invalid fleet body manifests so current body declarations cannot hide unrelated root shape. | projection-policy,projection-core,body
policy:data-witness | The policy layout carries active origin witness data and root policy verification. | projection-policy
policy:kit-protected-root-layer | This projection policy keeps projection-root/kit as a protected root layer while kit adoption remains optional and not projection validity. | projection-policy,projection-kit,body
policy:origin-change-different-claim | Active origin changes remain different projection claims unless explicitly handled as root surgery. | projection-policy,projection-core
policy:projection-local | Projection policy stays local to this projection and outside core, framework, kit, and body implementation. | projection-policy,projection-core,projection-framework,projection-kit,body
policy:seed-boundary-manifest | Policy carries a canonical seed boundary manifest that names seed-owned paths, projection-owned paths, the body-ref source, and forbidden interop family docs without creating a runtime dependency on Capsule Base. | projection-policy,projection-framework,projection-kit,body
policy:verification-covers-witness-records | Policy verification covers witness shape, root placement, document contracts, concept record graph shape, and negative proofs. | projection-policy,projection-framework,projection-kit,root-docs
policy:witness-not-hardcoded | The origin witness is sealed policy data, not hard-coded verifier authority, and must match active origin ref and commitment. | projection-policy,projection-core
```
