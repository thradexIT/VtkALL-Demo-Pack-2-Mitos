# MITOS R2A — Mercado Pago Runtime Certification Receipt

Date: 2026-08-31
Status: **R2A CERTIFIED — R2B REAL PROVIDER/SANDBOX STILL PENDING**

## Isolation boundary

- Repository: `thradexIT/bookcars`
- Certification branch: `cert/mitos-r2-mercado-pago-runtime`
- Draft PR: #7 — `R2 certification — MitoS Mercado Pago runtime`
- Parent implementation branch: `feature/mitos-rental-completion`
- Frozen parent SHA: `b6858ecfb6f7204508c4392dc79898b0bbfba672`
- Final R2A certified head: `107886758335752f120aa180a645d22c3bb18530`
- No merge performed.
- No deploy performed.
- No Railway changes performed.
- No production database or production payment used.
- No Mercado Pago credentials committed.

## Certification environment

R2A used:

- ephemeral MongoDB;
- real backend HTTP application/routes/controllers/middleware;
- real MitoS Booking, ReservationState, PaymentTransaction and transactional-email persistence;
- generated ephemeral customer/admin/supplier identities;
- generated ephemeral cookie/JWT/webhook secrets;
- Mercado Pago SDK substituted only at the external `Payment.create` / `Payment.get` provider boundary;
- no external provider network call.

Therefore R2A certifies MitoS behavior around the provider boundary. It does **not** claim that Mercado Pago accepted a real sandbox or production payment.

## Defects reproduced before correction

### R2-RECONCILE-AUTHZ

Observed:

- a valid customer token could reach `/api/mercadopago/reconcile/:paymentId`;
- reconciliation returned HTTP 200 even though it can mutate payment/reservation truth.

Correction:

- introduced explicit backoffice authorization through `authJwt.verifyBackofficeToken`;
- reconciliation now accepts Admin/Supplier authority only;
- customer runtime proof now returns HTTP 403.

### R2-DUPLICATE-ACTIVE-PAYMENT — sequential

Observed:

- same Booking;
- first Mercado Pago payment active;
- second request used a different `X-Idempotency-Key`;
- backend performed another provider `Payment.create`.

Correction stage 1:

- added an active-payment guard for the reservation;
- sequential different-key replay became HTTP 409 with zero additional provider creates.

### R2-DUPLICATE-ACTIVE-PAYMENT — concurrent race

Failing evidence run:

- workflow run: `33439437520`
- head: `776889322428e38239a542e017c45679ed11b6ed`
- test: `same-booking-two-distinct-keys-concurrent`

Observed failing metrics:

```text
providerCreateCalls = 2
responses           = 201 / 201
activeTransactions  = 2
reservationStatus   = awaiting_payment
```

This proved that the sequential read-before-write guard was insufficient. Two requests could both observe no active payment before either persisted its provider transaction.

## Final concurrency correction

The correction deliberately does not use an in-memory mutex because MitoS may run across more than one process/instance.

The final design uses MongoDB as the serialization boundary:

1. `PaymentTransaction` now supports `activeKey`.
2. Active Mercado Pago transactions (`pending` / `approved`) own a deterministic key:

   `mercado_pago:<bookingId>`

3. `activeKey` has a unique sparse index.
4. Before any provider `Payment.create`, the payment guard inserts/claims the pending `PaymentTransaction` atomically.
5. Two different idempotency keys for the same Booking race on the same `activeKey`.
6. MongoDB allows one claim and rejects the competing claim before provider I/O.
7. Same-key retries continue to use the provider idempotency contract.
8. Terminal states (`rejected`, `refunded`, `failed`) unset `activeKey`, preserving history while allowing a legitimate later attempt.
9. `pending` / `approved` preserve `activeKey`, so a second active payment cannot be opened.

This keeps PaymentTransaction history intact; no historical transaction is deleted to implement the lock.

## Final certified run

Workflow: `mitos-r2a-runtime`

Final run:

- run id: `33440901825`
- head: `107886758335752f120aa180a645d22c3bb18530`
- conclusion: **success**
- evidence artifact: `mitos-r2a-runtime-evidence-33440901825`
- artifact digest: `sha256:6e4296729743deac06f288c3a1e89d5b5109024d2fe8fba2d9f937b761ae78a8`

Successful CI steps included:

- backend dependency install;
- backend build;
- existing lifecycle/payment/webhook/email regression suites;
- isolated MitoS seed;
- R2A provider-simulated runtime v2;
- concurrent double-payment race gate;
- terminal payment retry-release gate;
- evidence upload.

## Final R2A trust-boundary proof

The final runtime artifact proves all of the following:

### Reservation/session authority

- wrong quote session → HTTP 404;
- authoritative quote → HTTP 200;
- quote currency = `PEN`;
- reservation after quote = `awaiting_payment`.

### Browser trust boundary

- missing idempotency key → HTTP 400;
- payer mismatch → HTTP 400;
- wrong payment session → HTTP 404;
- client amount/currency cannot override backend charge;
- provider received backend-owned amount `90 PEN` in the controlled fixture.

### Sequential idempotency

- same idempotency key replay → HTTP 200;
- additional provider create delta = `0`;
- different key while payment active → HTTP 409;
- additional provider create delta = `0`.

### Reconciliation authorization

- customer token reconciliation → HTTP 403;
- reconciliation is backoffice-only.

### Webhook authenticity

- tampered webhook → HTTP 401;
- provider read delta = `0` before authentication succeeds.

### Provider truth

- provider `pending` leaves reservation `awaiting_payment`;
- provider `approved` produces:
  - payment `approved`;
  - reservation `confirmed`;
  - inherited Booking `paid`;
- approved webhook replay keeps exactly one logical `payment_approved` and one logical `reservation_confirmed` event;
- amount mismatch → HTTP 400 and reservation remains unconfirmed;
- currency mismatch → HTTP 400 and reservation remains unconfirmed;
- provider `rejected` remains explicit and unconfirmed;
- provider `refunded` maps to explicit payment `refunded`.

## Final concurrent race proof

Final run metrics:

```text
providerCreateCalls = 1
responses           = 201 / 409
activeTransactions  = 1
reservationStatus   = awaiting_payment
result              = passed
```

This is the direct inverse of the reproduced failing evidence and is the primary closure proof for the race condition.

## Terminal retry / non-regression proof

A separate runtime gate verified that the concurrency claim does not permanently block legitimate retries.

Sequence:

```text
first payment -> rejected
activeKey     -> released
new key       -> accepted
second payment -> pending
```

Observed final metrics:

```text
firstStatus         = 201
secondStatus        = 201
providerCreateCalls = 2
transactionStatuses = rejected, pending
activeTransactions  = 1
reservationStatus   = awaiting_payment
result              = passed
```

Thus the fix blocks duplicate **active** payments without preventing a new payment attempt after a terminal rejection.

## Product-code files changed by R2 corrections

- `backend/src/middlewares/authJwt.ts`
  - explicit backoffice token verification for reconciliation.

- `backend/src/routes/mercadoPagoRoutes.ts`
  - backoffice reconciliation authority;
  - active-payment guard on create-payment.

- `backend/src/middlewares/mercadoPagoPaymentGuard.ts`
  - final atomic provider-create claim before external payment I/O.

- `backend/src/models/PaymentTransaction.ts`
  - `activeKey` concurrency claim;
  - unique sparse active-key index.

- `backend/src/services/paymentStateService.ts`
  - preserves active claim for `pending/approved`;
  - releases claim for terminal payment states.

No frontend component, Admin component, rental lifecycle service, reservation transition service or pricing algorithm was modified to close this race.

## Test/evidence infrastructure added

- `.github/workflows/mitos-r2a-runtime.yml`
- `backend/scripts/mitos-r2a-runtime-cert.ts`
- `backend/scripts/mitos-r2a-runtime-cert-v2.ts`
- `backend/scripts/mitos-r2a-concurrency-cert.ts`
- `backend/scripts/mitos-r2a-terminal-retry-cert.ts`

The original preflight/failing evidence is intentionally retained in history rather than erased.

## Current claim

```text
R1 Pay Later backend/operational runtime     CERTIFIED
R2A Mercado Pago application boundary        CERTIFIED
R2 concurrent double-payment race            CLOSED / CERTIFIED
R2 reconciliation authorization              CLOSED / CERTIFIED
R2B real Mercado Pago sandbox/provider       NOT YET CERTIFIED
Browser visual/manual E2E                     NOT YET CERTIFIED
Production readiness                          NOT CLAIMED
Merge readiness                               NOT CLAIMED
```

## Next gate

The next payment gate is **R2B — real Mercado Pago sandbox/provider proof**, performed only with securely supplied test credentials and without committing credentials or deploying infrastructure merely to manufacture evidence.
