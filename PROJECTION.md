# Projection

Portable root orientation for a projection capsule.

This document stays valid across projection names, bodies, surfaces, proofs,
kits, and stacks. The repository, root, body, documents, proof, kit, framework,
and name are finite arrangements, not the whole system or production root.

## Premise

A projection capsule is one appearance among unbounded possible projections. The
center is the nucleus. Everything else is finite participation around it.

## Agent Orientation

Agents may generate, develop, replace, connect, and interpret projection forms:
worlds, organizations, operating systems, applications, media, agents, and
other surfaces.

Generated forms remain finite participation. No agent, model, prompt, runtime,
tool, verifier, body, surface, world, organization, application, medium, or
generated agent becomes the center by appearing or arranging.

When placement is uncertain, keep the core small, keep meaning in the body, and
keep optional grammar outside projection validity.

## Nucleus

```txt
Nucleus = irreducible opaque token
Atom = sealed capsule carrying one nucleus
Molecule = sealed capsule composing atom commitments by constitution
Origin = active Atom | active Molecule
Projection = finite participation form of an irreducible nucleus
```

The nucleus is the only absolute commitment, and it carries no meaning. Atom
carries one nucleus without interpreting it. Molecule lets multiple atom
commitments participate in one origin by a declared constitution.

The active origin is the core capsule this projection is arranged around. It is
not history, cause, identity, owner, or meaning. Changing it creates a different
projection claim.

The current atom grammar fixes the nucleus token length at 48 characters. A
future grammar may increase that length, but must not reduce it.

A nucleus is not identity, state, purpose, owner, history, memory, runtime,
body, surface, projection, generator, lineage, or meaning.

## Capsule Boundary

```txt
projection-root/core/        sealed declarations for the current capsule shape
projection-root/framework/   generic grammar and relation verification
projection-root/kit/         optional reusable participation grammar, when present
projection-root/policy/      origin witness and root policy for this projection
<current-body>/         optional implementation body declared by body-ref
<fleet-manifest>        optional fleet body manifest declared by body-ref
PROJECTION.md           root orientation
AGENTS.md               minimal agent operating rules
```

The current body path or fleet manifest is declared by
`projection-root/core/body-ref/`. That declaration carries a `kind` and a
`ref`. `single` points at one body root. `fleet` points at one body manifest
whose members participate as the current body. The root is orientation and
boundary, not production root.

## Layers

```txt
Projection Core = sealed declarations required for a capsule projection claim
Projection Framework = generic grammar and relation support
Projection Kit = optional reusable participation grammar
Projection Policy = this projection's origin witness and root policy
Projection Body = replaceable implementation and meaning
```

Core declares only bounded current capsule shape: origin, claims, boundary, and
body-ref. It does not execute, remember, store history, run a runtime,
interpret nuclei, dereference the body, or define final meaning.

Claim, Boundary, and BodyRef are bounded declarations:

```txt
Claim = current assertion pointer
Boundary = current exposure and limit declaration
BodyRef = current body declaration, either single body or fleet body manifest
```

Framework verifies generic capsule grammar and relation. Kit names optional
reusable participation forms. This capsule carries a protected kit layer, but
kit adoption remains optional and never becomes projection validity. Policy
carries this projection's witness and root rules. Body owns implementation,
behavior, runtime, surfaces, documents, proof details, tools, tests, packages,
growth, and meaning.

The dependency direction is one way:

```txt
core/framework/kit/policy -> do not know or require a body
body -> may adopt core/framework/kit/policy
```

Outside layers may point to a body only through bounded declarations. They must
not execute, dereference, interpret, or require it.

## Concept Placement

A concept belongs where its obligation is true. Importance, frequency, and
meaningfulness do not decide placement.

Concept records are reading maps, not registries, production roots, or sources
of projection validity. Record a concept only when its placement must stay
stable across a boundary, adoption record, or verifier.

```txt
absolute             -> the nucleus only
core-required        -> every projection core must carry it
universal-framework  -> projection capsules can be reasoned about through it
common-optional      -> many projections may adopt it
body-local           -> meaningful inside one body arrangement
```

## Kit

Common concepts are not automatically core concepts. Contexts, surfaces,
surface manifests, events, lineage, migration, interop fabric records, payloads,
schemas, namespaces, interpretations, and capabilities belong in kit only when
reusable across projections but not required for every projection to exist.

The current policy protects this capsule's kit records from disappearing by
accident. That protection preserves shared optional vocabulary; it does not make
any kit record required for projection validity or body adoption.

## Multiplicity

A nucleus may have unbounded possible projections. Multiple nuclei may
participate in one projection through a molecule. A projection may have many
possible bodies and surfaces over time.

This capsule contains one current projection and one current body declaration.
That declaration may describe a single body root or a fleet body manifest, but
finite candidate checks must not create a generator, registry, lineage log, or
active root object.

Interop fabric records are optional participation records for intent-routed,
compatibility-planned, adapter-mediated, session-bounded coordination outside
active origin material. They may declare readable interfaces, plan adapters,
run bounded sessions, record evidence, and preserve optional relations without
making those records identity, ownership, permission, registry, truth, or
projection validity.

## Exposure And Lineage

A projection may expose surfaces. Surfaces are contact forms, not the projection
itself. Bodies may implement or change them.

Change may preserve lineage, but lineage is not the nucleus. Lineage evidence
belongs outside `projection-root/core/` unless it is a bounded current declaration.

## Verification

Verification is a witness to relation, not its source. It may confirm grammar,
seals, bounded refs, replacement, adoption, and relation. It must not make a
verifier, kit, body, runtime, or policy the center.

## Placement Test

Does this protect nuclei without interpreting them?

```txt
required by a capsule projection claim  -> Projection Core
generic grammar or relation support     -> Projection Framework
reusable optional participation grammar -> Projection Kit
this projection's root witness/policy   -> Projection Policy
implementation, runtime, or meaning     -> Projection Body
```

Most things should not enter the core.

## Verification Contract

The verifier reads these machine-checkable obligations. Prose may change when
these contracts and the structural proofs remain true.

```txt
id | obligation | scope
projection:body-ref-declares-current-body | The current body is declared only through the bounded body-ref declaration. | projection-core,body
projection:concept-placement-by-obligation | Concept placement is decided by stable obligation across boundaries, not importance, frequency, or meaning. | root-docs,projection-framework,projection-kit,body
projection:core-body-independent | Core declarations and core verification do not execute, dereference, interpret, or require the current body. | projection-core,projection-framework,body
projection:finite-participation | Generated forms remain finite participation around a nucleus and do not become the center. | root-docs,projection-core,body
projection:kit-optional | Kit records remain optional grammar, not projection validity. | projection-kit,body
projection:layer-separation | Core, framework, kit, policy, and body keep distinct ownership and dependency direction. | projection-core,projection-framework,projection-kit,projection-policy,body
projection:lineage-outside-core-history | Lineage evidence may preserve continuity but must not become the nucleus or projection-core history. | projection-core,projection-kit,body
projection:multiplicity-nonregistry | Finite candidate projection checks must not create a generator, registry, lineage log, or active root object. | projection-framework,projection-core
projection:nucleus-length-nonshrinking | The current atom nucleus token length remains 48 by default and future grammar must not reduce it. | projection-core,projection-framework
projection:nucleus-opaque | The nucleus remains an irreducible opaque token and does not carry identity, meaning, state, history, or ownership. | projection-core,root-docs
projection:origin-change-different-claim | Changing the active origin is a different projection claim unless explicitly treated as root surgery. | projection-core,projection-policy
projection:placement-keeps-core-small | The placement test keeps most concepts outside projection-core unless required by a capsule projection claim. | projection-core,projection-framework,projection-kit,body
projection:verification-witness | Verification remains a witness to structure and relation, never a source of nucleus, truth, meaning, or validity. | projection-framework,projection-policy
```
