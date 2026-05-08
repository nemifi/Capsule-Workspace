# Capsule Workspace

Capsule Workspace is one current fleet projection around a nucleus. The name,
folder, README, child repositories, workspace manifest, and lock are finite
orientation, not center, truth, protocol, universe, or canonical form. Read
[PROJECTION.md](PROJECTION.md) for placement law.

## Shape

```txt
workspace root
  PROJECTION.md
  AGENTS.md
  README.md
  .gitignore

projection policy
  projection-root/policy/
    ARCHITECTURE.md
    origin-witness/
    verify/

projection framework
  projection-root/framework/
    ARCHITECTURE.md
    CONCEPTS.md
    verify/

projection kit
  projection-root/kit/
    ARCHITECTURE.md
    CONCEPTS.md
    interop/

projection core
  projection-root/core/
    atom/ | molecule/
    claims/
    boundary/
    body-ref/

body
  fleet manifest
  Capsule Base
  Capsule Generator
  Capsule Directory
  Capsule Updater
  Capsule OS
```

The current body path or fleet manifest is declared by body-ref rather than by
root convention. For this projection, body-ref declares a fleet manifest, and
the child projection roots plus workspace support tools remain body-owned.

## Boundaries

`projection-root/core/` declares only active origin, current claims, current
boundary, and current body declaration.

`projection-root/framework/` owns generic grammar, relation checks, replacement
support, framework concept records, and generic verification.

`projection-root/kit/` owns optional reusable participation grammar, including
interop fabric records. Kit adoption remains useful rather than projection
validity.

`projection-root/policy/` owns this projection's origin witness, root document
policy, and root placement rules.

The fleet body owns the child projection checkouts, the workspace manifest, the
workspace lock, bootstrap/update scripts, workspace doctor, workspace verifier,
and E2E proof. Body-local docs and verification stay inside the current body.

The root avoids conventional app configuration so implementation shape stays
body-owned.

## Root Docs

```txt
PROJECTION.md
AGENTS.md
README.md
projection-root/framework/ARCHITECTURE.md
projection-root/framework/CONCEPTS.md
projection-root/policy/ARCHITECTURE.md
projection-root/kit/ARCHITECTURE.md
projection-root/kit/CONCEPTS.md
projection-root/kit/interop/ADOPTION.md
projection-root/kit/interop/ARCHITECTURE.md
projection-root/kit/interop/manifest.json
```

## Reading Order

1. Read `PROJECTION.md` for placement law.
2. Read the fleet manifest for the current child projection body members.
3. Read each child projection's body adoption records and meaning owners.
4. Use the workspace doctor for a quick fleet health read.

## Verification

Run the workspace proof from this folder:

```sh
node verify-workspace.mjs
```

That command verifies every child body, scans the workspace with Capsule
Directory, checks Capsule OS routes for `bootstrap`, `fleet-update`, and
`verify`, runs the OS capability graph with no declaration gaps, runs the
workspace doctor, and completes a temporary generate/discover/route/update
apply/reobserve E2E proof.

Use the doctor when you want a quick health read without every proof:

```sh
node doctor-workspace.mjs
```

Projection policy and framework checks are also available:

```sh
node projection-root/policy/verify/run.mjs
node projection-root/framework/verify/run.mjs
node projection-root/framework/verify/run.mjs --core
node projection-root/framework/verify/run.mjs --replacement
```

Replacement proof keeps body-ref change and finite candidates from becoming a
registry.

## Verification Contract

The verifier checks these repository-orientation obligations instead of locking
the wording of the surrounding prose.

```txt
id | obligation | scope
readme:body-absent-valid-core | The current body may be absent without invalidating projection-core. | projection-core,body
readme:body-local-docs-in-body | Body-local docs and verification stay inside the current body. | body
readme:body-ref-current-body | The current body path or fleet manifest is declared by body-ref rather than by root convention. | projection-core,body
readme:layer-boundaries | The README orients the ownership boundaries among core, framework, protected kit, policy, and body. | root-docs,projection-core,projection-framework,projection-kit,projection-policy,body
readme:no-root-app-config | The root avoids conventional app configuration so implementation shape stays body-owned. | repository,body
readme:orientation-not-center | The README orients one current projection without making the name, repo, or document the center. | root-docs,repository
readme:reading-order-adoption-meaning | The reading order points from root placement to body adoption records and meaning owners. | root-docs,body
readme:replacement-nonregistry-proof | Replacement proof keeps body-ref change and finite candidates from becoming a registry. | projection-framework,projection-core
readme:shape-layers-listed | The root shape lists policy, framework, kit, origin, core, and current body roles. | repository,root-docs
readme:verification-entrypoints | The documented verification commands cover policy, framework, core, and replacement checks. | projection-framework,projection-policy
```
