# Projection Framework Concepts

This file is the source for framework concept records.

Framework concept records describe projection-generic grammar. They help a
capsule be read and checked, but they do not become projection-core content or
projection validity.

## Record Shape

Records use one pipe-separated table inside `## Records`.

```txt
id | layer | strength | depends_on | may_be_adopted_by | must_not_become | verifier_role | note
```

List fields use comma-separated values. Add a record when a concept must be
classified across layers. Add longer prose only when the one-line record is not
enough.

Dependencies may point to projection-core declarations in this framework's
current capsule shape or to framework concept records. Framework concept
dependencies must resolve to records in this file.

## Strength

```txt
absolute
  the nucleus only

core-required
  every projection core must carry it

universal-framework
  every projection can be reasoned about through it, but it is not necessarily
  projection-core content

common-optional
  many projections may adopt it through kit

body-local
  meaningful inside one body arrangement
```

## Reading Flow

Framework concepts form a reading order for bounded declarations, not a runtime
lifecycle and not extra projection-core content.

```txt
current projection-core declarations
  -> capsule bounds sealed declaration
  -> seal declares structural commitment
  -> integrity names checked structural match
  -> ref makes a bounded target addressable
  -> relation connects bounded declarations structurally
  -> replacement checks changed bounded declarations
  -> verification witnesses structure, seals, and relations
```

The flow stays small so a capsule can be checked without making the checker,
relation, replacement proof, or document into a second center.

## Records

```txt
id | layer | strength | depends_on | may_be_adopted_by | must_not_become | verifier_role | note
projection-framework:capsule | projection-framework | universal-framework | projection-core:origin,projection-core:claims,projection-core:boundary,projection-core:body-ref | projection-policy,projection-kit,projection-bodies | nucleus,origin,meaning-source,projection-core-history | capsule-shape-check | bounded sealed declaration
projection-framework:integrity | projection-framework | universal-framework | projection-framework:seal | projection-policy,projection-kit,projection-bodies | nucleus,origin,truth-source,semantic-validity | integrity-check | property that bounded content still matches its declared commitment
projection-framework:ref | projection-framework | universal-framework | projection-framework:capsule | projection-policy,projection-kit,projection-bodies | nucleus,identity,origin,truth-source | bounded-ref-check | addressable reference
projection-framework:relation | projection-framework | universal-framework | projection-framework:capsule,projection-framework:ref | projection-policy,projection-kit,projection-bodies | nucleus,origin,semantic-relation,projection-core-history,root-registry | relation-check | structural connection between bounded declarations
projection-framework:replacement | projection-framework | universal-framework | projection-framework:relation,projection-framework:ref | projection-policy,projection-kit,projection-bodies | nucleus,origin,required-upgrade-path,projection-core-history,lineage-log | replacement-check | relation check across changed bounded declarations
projection-framework:seal | projection-framework | universal-framework | projection-framework:capsule | projection-policy,projection-kit,projection-bodies | nucleus,origin,truth-source,meaning-source | seal-check | declared structural commitment on a capsule
projection-framework:verification | projection-framework | universal-framework | projection-framework:capsule,projection-framework:relation,projection-framework:seal | projection-policy,projection-kit,projection-bodies | nucleus,origin,truth-source,meaning-judge,projection-validity-source | witness-check | witness check of declared structure seals and relations
```

## Notes

Capsule, seal, integrity, ref, relation, replacement, and verification are
framework concepts because capsules can be reasoned about through them. They
remain outside projection-core.

A seal protects structure, not meaning. Integrity is structural, not semantic.
A ref makes a bounded target addressable without deciding identity, truth,
ownership, or meaning. Relation connects bounded declarations without becoming a
semantic relation, ontology, lineage log, or second center.

Replacement identifies what changed and what stayed committed across a
candidate change; it does not create an upgrade path, lineage log, or new
origin. Verification may accept or reject a bounded claim under a rule, but
checks remain witnesses, not sources.

Hash is the current seal fingerprint. It is an implementation note, not a
concept record, and does not verify truth, meaning, authority, or identity.
