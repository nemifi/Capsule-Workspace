# Projection Interop Architecture

Common optional grammar for intent-routed, index-derived,
proposal-negotiated, target-guarded, compatibility-planned,
adapter-mediated, session-bounded coordination across any number of
projections.

Interop is not pairwise linking. Pairwise exchange is one small case of a
fabric where projections publish readable interfaces, declare intents, derive
candidate indexes, negotiate proposals, make target-bound guard state visible,
plan compatibility, run bounded sessions, record evidence, and only then
preserve relations when continuity matters.

## Purpose

Projection interop lets unrelated projections coordinate without sharing a
domain model, runtime, repository, schema family, or authority. It supports
deep two-projection collaboration and large many-projection coordination by
making contact surfaces, desired outcomes, translations, session boundaries,
observations, target-bound pre-runtime guard state, and optional continuity
explicit.

Interop must not become identity, permission, ownership, trust, enforcement,
projection validity, a production runtime, or a global registry.

## Layering

Core remains origin material. Framework remains generic capsule grammar. Kit
interop is optional participation grammar. Bodies may adopt interop records,
ignore them, or replace them without changing active origin material.

Interop records may mention origin commitments, surfaces, capabilities,
payloads, schemas, namespaces, contexts, events, lineage, and interpretations,
but bodies own runtime behavior and domain meaning.

`interface/` is the first concrete fabric grammar. It defines canonical
interface manifests so unrelated projections can publish readable contact
shape before intents, compatibility plans, adapters, sessions, evidence, or
relations exist.

`intent/` is the second concrete fabric grammar. It defines canonical intent
manifests so projections can declare desired outcomes, constraints, scale, and
participant roles before compatibility plans, adapters, sessions, evidence, or
relations exist.

`compatibility/` is the third concrete fabric grammar. It defines canonical
compatibility plans so projections can make proposal-bound selected
participants, ready guard-targeted role assignments, verified adapter needs,
constraints, risks, and observed evidence needs visible before any session or
side effect exists.

`adapter/` is the fourth concrete fabric grammar. It defines canonical adapter
contracts so proposal-bound, guard-target-bound endpoint, effect, payload,
protocol, identity, stream, and vocabulary translation can be declared with
explicit basis references, effect mappings, payload mappings, loss bounds, and
verification fixtures before any adapter execution or session exists.

`session/` is the fifth concrete fabric grammar. It defines canonical session
records so compatibility plans, verified adapter contracts, and ready guard
targets can be assembled into one finite admitted coordination instance with
covered roles, ready participants, bounded effects, lifecycle, failure policy,
and closed admission risks before evidence or relations are preserved.

`evidence/` is the sixth concrete fabric grammar. It defines canonical
evidence records so proposal-bound and session-bound observations about
readability, planning, adapting, guard targets, execution, failure, receipts,
or results can be preserved with adapter, participant interface, artifact,
receipt, result, claim, risk, and guard target bindings before optional
relations are written.

`relation/` is the seventh concrete fabric grammar. It defines canonical
relation records so accepted proposal/session-bound evidence with visible
receipt and result bindings can preserve finite continuity among basis-bound
participants and explicit edges without creating a central registry, hidden
graph, sync engine, membership system, or ownership system.

`index/` is the eighth concrete fabric grammar. It defines canonical index
records so source records, ready source bindings, and complete source
freshness can derive bounded candidate views without complete pairwise graphs,
central registries, or hidden search services. Derived index candidates and
links remain bounded by scope roles and effects, ready evidence or relation
source bindings, binding material, current freshness, and closed risks.

`proposal/` is the ninth concrete fabric grammar. It defines canonical
proposal records so bound index candidates can negotiate bounded-effect
offers, requests, terms, targets, and participant responses before
compatibility plans, adapter contracts, or sessions are assembled.

`guard/` is the tenth concrete fabric grammar. It defines canonical guard
records so proposal targets, scope effects, checks, participant decisions,
artifacts, policy, consent, safety, secret, runtime readiness, limit, and risk
state can stay visible before compatibility planning, adapter execution, or
session execution.

## Fabric Model

The fabric is a small kernel with open vocabulary:

```txt
interface     -> what a projection can expose, accept, emit, query, stream, or invoke
intent        -> desired outcome, context, constraints, and scale
compatibility -> proposal-bound selected participants, ready guard-targeted roles, verified adapters, constraints, risks, and observed evidence
adapter       -> guard-target-bound translation between declared endpoint interfaces, effects, payloads, vocabularies, protocols, identities, or streams
session       -> finite admitted coordination instance bound to verified adapters, covered roles, ready participants, ready guard targets, lifecycle, bounds, and risks
evidence      -> proposal/session-bound observation with subject, adapters, participant interfaces, guard targets, receipts, results, artifacts, claims, risks, method, and observed result
relation      -> optional finite continuity from accepted proposal/session-bound evidence, basis-bound participants, explicit edges, constraints, risks, and supersession
index         -> reproducible candidate/link view derived from source records, ready evidence or relation bindings, scope, complete source freshness, and closed risks
proposal      -> negotiable coordination request with index targets, bounded effects, offers, requests, terms, and participant responses
guard         -> visible proposal-target-bound checks, decisions, artifacts, policy, consent, safety, secret, runtime, limit, and risk state
```

No projection must know every other projection. Discovery uses derived indexes
and intent filters; sessions assemble only the participants and adapters needed
for a bounded coordination instance.

## Record Families

Interop record families are conceptual shapes, not mandatory root files:

```txt
interface     -> projection, surfaces, capabilities, vocabularies, effects
intent        -> requester, outcome, constraints, context, scale
compatibility -> intent, proposal, satisfied guards, ready guard_targets, selected participants, roles, verified adapters, constraints, risks, evidence_needed
adapter       -> compatibility, proposal, guards, guard_targets, basis, source, target, endpoint_interfaces, effect_mapping, payload_mapping, loss, evidence, verification
session       -> compatibility, proposal, admission, guards, guard_targets, adapters, participants, roles, lifecycle, bounds, failure_policy, risks, evidence_needed
evidence      -> subject, proposal, session, participants, participant_interfaces, adapters, guards, guard_targets, receipts, results, artifacts, claims, risks, observation, method, observed
relation      -> proposal, participants, participant_interfaces, edges, evidence, sessions, receipts, results, continuity, constraints, risks, state, supersedes
index         -> sources, ready bindings, binding_material, derivation, filters, scope, candidates, links, complete freshness, risks
proposal      -> intent, index, targets, participants, bounded offers, bounded requests, terms, responses
guard         -> proposal, targets, scope effects, participants, checks, decisions, artifacts, limits, risks
```

The family names keep records readable across projections. They do not force a
universal schema, global ontology, central store, or shared runtime.

## Coordination Flow

Interop is intent-first, target-guarded, and session-bounded:

```txt
publish interfaces
declare intent
derive candidates
propose bounded coordination
verify target-bound guards
plan compatibility
select adapters and roles
run bounded session
record proposal/session-bound receipt/result evidence
persist relation only after accepted proposal/session-bound evidence
```

Two projections use the same flow as ten thousand projections. The difference
is only candidate selection, role assignment, adapter graph size, and session
fanout.

## Scale Model

Large-scale interop must avoid complete pairwise graphs. Candidate indexes are
derived from interfaces, intents, contexts, ready evidence bindings, ready
relation bindings, and complete source freshness, and may be rebuilt from
sources. Compatibility planning narrows many possible projections into bounded
participant sets before any session runs.

Indexes are acceleration surfaces, not truth, permission, ownership, or
required infrastructure.

## Operations

Reference operations remain thin and optional:

```txt
inspect-interface -> read one projection's declared interfaces
verify-interface  -> check one canonical interface manifest
declare-intent    -> write or receive one bounded intent
verify-intent     -> check one canonical intent manifest
derive-index      -> build a reproducible ready-bound source candidate/link view
verify-index      -> check one canonical index record with scoped candidates, scoped links, ready evidence/relation bindings, binding material, complete freshness, and closed risks
declare-proposal  -> write or receive one bounded index-target proposal
verify-proposal   -> check one canonical target/effect-bound proposal record
declare-guard     -> write or receive one bounded proposal-target guard record
verify-guard      -> check one canonical target/check/decision-bound guard record
plan              -> derive ready guard-targeted compatibility roles, adapters, constraints, risks, and evidence needs
verify-plan       -> check one canonical proposal/guard/adapter/evidence-bound compatibility plan
verify-adapter    -> check one canonical guard-target-bound adapter contract with declared endpoint interfaces, effect mappings, payload mappings, fixtures, and verified-state readiness
open-session      -> record a bounded guard-target-admitted coordination instance with verified adapters, covered roles, ready participants, ready guard targets, and no open risks
verify-session    -> check one canonical guard-target-admitted session record with basis-bound participants, required adapter coverage, admitted-state readiness, and bounded effects
observe           -> add proposal/session-bound evidence about reading, planning, adapting, guard targets, executing, failing, receipts, or results with artifacts and observed claims
verify-evidence   -> check one canonical proposal/session-bound evidence record with basis-bound participant interfaces, positive bindings, observed claims, closed risks, and verified adapter effect coverage
relate            -> record optional finite continuity after accepted proposal/session-bound evidence with basis-bound participants and explicit edges
verify-relation   -> check one canonical evidence-bound relation record with accepted evidence, covered participants, active required edges, closed risks, and explicit supersession
verify            -> check record grammar and derived-index reproducibility
```

Operations add or derive records. They do not mutate active origin material,
execute body runtimes by default, or make adoption mandatory.

## Boundary

Interop is a protocol-of-protocols. It should stay small enough to let new
domains appear without changing the kernel, and explicit enough that adapters,
risks, and evidence are visible instead of hidden in implicit glue.

Bodies own adapter execution, data transformation, authorization, safety
policy, side effects, user consent, secret access, runtime decisions, and
domain interpretation.

## Verification Contract

```txt
id | obligation | scope
interop:adapter-mediated | Interop uses explicit proposal-bound and guard-target-bound adapters for vocabulary, payload, protocol, identity, stream, or effect translation instead of forcing one universal schema. | projection-kit
interop:adapter-verified | Verified adapter contracts require ready compatibility, declared endpoint interface basis records, satisfied or waived guards, ready guard targets, required effect and payload mappings without unknown loss, observed required evidence, verification fixtures, satisfied or waived constraints, and mitigated risks. | projection-kit
interop:compatibility-ready | Interop compatibility plans become ready only from selected participants, satisfied or waived guards, ready guard targets, satisfied roles, verified required adapters, observed required evidence, and satisfied or waived constraints. | projection-kit
interop:derived-index | Interop indexes are reproducible candidate and link views from visible sources, ready evidence or relation source bindings, scoped roles and effects, binding material, complete source freshness, and closed risks, not source records, truth, permission, ownership, global graphs, or required infrastructure. | projection-kit
interop:evidence-bounded | Interop evidence records finite proposal/session-bound observations with adapter, guard target, receipt, and result bindings without becoming truth or enforcement. | projection-kit
interop:evidence-positive | Positive interop evidence observations require basis-bound participant interfaces, ready participants, observed claims, artifacts, no open risks, verified adapter effect coverage, positive required receipts and results, verified required adapters, satisfied or waived guards, and ready guard targets. | projection-kit
interop:guard-visible | Interop guard records make proposal targets, scope effects, checks, participant decisions, artifacts, policy, consent, safety, secret, runtime readiness, limit, and risk state visible without becoming permission, consent capture, enforcement, or execution. | projection-kit,body
interop:intent-routed | Interop starts from desired outcomes and constraints rather than mandatory pairwise links. | projection-kit
interop:kernel-small | The interop kernel stays small, optional, body-independent, and outside projection validity. | projection-kit,projection-core,body
interop:proposal-bounded | Interop proposals make finite index targets, bounded effects, offers, requests, terms, participant responses, and bounds visible before compatibility planning or session execution. | projection-kit
interop:relation-continuity | Interop relations preserve only finite continuity from accepted proposal/session-bound evidence, basis-bound participant interfaces, covered participants, explicit non-self edges, satisfied or waived constraints, no open risks, and explicit supersession references when superseding. | projection-kit
interop:relation-last | Interop relations are optional continuity records created after accepted proposal/session-bound evidence, not the starting point of coordination. | projection-kit
interop:session-admitted | Interop sessions become admitted only with basis-bound participant interfaces, non-empty required adapter coverage for required roles, verified required adapters, satisfied or waived guards, ready guard targets, ready participants and roles, and no open risks. | projection-kit
interop:session-first | Interop treats two-party and many-party coordination as bounded sessions with roles, lifecycle, participants, failure policy, verified adapters, and ready guard targets. | projection-kit
```
