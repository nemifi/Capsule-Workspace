# Projection Interop Adoption

Guide for projections that adopt interop records.

## Minimal Adoption

An adopting projection may publish only an interface manifest and still remain
compatible with the fabric:

```txt
interop/
  interfaces/
```

Additional record families can be adopted as needed. Some record verifiers
require explicit upstream basis records when a later record claims readiness;
for example, compatibility plans read proposal records and target-bound guard
records.

```txt
interop/
  intents/
  compatibility/
  adapters/
  sessions/
  evidence/
  relations/
  indexes/
  proposals/
  guards/
```

Records belong outside `projection-root/core/`. Derived indexes remain
reproducible from source records.

Reusable interface grammar lives in `projection-root/kit/interop/interface/`.
Reusable intent grammar lives in `projection-root/kit/interop/intent/`. Reusable
compatibility plan grammar lives in `projection-root/kit/interop/compatibility/`.
Reusable adapter contract grammar lives in `projection-root/kit/interop/adapter/`.
Reusable session record grammar lives in `projection-root/kit/interop/session/`.
Reusable evidence record grammar lives in `projection-root/kit/interop/evidence/`.
Reusable relation record grammar lives in `projection-root/kit/interop/relation/`.
Reusable index record grammar lives in `projection-root/kit/interop/index/`.
Reusable proposal record grammar lives in `projection-root/kit/interop/proposal/`.
Reusable guard record grammar lives in `projection-root/kit/interop/guard/`.
Other interop families may remain body-local until narrower reusable grammar
appears.

## Record Families

Adoption may use any subset of the interop family:

```txt
interface     -> readable surfaces and capabilities
intent        -> desired outcome and constraints
compatibility -> proposal-bound ready guard-targeted roles adapters constraints risks and evidence
adapter       -> guard-target-bound explicit translation shape with endpoint basis and mappings
session       -> guard-target-admitted bounded coordination instance with verified adapter coverage
evidence      -> proposal/session-bound finite observation with artifacts and observed claims
relation      -> optional finite continuity after accepted evidence and covered edges
index         -> derived candidate/link view from ready bindings scope and complete source freshness
proposal      -> negotiable coordination request from index targets and bounded effects
guard         -> visible proposal-target checks decisions artifacts and readiness state
```

The families are open vocabulary. A body can make them concrete for robotics,
media, games, SaaS, documents, workflows, or future domains without changing
projection validity.

## Planning

Planning is read-first. A planner reads interfaces and intents, derives
candidate sets, writes or receives proposals, verifies target-bound guards,
proposes compatibility, names adapters, and lists evidence needs. It does not
have to write relations or run sessions.

```txt
intent -> candidates -> proposal -> guard -> compatibility -> adapters -> session plan -> evidence needed
```

Pairwise plans and many-party plans use the same shape.

## Boundaries

Interop adoption must not edit active origin material. It must not make a
central registry, universal ontology, permission system, ownership model,
runtime, or trust source.

Bodies own runtime execution, safety checks, authorization, consent, data
movement, side effects, secret access, policy execution, and interpretation.

## Verification

Adopting projections should verify that source records are canonical for their
chosen family, derived indexes can be rebuilt, sessions are bounded and
admitted through verified adapters, required adapter coverage for required
roles, ready participants, ready guard targets, and closed risks. Adapters bind
their endpoint interfaces through basis records, declare required effect and
payload mappings, avoid unknown loss on required verified mappings, and include
fixtures before verified state. Evidence remains finite proposal/session-bound
observation, and positive evidence should bind participant interfaces through
basis records, keep participants ready, observe claims, include artifacts,
close risks, cover effects with verified adapters, and keep required receipts
and results positive. Index records should derive candidates and links only
from scoped roles and effects, ready evidence or relation source bindings,
their session, receipt, and result material, complete source freshness, and
closed risks. Proposal records should bind participants, targets, offers,
requests, effects, and responses to the selected index candidates. Guard
records should bind proposal targets, scope effects, checks, participant
decisions, and supporting artifacts before compatibility planning.
Compatibility plans should become ready only from selected participants,
satisfied roles, satisfied or waived guards, ready guard targets, verified
required adapters, observed required evidence, and satisfied or waived
constraints. Relation records should preserve continuity only after accepted
proposal/session-bound evidence, bind participant interfaces through basis
records, cover active or ready participants with explicit non-self edges,
close risks, and name superseded relation references when using superseding
continuity.

Interface manifests can use the reusable verifier:

```sh
node projection-root/kit/interop/interface/verify.mjs interop/interfaces/current.json
```

Intent manifests can use the reusable verifier:

```sh
node projection-root/kit/interop/intent/verify.mjs interop/intents/current.json
```

Compatibility plans can use the reusable verifier:

```sh
node projection-root/kit/interop/compatibility/verify.mjs interop/compatibility/current.json
```

Adapter contracts can use the reusable verifier:

```sh
node projection-root/kit/interop/adapter/verify.mjs interop/adapters/current.json
```

Session records can use the reusable verifier:

```sh
node projection-root/kit/interop/session/verify.mjs interop/sessions/current.json
```

Evidence records can use the reusable verifier:

```sh
node projection-root/kit/interop/evidence/verify.mjs interop/evidence/current.json
```

Relation records can use the reusable verifier:

```sh
node projection-root/kit/interop/relation/verify.mjs interop/relations/current.json
```

Index records can use the reusable verifier:

```sh
node projection-root/kit/interop/index/verify.mjs interop/indexes/current.json
```

Proposal records can use the reusable verifier:

```sh
node projection-root/kit/interop/proposal/verify.mjs interop/proposals/current.json
```

Guard records can use the reusable verifier:

```sh
node projection-root/kit/interop/guard/verify.mjs interop/guards/current.json
```

## Verification Contract

```txt
id | obligation | scope
interop-adoption:adapter-contract-bound | Adapter contracts bind compatibility, proposals, guards, ready guard targets, endpoint interface basis records, explicit required effect and payload mappings, bounded or known verified mapping loss, and fixtures without becoming runtime execution. | projection-kit
interop-adoption:adoption-optional | A projection may adopt interop record families incrementally, or none, without changing projection validity; readiness-bearing records may require visible upstream basis records. | projection-kit,projection-core
interop-adoption:body-owned-runtime | Runtime execution, safety, authorization, consent, data movement, side effects, and interpretation remain body-owned. | projection-kit,body
interop-adoption:compatibility-ready-bound | Compatibility plans become ready only from selected participants, satisfied roles, satisfied or waived guards, ready guard targets, verified required adapters, observed required evidence, and satisfied or waived constraints. | projection-kit
interop-adoption:derived-index-not-source | Derived indexes remain reproducible candidate/link views from ready evidence or relation bindings, scoped roles and effects, binding material, complete source freshness, and closed risks rather than source records, registries, truth, global graphs, or required infrastructure. | projection-kit
interop-adoption:evidence-positive-bound | Positive evidence observations bind proposal, session, subject, participant interfaces, verified adapter effect coverage, guards, ready guard targets, artifacts, observed claims, closed risks, receipts, and results without becoming truth or enforcement. | projection-kit
interop-adoption:guard-target-visible | Guards bind proposal targets, scope effects, checks, participant decisions, and artifacts without becoming permission, consent capture, policy execution, or runtime execution. | projection-kit,body
interop-adoption:origin-untouched | Interop records live outside projection-core and adoption must not edit active origin material. | projection-kit,projection-core
interop-adoption:planning-read-first | Interop planning reads interfaces, intents, proposals, and target-bound guards before proposing compatibility, adapters, sessions, evidence, or relations. | projection-kit
interop-adoption:proposal-target-bound | Proposals bind participants, targets, bounded effects, offers, requests, terms, and responses to selected index candidates before compatibility planning. | projection-kit
interop-adoption:relation-continuity-bound | Relation records preserve finite continuity only from accepted proposal/session-bound evidence, basis-bound participant interfaces, covered participants, explicit non-self edges, closed risks, and explicit supersession references without becoming ownership, membership, sync, or a global graph. | projection-kit
interop-adoption:session-admitted-bound | Session admission requires basis-bound participant interfaces, non-empty required adapter coverage for required roles, verified required adapters, satisfied or waived guards, ready guard targets, ready participants and roles, and no open risks without becoming runtime execution. | projection-kit
```
