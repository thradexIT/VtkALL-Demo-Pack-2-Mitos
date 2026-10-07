# MITOS — Transactional Email + DEV Fixture Delta v0.1

**Date:** 2026-08-31  
**Branch:** `feature/mitos-rental-completion`  
**Draft PR:** #5  
**Deployment:** not authorized  
**Railway:** untouched by this delta  

## Purpose

Close two previously red source-code gaps in the MITOS execution list without changing payment authority or deployment state:

1. make customer-facing reservation/payment/cancellation emails explicit, persistent and duplicate-safe;
2. remove source-code demo credential/identity fallbacks and require an intentional DEV fixture run.

Runtime certification remains separate from source implementation.

---

## 1. Transactional email authority

A new persistent delivery ledger represents the customer communication side effect independently from Booking/Reservation/Payment state:

```text
TransactionalEmailDelivery
  booking
  event
  status
  attempts
  lastAttemptAt
  sentAt
  lastError
```

Unique business key:

```text
(booking, event)
```

Supported events:

```text
reservation_received
payment_approved
reservation_confirmed
cancellation_requested
reservation_cancelled
```

Supported delivery states:

```text
pending
sending
sent
failed
```

Relevant files:

- `backend/src/models/TransactionalEmailDelivery.ts`
- `backend/src/services/transactionalEmailService.ts`
- `backend/src/middlewares/transactionalEmailEvents.ts`
- `backend/src/routes/bookingRoutes.ts`
- `backend/src/controllers/mercadoPagoController.ts`
- `backend/src/lang/en.ts`
- `backend/src/lang/es.ts`
- `backend/src/lang/fr.ts`

---

## 2. Email idempotency

Ordinary retries must not create a new logical email consequence.

```text
same Booking + same event
        ↓
existing delivery record
        ↓
Sent?  yes → no second send
        ↓ no
atomic sending claim
```

A five-minute stale `sending` lease allows later recovery when a process dies after claiming work.

The design remains at-least-once at the transport edge: a process can theoretically die after the external mail provider accepted the message but before MITOS persisted `sent`. Exact-once external email delivery would require provider-side idempotency/outbox acknowledgement semantics that are not currently claimed.

---

## 3. Email is not business authority

The email provider is explicitly outside the payment/reservation critical path.

```text
provider payment truth
        ↓
PaymentTransaction / ReservationState commit
        ↓
persist email delivery intent
        ↓
return / acknowledge business request
        ↓
external email attempt
```

A mail timeout or provider failure:

- does not revert `PaymentTransaction`;
- does not revert `ReservationState`;
- does not make a valid webhook fail because SMTP/API delivery was slow;
- is retained as retryable `TransactionalEmailDelivery.failed` evidence.

`BC_EMAIL_ENABLED=false` is treated as **not delivered** and must not become `sent` evidence.

---

## 4. Event boundaries

### Reservation received

Emitted only after checkout has returned its committed `bookingId`. The middleware observes the existing response contract and also covers an idempotent checkout replay; the `(booking,event)` key suppresses duplicate mail consequences.

### Payment approved

Emitted only from authoritative Mercado Pago provider synchronization after the provider payment has been re-read and accepted as `approved`.

### Reservation confirmed

Emitted after the reservation is transitioned to `confirmed` from provider-backed payment truth.

### Cancellation requested

This is deliberately separate from cancellation completion.

The inherited customer cancellation controller returns:

```text
200 → cancellation request actually persisted
204 → no request created / no-op
```

Only the explicit `200` path may emit `cancellation_requested`. A `204 No Content` must not produce customer-facing cancellation evidence.

### Reservation cancelled

Emitted only after an inherited Admin booking update/bulk update commits `BookingStatus.Cancelled` and the explicit MITOS `ReservationState` successfully transitions to `cancelled`.

---

## 5. DEV fixture credential cleanup

The previous DEV seed had source fallbacks for customer/admin identities and password. Those fallbacks are removed.

The seed is now disabled unless explicitly requested:

```text
MITOS_ENABLE_DEV_SEED=true
```

A non-local target additionally requires:

```text
MITOS_ALLOW_SEED=true
```

The fixture run requires all of the following to be supplied by the local/test environment:

```text
MITOS_DEMO_PASSWORD
MITOS_DEMO_CUSTOMER_EMAIL
MITOS_DEMO_CUSTOMER_NAME
MITOS_DEMO_ADMIN_EMAIL
MITOS_DEMO_ADMIN_NAME
MITOS_DEMO_SUPPLIER_EMAIL
```

No password, customer identity, Admin identity or supplier email is defaulted from source code.

Relevant files:

- `backend/src/setup/mitosDevSeed.ts`
- `backend/.env.example`

---

## 6. Currency boundary retained

This delta does not alter the frozen Mercado Pago pricing rule:

```text
frontend VITE_BC_BASE_CURRENCY=PEN
backend  BC_BASE_CURRENCY=PEN
backend  BC_MERCADO_PAGO_CURRENCY=PEN
```

A mismatch fails closed. Insurance online pricing also remains deliberately blocked until its deductible/FX rule is authoritative server-side.

---

## 7. What this delta proves

At source level:

```text
transactional email event model       implemented
persistent duplicate guard            implemented
retryable delivery evidence           implemented
provider call off payment critical path implemented
cancellation request vs cancel split  implemented
source credential defaults removed    implemented
explicit DEV seed gate                 implemented
```

## 8. What this delta does NOT prove

Still requires runtime evidence:

```text
real email provider delivery
email duplicate/retry behavior under runtime concurrency
explicit DEV fixture seed execution
final secret/credential scan
Mercado Pago sandbox payment
real webhook delivery
reconciliation
complete Admin + LaborSync rental E2E
```

No deploy, Railway change, merge, Ground Control work or Agent work is part of this delta.
