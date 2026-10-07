# MITOS Rental Completion — Execution Status v0.1

**Date:** 2026-08-31  
**Branch:** `feature/mitos-rental-completion`  
**Draft PR:** #5  
**Rule:** code/build/test only; no deploy and no merge.

## Status legend

- ✅ implemented and source-build proven
- 🟡 implemented/partially implemented but runtime proof still pending
- 🔴 not completed
- 🔒 intentionally out of scope

## Approved execution list

| # | Requirement | Status | Current evidence / gap |
|---|---|---|---|
| 1 | Close full rental E2E | 🟡 | Backend authority now links reservation acceptance, rental checkout/return/inspection closure and reservation completion. Full continuous runtime journey through Admin + LaborSync still pending. |
| 2 | Recover/certify authentication | 🟡 | Sign in/Register and authenticated Admin sidebar are present. Dedicated one-purpose password reset implemented for customer + Admin. Source builds proven; browser runtime certification still required. |
| 3 | Add payment method | 🟡 | Mercado Pago Payment Brick path is integrated into Checkout. Runtime provider proof pending. |
| 4 | Integrate Mercado Pago | 🟡 | Reservation-first flow, server quote and backend SDK create-payment path implemented. Real sandbox/test-user transaction proof pending. |
| 5 | Validate payments by webhook | 🟡 | Signature validation + provider read-back + amount/currency verification implemented. Real webhook delivery proof pending. |
| 6 | Reservation/payment idempotency | 🟡 | Reservation `sessionId` replay guard and provider `X-Idempotency-Key` handling implemented. Targeted source tests are gated in CI; runtime duplicate/retry proof is still pending. |
| 7 | Explicit reservation/payment states | ✅ | `ReservationState` and `PaymentTransaction` authorities plus transition tests implemented; pay-later becomes `confirmed`, provider-approved online payment becomes `confirmed`, and a closed rental promotes a confirmed reservation to `completed`. Unknown provider states fail closed. |
| 8 | Complete real emails | 🟡 | Persistent `(booking,event)` delivery ledger and reservation/payment/cancellation event matrix are wired. Provider calls are off the payment/webhook critical path. Real transport delivery + replay proof remains pending. |
| 9 | Remove demo credentials/data | 🟡 | Source-code credential/identity fallbacks were removed. Known fixture values (`B00kC4r5`, `jdoe@mitos.pe`, `admin@mitos.pe`, old local supplier fixture) no longer appear in the indexed source search. DEV seed is disabled by default and now requires explicit fixture values; runtime seed-refusal/secret-scan proof remains pending. |
| 10 | Payment reconciliation | 🟡 | Authenticated provider reconciliation endpoint implemented using same provider-truth sync path as webhook. Runtime proof/runbook pending. |

## Current payment truth model

```text
Browser
  = intent + tokenized provider data

MITOS backend
  = Booking + price + reservation/payment state authority

Mercado Pago
  = provider transaction truth

Webhook / reconciliation
  = synchronization mechanisms
```

Mercado Pago payment creation uses a provider idempotency key and the webhook is verified before provider state is read. The frontend never supplies authoritative amount/currency to the backend payment command.

## Current reservation/payment sequence

### Online payment

```text
Checkout form
  ↓
Temporary Booking
  ↓
Reservation pending
  ↓
Reservation awaiting_payment
  ↓
Authoritative backend quote
  ↓
Mercado Pago Brick
  ↓
Payment create with X-Idempotency-Key
  ↓
Provider read-back / verified webhook
  ↓
Payment approved?
  ├─ NO → reservation remains unconfirmed
  └─ YES → reservation confirmed
```

### Pay later

```text
Committed backend checkout
  ↓
payLater = true
  ↓
Reservation confirmed
```

Deferred collection is not modeled as an online payment waiting for Mercado Pago approval.

## Current transactional email sequence

```text
Authoritative business event
  ↓
TransactionalEmailDelivery (booking + event unique)
  ↓
pending
  ↓
atomic sending claim
  ↓
external mail transport
  ├─ success → sent
  └─ failure → failed / retryable
```

Events currently represented:

```text
reservation_received
payment_approved
reservation_confirmed
cancellation_requested
reservation_cancelled
```

Rules:

- repeated checkout/webhook/reconciliation calls reuse the same logical email event;
- a stale `sending` claim can be retried;
- `BC_EMAIL_ENABLED=false` is not recorded as real delivery evidence;
- payment/reservation state does not wait for the external email provider;
- cancellation-request email is emitted only after the inherited controller commits its explicit HTTP 200 path; a `204 No Content` no-op does not create customer-facing cancellation evidence.

## Current DEV seed boundary

```text
MITOS_ENABLE_DEV_SEED=false     default
MITOS_ALLOW_SEED=false          default
```

When intentionally enabled, the fixture run must explicitly supply:

```text
MITOS_DEMO_PASSWORD
MITOS_DEMO_CUSTOMER_EMAIL
MITOS_DEMO_CUSTOMER_NAME
MITOS_DEMO_ADMIN_EMAIL
MITOS_DEMO_ADMIN_NAME
MITOS_DEMO_SUPPLIER_EMAIL
```

No customer/admin password or identity has a source-code fallback. Remote test seeding additionally requires an explicit allow flag.

## Current rental operational sequence

```text
Reservation confirmed
  ↓
rental reserved
  ↓
checked_out
  ↓
returned
  ↓
inspection evidence verified
  ↓
rental closed
  ↓
Reservation completed
```

The completion bridge is deliberately conservative: a legacy Booking with no explicit MITOS `ReservationState` is not retroactively invented at closure time.

## Pricing/currency boundary

MitoS/Mercado Pago Peru examples are aligned to:

```text
frontend VITE_BC_BASE_CURRENCY=PEN
backend  BC_BASE_CURRENCY=PEN
backend  BC_MERCADO_PAGO_CURRENCY=PEN
```

The payment service fails closed if backend pricing currency and Mercado Pago currency differ. Insurance-client online pricing remains deliberately blocked until its deductible/FX rule is authoritative on the server; no silent USD↔PEN conversion is claimed.

## Source CI gate

The `mitos-closure` workflow now requires, in addition to backend/Admin/customer builds, targeted MITOS suites for:

```text
rental lifecycle transitions
reservation/payment transitions
Mercado Pago webhook HMAC validation
transactional email cancellation/commit semantics
```

The tests run with isolated CI-only SMTP/CDN placeholders and do not require a production secret or a live mail/database provider.

## Hard gates before claiming completion

1. customer frontend + backend/Admin source builds must pass on the final head;
2. real local/browser authentication proof;
3. Mercado Pago sandbox/test-user payment proof;
4. valid and invalid webhook delivery proof;
5. duplicate checkout and duplicate webhook replay proof;
6. payment reconciliation proof;
7. transactional email real-provider delivery + duplicate/retry proof;
8. explicit DEV fixture refusal/success checks + final credential/secret scan proof;
9. full Admin + LaborSync + checkout + return + check-in + closure E2E;
10. final documentation/evidence receipt.

## Explicit non-claims

This status does **not** claim:

- production readiness;
- deployed Mercado Pago configuration;
- Railway service changes;
- live money movement;
- real email delivery from the current branch head;
- Insurance-client Mercado Pago pricing completion;
- Ground Control integration;
- Agent Factory integration;
- final E2E certification.
