# MITOS R2 — Mercado Pago Runtime Certification Plan

Date: 2026-08-31
Status: **R2A CERTIFIED — R2B REAL PROVIDER/SANDBOX PENDING**

## Isolation baseline

- Repository: `thradexIT/bookcars`
- Certification branch: `cert/mitos-r2-mercado-pago-runtime`
- Parent implementation branch: `feature/mitos-rental-completion`
- Frozen starting commit: `b6858ecfb6f7204508c4392dc79898b0bbfba672`
- Starting source CI: `mitos-closure` run #142 — success.
- R2A final certified head: `107886758335752f120aa180a645d22c3bb18530`.
- R2A final certified run: `33440901825` — success.

R2 intentionally starts from the implementation baseline rather than from the R1 Pay Later certification branch. R1 and R2 evidence remain independent.

## Protected refs / forbidden actions

R2 must not modify:

- `main`
- `developer`
- `feature/mitos-rental-completion`
- `cert/mitos-r1-pay-later-runtime`

Forbidden during R2:

- no merge;
- no deployment;
- no Railway changes;
- no production data mutation;
- no production payment;
- no committed provider credentials;
- no Ground Control work;
- no Agent Factory work;
- no broad refactor of already functional code.

Any corrective code required by reproduced R2 evidence stays only on `cert/mitos-r2-mercado-pago-runtime` until separately reviewed.

## Existing trust boundaries to preserve

The current implementation already expresses the following intended rules:

1. online Mercado Pago checkout persists a temporary Booking first;
2. quote requires the persisted reservation session id;
3. quote recalculates amount server-side;
4. browser does not send authoritative amount or currency to create-payment;
5. create-payment requires tokenized provider data, booking id, reservation session and `X-Idempotency-Key`;
6. backend sends `transaction_amount` and `external_reference` to Mercado Pago;
7. payment creation uses the provider idempotency key;
8. provider `approved` is re-read from Mercado Pago before reservation confirmation;
9. webhook authenticity is checked before provider synchronization;
10. provider amount and currency must match the authoritative booking calculation;
11. pending/in-process provider states must not confirm the reservation;
12. reconciliation is authenticated and uses the same provider truth synchronization path.

R2 must certify these boundaries rather than replace them.

## Two certification layers

### R2A — isolated provider-simulated runtime

This layer is executable without real credentials or any public deployment.

It must use:

- ephemeral MongoDB;
- real backend HTTP routes/controllers/middleware;
- real MitoS temporary booking and ReservationState models;
- real PaymentTransaction persistence;
- the Mercado Pago SDK boundary substituted only at the external provider method boundary;
- generated test webhook secret;
- no provider network call.

R2A may certify MitoS behavior around the provider boundary, but it must not claim that Mercado Pago itself accepted a real sandbox payment.

**Result: CERTIFIED.**

Primary receipt:

- `docs/mitos/evidence/MITOS_R2A_MERCADO_PAGO_RUNTIME_CERTIFICATION_RECEIPT_2026-08-31.md`

Final evidence artifact:

- `mitos-r2a-runtime-evidence-33440901825`
- digest `sha256:6e4296729743deac06f288c3a1e89d5b5109024d2fe8fba2d9f937b761ae78a8`

### R2B — real Mercado Pago sandbox/provider proof

This is a separate later gate and requires provider test credentials supplied through a secure runtime secret channel.

Credentials/tokens must never be committed to GitHub source or evidence.

No R2B claim may be made until a real provider call is performed and provider truth is read back. A real inbound provider webhook also requires a provider-reachable callback surface; R2 must not create a deployment merely to manufacture that evidence without explicit authorization.

**Result: NOT YET CERTIFIED.**

## R2A flow certified

`Temporary Booking → authoritative quote → awaiting_payment → create payment → provider pending/approved/rejected truth → webhook/reconciliation → reservation state`

## R2A gates and results

### A. Reservation/session authority — CERTIFIED

- temporary online booking exists before payment;
- wrong reservation session cannot quote or create payment;
- quote moves explicit reservation to `awaiting_payment`;
- quote returns server-owned amount/currency.

### B. Browser trust boundary — CERTIFIED

- create-payment ignores client attempts to become amount/currency authority;
- payer email must correspond to reservation customer;
- missing idempotency key is rejected.

### C. Payment-state semantics — CERTIFIED

- provider `pending` / `in_process` maps to payment `pending`;
- pending payment does not confirm reservation;
- provider `approved` maps to payment `approved`;
- only verified provider approval confirms reservation;
- rejected/refunded mappings remain explicit.

### D. Webhook authenticity — CERTIFIED

- missing/tampered signature metadata is rejected;
- valid HMAC reaches provider synchronization;
- webhook replay remains safe.

### E. Provider truth validation — CERTIFIED

- provider amount mismatch fails closed;
- provider currency mismatch fails closed;
- wrong/missing external reference fails closed;
- browser redirect/callback alone cannot confirm a reservation.

### F. Idempotency / concurrency — CERTIFIED AFTER CORRECTION

- same idempotency key replay does not create another provider payment;
- key collision across different bookings is rejected;
- webhook replay does not duplicate confirmation processing;
- reconciliation replay does not duplicate confirmation processing;
- same booking with a different idempotency key while an active payment exists is blocked;
- two simultaneous requests with different keys for the same booking produce only one provider create;
- a terminal rejected payment releases the active claim so a legitimate later retry can proceed.

## Evidence-first correction history

R2A reproduced two product defects before correction:

1. customer tokens could authorize payment reconciliation;
2. a booking could create another active Mercado Pago payment with a different idempotency key.

The second defect remained reproducible under concurrent requests after the first sequential read-before-write guard. Failing concurrent evidence run `33439437520` observed:

```text
providerCreateCalls = 2
responses           = 201 / 201
activeTransactions  = 2
```

The final correction moved concurrency authority into MongoDB through a unique sparse `activeKey` on active PaymentTransactions and an atomic pre-provider claim.

Final concurrent evidence run `33440901825` observed:

```text
providerCreateCalls = 1
responses           = 201 / 409
activeTransactions  = 1
result              = passed
```

A separate terminal-retry gate in the same final run proved:

```text
first payment       = rejected
second payment      = pending
first HTTP           = 201
second HTTP          = 201
activeTransactions  = 1
result              = passed
```

## Evidence-first correction rule

No production-path code is changed merely because a source pattern looks suspicious.

If a later R2B/runtime defect is reproduced:

1. retain the failing evidence/test;
2. describe exact expected vs observed behavior;
3. make the smallest booking/payment authority correction;
4. add regression coverage;
5. rerun the relevant R2 gate;
6. rerun existing MITOS lifecycle/payment CI suites;
7. document exact files changed and why.

## Stop conditions

Stop rather than bypass the system if:

- proof requires manually editing payment/reservation state;
- a provider approval must be fabricated outside the controlled SDK boundary stub;
- test requires a production database;
- test requires deploying an endpoint without explicit authorization;
- credentials would need to be committed;
- a corrective change requires unrelated refactoring.

## Current claim

```text
R1 Pay Later backend/operational runtime     CERTIFIED
R2A Mercado Pago application boundary        CERTIFIED
R2 concurrent double-payment race            CLOSED / CERTIFIED
R2 reconciliation authorization              CLOSED / CERTIFIED
R2B real Mercado Pago sandbox/provider       NOT YET CERTIFIED
Browser/manual visual E2E                    NOT YET CERTIFIED
Production readiness                         NOT CLAIMED
Merge readiness                              NOT CLAIMED
```

R1 Pay Later certification remains independent and unchanged.
