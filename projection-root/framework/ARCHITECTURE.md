# Projection Framework Architecture

Projection-generic framework map.

The framework is usable by any projection capsule that follows this framework's
current core grammar. It carries no projection-local witness, root document
policy, kit adoption, or body verifier.

## Current Layout

```txt
projection-root/framework/
  ARCHITECTURE.md
  CONCEPTS.md
  verify/
```

## Framework Role

`projection-root/framework/` owns generic capsule grammar, relation checks, document
contract helpers, and replacement proofs. It stays outside `projection-root/core/`,
projection-local policy, optional kit adoption, and any replaceable body.

## Concept Records

`CONCEPTS.md` records framework-level grammar concepts and the generic concept
record shape. These records are compact reading maps, not projection-core
content, registries, or sources of validity.

## Core Grammar Verification

`verify/run.mjs --core` checks only bounded `projection-root/core/` capsules:

```txt
origin (atom or molecule)
body-ref
boundary
claims
```

Core verification does not dereference body-ref, so a missing body is not a
broken core. Body-ref declares `kind` as `single` or `fleet`; `ref` remains a
bounded address, not a body execution or manifest interpretation. Atom nuclei
are opaque 48-character tokens. Molecules carry canonical atom commitments and
canonical constitution JSON. Core capsules stay markerless.

Boundary rules are canonical JSON. Public refs, when present, may expose only
current projection-core declarations, never the body path or arbitrary
body-owned paths.

## Framework Verification

`verify/run.mjs` verifies projection-core grammar, this architecture contract,
framework concept records, replacement relations, and the framework directory
shape. It does not verify root document policy, projection policy, kit
adoption, or body-local layout.

Within `projection-root/framework/`, only this architecture file, concept records,
and generic verifier modules are accepted.

## Replacement Verification

`verify/run.mjs --replacement` copies `projection-root/core/` into a temporary
directory, reseals body-ref to replacement targets, and checks which
commitments stay or change.

The proof covers body replacement, finite candidate multiplicity,
molecule-origin grammar, changed-origin detection, and rejection of invalid
body refs or boundary public refs. It creates no generator, registry, lineage
log, or active root object.

## Replacement Rule

A body may be replaced by changing bounded current declarations such as
body-ref while preserving the active origin.

## Verification Contract

The verifier reads these obligations as contract records. Prose may be edited
freely when these records and the structural checks stay true.

```txt
id | obligation | scope
framework:concepts-not-core-validity | Framework concept records remain reading maps and do not become core content or projection validity. | projection-framework,projection-core
framework:core-body-independent | Core verification checks only bounded projection-core capsules and does not dereference body-ref. | projection-framework,projection-core,body
framework:markerless-bounded-core | Core capsules stay markerless and bounded, with nonshrinking atom nucleus length and non-runtime boundary rules. | projection-framework,projection-core
framework:outside-policy-body | The framework stays outside projection-local policy and replaceable bodies. | projection-framework,projection-policy,body
framework:projection-generic | The framework remains usable by any capsule following the current core grammar and carries no projection-local witness. | projection-framework,projection-policy
framework:replacement-finite-proof | Replacement and multiplicity checks are finite witness proofs, not generators, registries, or lineage logs. | projection-framework,projection-core
framework:replacement-preserves-origin | Body replacement may change bounded declarations such as body-ref without changing the active origin. | projection-framework,projection-core,body
framework:verification-excludes-policy-body | Framework verification excludes root document policy, projection policy, kit adoption, and body-local layout. | projection-framework,projection-policy,projection-kit,body
```
