# MITOS — Transactional Emails & DEV Fixture Security v0.1

**Date:** 2026-08-31  
**Branch:** `feature/mitos-rental-completion`  
**Draft PR:** #5  
**Scope:** execution items #8 and #9  
**Deployment:** prohibited in this workstream.

---

## 1. Why this slice exists

MITOS previously had useful email infrastructure, but event semantics were mixed:

- account activation existed;
- password recovery existed after the dedicated reset correction;
- checkout confirmation existed;
- supplier/admin notifications existed;
- one confirmation message mixed the facts “reservation confirmed” and “payment processed”.

For the rental completion gate, customer-facing email must follow backend business truth. A browser callback may not emit a payment-approved email, and a cancellation request may not claim the reservation is already cancelled.

---

## 2. Frozen transactional email matrix

| Event | Trigger authority | Customer statement |
|---|---|---|
| Reservation received | successful backend checkout commit | Request received; online-payment reservations may still be pending |
| Payment approved | Mercado Pago provider read-back after verified event/create/reconciliation | Payment approved by provider |
| Reservation confirmed | backend ReservationState transition after approved provider truth | Reservation confirmed |
| Cancellation requested | successful authenticated cancellation-request commit | Cancellation request received; booking is not yet declared cancelled |
| Reservation cancelled | successful inherited Booking status mutation to `cancelled` + ReservationState synchronization | Reservation cancelled |
| Password recovery | dedicated password-reset token service | Reset link; account remains active while reset is pending |

The first five rental events use the new delivery ledger. Password reset retains its own purpose-specific security flow because it is account-level, not booking-level.

---

## 3. Persistent delivery ledger

Model:

`backend/src/models/TransactionalEmailDelivery.ts`

Unique business key:

```text
booking + event
```

States:

```text
pending
sending
sent
failed
```

Stored evidence:

- attempt count;
- last attempt timestamp;
- sent timestamp;
- last error.

A normal duplicate webhook, reconciliation call or reservation retry therefore does not create a second customer email for the same booking/event.

---

## 4. Delivery claim rule

The sender first ensures the ledger row exists and then atomically claims a non-sent event.

A `sending` claim becomes retryable only after a stale interval. This prevents concurrent webhook/reconciliation requests from both sending the same event under ordinary conditions.

Email-provider calls are deliberately removed from payment/reservation critical-path authority. The event intent is persisted first and delivery is queued outside the business response path.

Relevant service:

`backend/src/services/transactionalEmailService.ts`

---

## 5. Delivery guarantee and non-claim

MITOS does **not** claim mathematically exact-once external email delivery.

Reason:

```text
provider accepts email
↓
process crashes before local `sent` marker
↓
stale claim is retried later
```

Without a provider-side idempotency contract or a transactional external acknowledgement protocol, that narrow failure window is fundamentally at-least-once.

The implemented guarantee is therefore:

- persistent deduplication for normal retries/concurrency;
- retryable failure ledger;
- no rollback of payment/reservation truth when email transport fails;
- no false `sent` marker when `BC_EMAIL_ENABLED=false`.

---

## 6. Payment-approved and reservation-confirmed separation

`backend/src/controllers/mercadoPagoController.ts` emits these events only after the provider payment is read and mapped to MITOS `approved`:

```text
Mercado Pago provider truth = approved
↓
Booking payment fields updated
↓
ReservationState = confirmed
↓
PaymentApproved email event
↓
ReservationConfirmed email event
```

The delivery ledger makes repeated provider synchronization safe.

The inherited booking-confirmation copy was also corrected so “reservation confirmed” no longer silently includes the separate claim “payment processed successfully”.

---

## 7. Cancellation semantics

MITOS distinguishes:

```text
cancellation requested
≠
reservation cancelled
```

The request endpoint emits only `CancellationRequested` after its explicit successful commit response.

The inherited Admin booking update/bulk-update paths emit `ReservationCancelled` only when the committed Booking status is actually `cancelled`. The explicit MITOS ReservationState is transitioned to `cancelled` at the same boundary.

Middleware:

`backend/src/middlewares/transactionalEmailEvents.ts`

This lets the new semantic layer wrap inherited BookCars controllers without rewriting their large response contracts.

---

## 8. Reservation-received event

Checkout remains compatible with the inherited response shape. Middleware observes a successful checkout response containing the returned `bookingId` and creates the `ReservationReceived` event.

The text deliberately does not say “confirmed” for an online-payment reservation that is still `awaiting_payment`.

Idempotent checkout replay returns the existing booking and the email ledger suppresses a duplicate `ReservationReceived` delivery.

---

## 9. Languages

New rental event copy exists in:

- `backend/src/lang/es.ts`
- `backend/src/lang/en.ts`
- `backend/src/lang/fr.ts`

Customer language is selected from the booking driver profile, falling back to the configured default language.

---

## 10. DEV credential problem found

The previous `backend/src/setup/mitosDevSeed.ts` contained source-code fallbacks for:

- demo password;
- demo customer email;
- demo admin email;
- fixed DEV supplier identity.

This meant executing the seed without local configuration silently produced known credentials/identities.

That is no longer allowed.

---

## 11. New DEV seed gate

Running the seed now requires explicit intent:

```text
MITOS_ENABLE_DEV_SEED=true
```

A non-local database additionally requires:

```text
MITOS_ALLOW_SEED=true
```

Every fixture identity/credential must be supplied externally:

```text
MITOS_DEMO_PASSWORD
MITOS_DEMO_CUSTOMER_EMAIL
MITOS_DEMO_CUSTOMER_NAME
MITOS_DEMO_ADMIN_EMAIL
MITOS_DEMO_ADMIN_NAME
MITOS_DEMO_SUPPLIER_EMAIL
```

There is no source-code fallback for these values.

Missing any required value aborts the seed.

---

## 12. Configuration examples

The safe fixture contract is reflected in:

- `backend/.env.example`
- `backend/.env.docker.example`
- `backend/.env.railway.example`

All keep the fixture seed disabled by default.

Examples also use placeholders rather than a concrete demo admin/password authority.

Real secrets must remain outside source control.

---

## 13. What remains from execution item #9

This slice removes the known credential fallbacks from the dedicated MITOS DEV seed and hardens its execution boundary.

Final #9 certification still requires a repository-wide credential/demo audit before release, because source-build evidence alone cannot prove no historical/secondary script contains another temporary identity or fallback.

No statement of complete secret eradication is made until that audit is recorded.

---

## 14. Evidence required to close #8/#9

### Emails

- source build green;
- runtime SMTP/HTTPS-provider delivery proof for each required event;
- repeated webhook/reconciliation proof produces one logical event delivery;
- email-disabled environment does not claim `sent`;
- failed delivery is visible/retryable in ledger.

### DEV/security

- explicit seed refusal with `MITOS_ENABLE_DEV_SEED=false`;
- explicit seed refusal when required identity variables are missing;
- remote database refusal without `MITOS_ALLOW_SEED=true`;
- repository-wide scan for known demo passwords/emails/tokens/secrets;
- final evidence receipt.

---

## 15. Current verdict

The code boundary is now correct enough to proceed to runtime certification:

```text
Business event is committed
↓
Persistent email intent
↓
External email delivery
```

and:

```text
DEV fixture execution
= explicit opt-in + externally supplied fixture credentials
```

Neither email transport nor a convenience seed is allowed to become business authority.
