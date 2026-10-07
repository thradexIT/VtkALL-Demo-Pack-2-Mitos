# MitoS Knowledge Base

This directory is the curated engineering-memory layer for MitoS execution.

It does **not** replace raw evidence, workflow artifacts or certification receipts. Instead, it explains how those pieces connect and preserves the reasoning history that would otherwise be lost across branches, CI runs and superseded implementation attempts.

## Master document

Start here:

- `MITOS_EXECUTION_KNOWLEDGE_BASE_v1.0.md`

The master currently contains:

- immutable execution/safety contract;
- product and authority model;
- R1 Pay Later certification history;
- R2A defects, concurrency race and correction;
- R2B real Mercado Pago TEST provider proof;
- independent direct-provider read-back;
- Mercado Pago Monitoring discrepancy;
- webhook nonclaim from `notification_url: null`;
- complete R3 browser failure history;
- Payment Brick → Custom Secure Checkout decision;
- current card/Yape/Pay Later target;
- exact birth-date cleanup truth and remaining debt;
- custom-checkout CI false-positive history;
- tooling mistakes and no-mutation failures;
- decision log;
- evidence index;
- current status snapshot;
- security findings and next execution sequence.

## Evidence remains authoritative

Raw certification evidence is under:

`docs/mitos/evidence/`

Knowledge documents may summarize evidence, but they must never upgrade a claim beyond what the linked receipt/run/artifact actually proves.

## Preservation rules

1. Do not delete historical versions simply because a later design supersedes them.
2. A failed attempt is retained and classified.
3. Separate `PRODUCT DEFECT` from `HARNESS`, `ENVIRONMENT`, `WORKFLOW/TOOLING`, and provider-UI failures.
4. Record failing evidence before describing the correction.
5. Record the successful post-fix proof separately.
6. Explicitly state what was **not** reached in a failed E2E (for example: no `/api/checkout`, no provider call).
7. Never store secrets, raw PAN, CVV, CardToken, OTP, passwords, cookies or JWTs in knowledge/evidence.
8. Keep `main` / `developer` / deploy claims separate from implementation certification.
9. When a statement previously made was too broad, correct it explicitly rather than silently rewriting history.
10. Every new major gate should update or version the knowledge snapshot.

## Required incident shape

```text
INCIDENT ID
Date
Branch / commit
Intent
Observed symptom
Evidence/run/artifact
Classification
What was NOT affected/reached
Root cause or current hypothesis
Correction
Post-fix evidence
Remaining nonclaims
Reusable lesson
```

## Required decision shape

```text
DECISION ID
Context
Decision
Why
Alternatives rejected/deferred
Security/data implications
Evidence affected
Revisit trigger
```

## Required certification shape

```text
Gate
Branch
PR
Certified commit
Workflow/run
Artifact + digest
Observed assertions
Verdict
Explicit nonclaims
Next gate
```

## Current rule

The repository source/evidence is the technical truth. This knowledge layer exists so future engineers can understand not only **what** MitoS ended up doing, but **why**, which failures shaped the design, and which claims remain deliberately unmade.
