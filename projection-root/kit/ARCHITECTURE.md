# Projection Kit Architecture

Body-independent map for reusable projection participation grammar.

Kit is not core, framework, policy, or body implementation. It names common
forms without making them projection validity. This capsule keeps the kit layer
present and protected so shared optional vocabulary is not lost by accident.

## Current Layout

```txt
projection-root/kit/
  ARCHITECTURE.md
  CONCEPTS.md
  interop/
    ARCHITECTURE.md
    interface/
      verify.mjs
    intent/
      verify.mjs
    compatibility/
      verify.mjs
    adapter/
      verify.mjs
    session/
      verify.mjs
    evidence/
      verify.mjs
    relation/
      verify.mjs
    index/
      verify.mjs
    proposal/
      verify.mjs
    guard/
      verify.mjs
  materialization/
    catalog.json
    verify.mjs
  toolchain/
    manifest.json
    verify.mjs
    typescript/
      manifest.json
      verify.mjs
```

## Kit Role

`projection-root/kit/` carries grammar that many projections may adopt for
participation, exposure, exchange, continuity, discovery, or migration.

Common forms include context, surface, surface-manifest, event, lineage,
migration, namespace, payload, schema, interpretation, capability, interop
fabric records, materialization records, and toolchain declaration records. A
projection may adopt none of them and still remain valid when its core is valid.

`interop/` carries reusable grammar for intent-routed, index-derived,
proposal-negotiated, target-guarded, compatibility-planned,
adapter-mediated, session-bounded coordination across any number of
projections. It treats pairwise collaboration as one case of an open fabric
that can also coordinate many projections without complete pairwise links or a
central registry.

`interop/interface/` carries the first concrete fabric grammar: canonical
interface manifests that declare readable surfaces, capabilities, messages,
resources, streams, queries, effects, vocabularies, and proof without making
those declarations permission, runtime, trust, identity, or projection
validity.

`interop/intent/` carries canonical intent manifests that declare desired
outcomes, scale, constraints, inputs, expected results, participant roles,
vocabularies, and proof without making those declarations commands, sessions,
permission, runtime, trust, or projection validity.

`interop/compatibility/` carries canonical compatibility plans that declare
proposal reference, selected participants, ready guard target coverage,
target-guarded role fulfillment, verified adapter needs, constraints, risks,
observed evidence needs, basis records, and planning disposition without
making those declarations sessions, adapter implementations, permission,
runtime, trust, or projection validity.

`interop/adapter/` carries canonical adapter contracts that declare bounded
translation between proposal-bound and guard-target-bound compatibility roles,
participants, endpoints, declared endpoint interfaces, payloads, protocols,
identities, streams, effects, and vocabularies. Verified adapters require
explicit effect and payload mappings, known or bounded required mapping loss,
fixture evidence, ready compatibility, satisfied or waived guards, ready guard
targets, satisfied or waived constraints, observed required evidence, and
mitigated risks without making those declarations adapter execution, data
movement, permission, runtime, trust, or projection validity.

`interop/session/` carries canonical session records that declare one finite
guard-target-admitted coordination instance with proposal, participants,
roles, verified adapter requirements, ready guard target requirements,
lifecycle, bounds, failure policy, risks, and evidence needs. Admitted
sessions require non-empty adapter coverage, required roles covered by
required adapters, participant interfaces in the session basis, verified
required adapters, satisfied or waived guards, ready guard targets, ready
participants and roles, and no open risks without making those records
execution, permission, queues, workflow engines, runtime handles, trust, or
projection validity.

`interop/evidence/` carries canonical evidence records that declare finite
observations about readability, planning, adapting, guard targets, execution,
failure, receipt, or result with proposal, session, adapter, guard target,
receipt, and result bindings. Positive observations require basis-bound
participant interfaces, ready participants, observed claims, artifacts, closed
risks, verified adapter effect coverage, positive required receipts and
results, verified required adapters, satisfied or waived guards, and ready
guard targets without making those records truth, permission, enforcement,
runtime, audit completeness, relation preservation, trust, or projection
validity.

`interop/relation/` carries canonical relation records that declare finite
continuity among basis-bound participant interfaces, covered participants,
edges, accepted proposal/session-bound evidence, receipts, results,
constraints, lifecycle, risks, and explicit supersession. Continuity-bearing
relations require accepted required evidence, covered active or ready
participants, non-self edges, active required edges for active state, satisfied
or waived required constraints, no open risks, and named superseded relation
references for superseding continuity without making those records ownership,
permission, synchronization, runtime, membership, registries, graph databases,
trust, or projection validity.

`interop/index/` carries canonical index records that declare bounded
candidate and link views derived from source records, ready evidence or
relation source bindings, scoped roles and effects, complete source freshness,
filters, candidates, links, and closed risks. Derived indexes require
candidate and link basis records to include ready evidence or relation source
bindings with their session, receipt, and result material, and derived state
must not carry stale freshness, stale or unknown candidates, blocked or stale
links, or open risks without making those records truth, permission, central
registries, search services, graph databases, runtime, availability, trust, or
projection validity.

`interop/proposal/` carries canonical proposal records that declare finite
negotiable coordination requests with intent, index-bound targets,
participants, bounded-effect offers and requests, terms, responses, bounds,
and lifecycle without making those records permission, consent, enforcement,
contracts, runtime, queues, workflow engines, trust, or projection validity.

`interop/guard/` carries canonical guard records that declare visible
proposal-target-bound policy, consent, safety, secret, participant decision,
runtime readiness, scope effect, artifact, limit, and risk state before
compatibility planning, adapter execution, or session execution without making
those records permission grants, consent capture, policy execution, runtime,
enforcement, trust, or projection validity.

## Materialization

`materialization/` carries the reusable declarations that let Capsule Generator
choose the default projection shape without asking a human to pick a framework
on every new capsule. It names standard profiles, feature contracts, the
default toolchain, and the receipt requirement.

The materialization catalog is not Capsule Generator itself. It is also not a
template store, package store, framework store, migration engine, runtime, or
projection validity. Generator-owned implementation and dependency resolution
belong outside root kit, and generated package files, source files, support
tooling, locks, and receipts belong only in the body or `projection-support/`
of the projection that needs them.

`toolchain/` carries reusable toolchain manifests and declaration checks. A
toolchain declaration may name the current default reference language and prove
useful machine paths, but it must not become root truth, a package set, a
source tree, a required consumer support directory, body implementation,
production runtime, or projection validity.

## Concept Records

`CONCEPTS.md` carries common optional concept records. Each record declares
layer, strength, dependencies, adoption surface, limits, verifier role, and
note.

The concept table is a local reading map, not a root registry or complete list.

## Boundary

Kit grammar must not depend on, execute, interpret, or require the current
body. It must not own this projection's origin witness, define production
runtime, or make adoption mandatory.

Bodies may adopt kit grammar and give adopted records contextual meaning.
Policy may protect the presence and shape of this capsule's kit files without
turning kit adoption into projection validity.

Kit leaf families are declaration-first. A leaf family carries its shape in a
manifest, concept record, canonical record, or verifier before it earns a new
document. Do not add per-leaf `ARCHITECTURE.md` or `ADOPTION.md` files as the
default explanation surface.

## Placement Rule

Put a concept in kit when it is reusable across projections but not required
for every projection to exist.

Put details in an existing kit map, a manifest, or a verifier when the concept
does not introduce a new ownership boundary. Add a new architecture document
only when a reusable family is explicitly elevated to a shared map rather than
one more leaf record family.

## Verification Contract

The verifier checks these kit obligations as records, leaving the explanatory
prose free to improve.

```txt
id | obligation | scope
kit:adoption-not-required | A projection may adopt no kit records and still remain valid when its core is valid. | projection-kit,projection-core
kit:body-independent | Kit grammar must not depend on, execute, interpret, or require the current body. | projection-kit,body
kit:concept-records | Kit concept records declare layer, strength, dependencies, adoption surface, limits, verifier role, and note. | projection-kit
kit:concepts-not-registry | The kit concept table remains a local reading map, not a root registry or complete concept list. | projection-kit,root-docs
kit:interop-fabric-optional | Interop fabric grammar remains optional coordination grammar outside origin material, not identity, permission, ownership, registry, runtime, or projection validity. | projection-kit,projection-core
kit:leaf-docs-forbidden | Kit leaf families use manifests, records, and verifiers first; per-leaf ADOPTION.md and ARCHITECTURE.md files must not grow as the default explanation surface. | projection-kit,root-docs
kit:materialization-declarative | The materialization catalog names standard profiles, feature contracts, and toolchain declarations for Capsule Generator without becoming the generator, templates, package store, runtime, or projection validity. | projection-kit,body
kit:optional-reusable | The kit remains optional reusable participation grammar and common form naming, not projection validity. | projection-kit,projection-core
kit:participation-forms-common | Context, surfaces, events, lineage, migration, payloads, schemas, namespaces, interpretations, capabilities, materialization, and toolchain declarations remain common optional forms. | projection-kit,body
kit:placement-reusable-not-required | A concept belongs in kit only when reusable across projections but not required for every projection to exist. | projection-kit,projection-core
kit:toolchain-lightweight | Toolchain declarations remain lightweight root kit declarations; package artifacts, lockfiles, build outputs, template trees, source trees, and runtime dependencies must not be materialized into root kit. | projection-kit,body
```
