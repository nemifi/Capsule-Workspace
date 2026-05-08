# Projection Kit Concepts

This file is the source for common optional kit concept records.

Kit records describe reusable concepts many projections may adopt for
participation, continuity, exposure, exchange, discovery, or migration. This
capsule protects the kit files, but a projection body may adopt none of these
records and still remain valid when its core is valid.

## Record Shape

Records use one pipe-separated table inside `## Records`.

```txt
id | layer | strength | depends_on | may_be_adopted_by | must_not_become | verifier_role | note
```

List fields use comma-separated values. Add a record when a common optional
concept needs a stable placement. Do not add a record merely because a word is
useful inside one body.

Dependencies may point to framework or kit concept records. Framework
dependencies must resolve to framework records, and kit dependencies must
resolve to records in this file.

## Concept Map

Kit concepts are participation grammar. They are a reading map for adopted
records, not a required lifecycle and not projection validity.

```txt
origin remains core
  -> context bounds participation and interpretation
  -> surface gives a contact form
  -> surface-manifest lists available surfaces
  -> interop-interface exposes readable contact and capability shape
  -> interop-intent declares desired outcome and constraints
  -> interop-index derives bounded candidate and link views from ready bindings complete freshness scope and closed risks
  -> interop-proposal records target-bound negotiation from index candidates and bounded effects
  -> interop-guard records proposal-target-bound checks decisions artifacts and readiness state
  -> interop-compatibility plans ready guard-targeted roles adapters constraints and evidence
  -> interop-adapter names guard-target-bound explicit translation between endpoint interfaces effects payloads vocabularies or protocols
  -> interop-session admits two-party or many-party coordination through verified adapters ready guard targets and covered roles
  -> interop-evidence records proposal/session-bound finite observations with accepted receipts results and observed claims
  -> interop-relation records optional finite continuity from accepted evidence covered participants and explicit edges
  -> event records bounded change evidence in context
  -> lineage keeps changes in projection form followable
  -> materialization declares standard profiles features and toolchains for Capsule Generator
  -> migration preserves continuity between representations
  -> payload carries extensible content in context
  -> namespace and schema keep records and payloads readable
  -> interpretation reads meaning in context
  -> capability marks an actionable surface affordance
  -> toolchain carries replaceable reference readers and verifiers without becoming root truth
```

A projection may adopt only the records it needs. Bodies give adopted records
meaning in context; kit preserves common shape without owning runtime,
identity, truth, or the nucleus.

## Records

```txt
id | layer | strength | depends_on | may_be_adopted_by | must_not_become | verifier_role | note
projection-kit:capability | projection-kit | common-optional | projection-kit:context,projection-kit:surface | projection-bodies | nucleus,origin,identity,permission,enforcement,agency | optional-adoption-check | actionable surface affordance
projection-kit:context | projection-kit | common-optional | projection-framework:relation | projection-bodies | nucleus,origin,truth-source,global-frame,required-runtime | optional-adoption-check | bounded conditions for participation and interpretation
projection-kit:event | projection-kit | common-optional | projection-framework:relation,projection-kit:context | projection-bodies | nucleus,origin,projection-core-history,universal-event-log | optional-adoption-check | bounded change evidence in context
projection-kit:interop-adapter | projection-kit | common-optional | projection-kit:interop-fabric,projection-kit:payload,projection-kit:schema | projection-bodies | nucleus,origin,universal-schema,permission,enforcement,truth-source | optional-adoption-check | proposal-bound guard-target-bound explicit translation between declared endpoint interfaces effects payloads vocabularies protocols identities or streams
projection-kit:interop-compatibility | projection-kit | common-optional | projection-kit:interop-adapter,projection-kit:interop-fabric,projection-kit:interop-intent | projection-bodies | nucleus,origin,truth-source,permission,central-planner,projection-validity | optional-adoption-check | proposal-bound ready guard-targeted selected participants roles verified adapters constraints and observed evidence for an intent
projection-kit:interop-evidence | projection-kit | common-optional | projection-kit:event,projection-kit:interop-fabric,projection-kit:interop-session | projection-bodies | nucleus,origin,truth-source,permission,enforcement,identity | optional-adoption-check | proposal/session-bound finite observation with adapter guard target participant interface receipt result artifact and claim bindings
projection-kit:interop-fabric | projection-kit | common-optional | projection-framework:relation,projection-kit:context | projection-bodies | nucleus,origin,identity,permission,ownership,root-registry,required-runtime | optional-adoption-check | intent-routed compatibility-planned adapter-mediated session-bounded coordination grammar
projection-kit:interop-guard | projection-kit | common-optional | projection-kit:interop-fabric,projection-kit:interop-proposal | projection-bodies | nucleus,origin,permission,consent,enforcement,truth-source,required-runtime,policy-engine | optional-adoption-check | proposal-target-bound visible policy consent safety secret runtime checks decisions artifacts and readiness state before execution
projection-kit:interop-index | projection-kit | common-optional | projection-kit:interop-evidence,projection-kit:interop-fabric,projection-kit:interop-interface,projection-kit:interop-relation | projection-bodies | nucleus,origin,truth-source,permission,root-registry,global-graph,required-runtime | optional-adoption-check | bounded candidate and link view derived from visible source records with ready evidence or relation bindings complete freshness scope and closed risks
projection-kit:interop-intent | projection-kit | common-optional | projection-kit:context,projection-kit:interop-fabric,projection-kit:payload | projection-bodies | nucleus,origin,identity,permission,enforcement,truth-source | optional-adoption-check | desired outcome constraints context and scale for coordination
projection-kit:interop-interface | projection-kit | common-optional | projection-kit:capability,projection-kit:context,projection-kit:interop-fabric,projection-kit:surface | projection-bodies | nucleus,origin,identity,permission,truth-source,production-root | optional-adoption-check | readable surfaces capabilities vocabularies effects resources actions events streams queries or artifacts
projection-kit:interop-proposal | projection-kit | common-optional | projection-kit:interop-fabric,projection-kit:interop-index,projection-kit:interop-intent | projection-bodies | nucleus,origin,permission,consent,enforcement,truth-source,required-runtime | optional-adoption-check | target-bound negotiable coordination proposal from index candidates bounded effects and participant responses before compatibility planning or session execution
projection-kit:interop-relation | projection-kit | common-optional | projection-kit:interop-evidence,projection-kit:interop-fabric,projection-kit:interop-session | projection-bodies | nucleus,origin,identity,permission,ownership,root-registry,projection-core-history | optional-adoption-check | optional finite continuity from accepted evidence basis-bound participants explicit edges and supersession
projection-kit:interop-session | projection-kit | common-optional | projection-kit:event,projection-kit:interop-compatibility,projection-kit:interop-fabric | projection-bodies | nucleus,origin,required-runtime,permission,enforcement,universal-log | optional-adoption-check | guard-target-admitted coordination instance with verified adapters covered roles ready participants lifecycle and failure policy
projection-kit:interpretation | projection-kit | common-optional | projection-kit:context,projection-kit:payload | projection-bodies | nucleus,origin,truth-source,canonical-meaning | optional-adoption-check | contextual reading of meaning
projection-kit:lineage | projection-kit | common-optional | projection-framework:relation,projection-kit:event | projection-bodies | nucleus,origin,history-root,universal-log,root-registry | optional-adoption-check | followable continuity through changes in projection form
projection-kit:materialization | projection-kit | common-optional | projection-kit:toolchain | projection-bodies,capsule-generator | nucleus,origin,generator-runtime,template-store,package-manager,projection-validity | declaration-shape-check | standard profile feature and toolchain declarations for generator materialization
projection-kit:migration | projection-kit | common-optional | projection-framework:relation,projection-kit:lineage | projection-bodies | nucleus,origin,projection-core-history,required-upgrade-path | optional-adoption-check | continuity-preserving transition between representations
projection-kit:namespace | projection-kit | common-optional | projection-kit:context | projection-bodies | nucleus,origin,global-name-registry,identity,ownership | optional-adoption-check | naming scope
projection-kit:payload | projection-kit | common-optional | projection-kit:context | projection-bodies | nucleus,origin,truth-source,canonical-meaning,validity | optional-adoption-check | extensible content in context
projection-kit:schema | projection-kit | common-optional | projection-kit:namespace,projection-kit:payload | projection-bodies | nucleus,origin,truth-source,universal-type-system,projection-validity | optional-adoption-check | contextual reading shape for records or payloads
projection-kit:surface | projection-kit | common-optional | projection-kit:context | projection-bodies | nucleus,origin,projection,production-root | optional-adoption-check | contact form through which a projection can be observed connected to or acted upon
projection-kit:surface-manifest | projection-kit | common-optional | projection-kit:context,projection-kit:surface | projection-bodies | nucleus,origin,identity,production-root,truth-source | optional-adoption-check | optional record listing available surfaces in context
projection-kit:toolchain | projection-kit | common-optional | projection-framework:relation,projection-kit:schema | projection-bodies | nucleus,origin,truth-source,projection-validity,required-runtime,body-implementation | optional-adoption-check | replaceable reference reader or verifier for projection declarations
```

## Notes

These records capture common participation grammar: context, surface,
surface-manifest, event, lineage, migration, payload, schema, namespace,
interpretation, capability, and interop fabric records. They are common enough
to share, but none is required for projection validity.

Composition, permission, trust, and visibility remain body-local until a
narrower reusable obligation appears.

Context bounds how records, surfaces, events, payloads, and meanings are used
or read. Payload carries extensible content without making every payload an
event or truth source. A surface is not the projection itself and does not own
the nucleus.

Lineage helps changes remain traceable without becoming the nucleus, origin,
history root, or universal log. A capability says a surface can be invoked for
action in context; it does not imply permission, trust, agency, ownership, or
enforcement.

Interop fabric records coordinate projections by intent, derived indexes,
bounded proposals, visible guard records, compatibility, adapters, sessions,
evidence, and optional relations. They do not mutate origin, establish
identity, grant permission, capture consent, create a registry, impose one
schema, run bodies, or become the source of truth for participating
projections.

Materialization records name standard profiles, features, toolchains, and
generator receipt expectations without becoming the generator or carrying
template, package, source, lockfile, or runtime weight in root kit.

Toolchain records name replaceable reference readers and verifiers. They may
make current work easier for humans or agents, but they do not make any
language, package manager, build output, or support directory projection truth.
