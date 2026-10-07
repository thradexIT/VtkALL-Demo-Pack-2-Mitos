# MITOS Rental Completion — Build Record v0.1

**Project:** MITOS Rent a Car  
**Repository:** `thradexIT/bookcars`  
**Working branch:** `feature/mitos-rental-completion`  
**Base branch:** `developer`  
**Draft PR:** #5 — `MitoS rental completion — lifecycle, auth and payments`  
**Date:** 2026-08-31  
**Deployment authority:** NONE — build/test only. Railway must remain untouched.  

---

## 1. Frozen execution scope

This branch exists to execute the approved MITOS completion list without introducing Ground Control, Agent Factory, deployment changes or unrelated Gallo workshop work.

1. Close the rental E2E flow: Landing → Search → Vehicle → Reservation → Admin → LaborSync → Checkout → Return → Check-in → Closure.
2. Recover and certify authentication: visible Sign in/Register, authenticated sidebar, Admin, password recovery.
3. Add payment method support.
4. Integrate Mercado Pago.
5. Validate payments by verified webhook and provider read-back.
6. Make reservation/payment processing idempotent.
7. Introduce explicit reservation/payment states.
8. Complete real transactional emails.
9. Remove temporary demo credentials/data and unsafe DEV fallbacks.
10. Add payment reconciliation for missed webhooks.

---

## 2. Non-negotiable boundaries

- No deploy from this branch.
- Do not modify the currently running Railway deployment.
- Do not merge without explicit approval.
- Ground Control is out of scope.
- Agent / Agent Factory is out of scope.
- Existing BookCars contracts are preserved where changing them would break Admin, customer frontend or LaborSync.
- Provider redirects/browser callbacks are never payment truth.
- Payment amount and currency are server-owned.

---

## 3. Rental operational lifecycle

The inherited `BookingStatus` enum mixes commercial/payment semantics and does not express vehicle handoff state. It remains intact for compatibility.

A dedicated `RentalLifecycle` authority was added instead:

```text
reserved
  ↓
checked_out
  ↓
returned
  ↓
closed
```

Rules:

- same-state replay is idempotent;
- skipping a state is rejected;
- terminal reversal is rejected;
- existing operational URLs remain unchanged;
- checkout departure, check-in return and inspection closure now advance the lifecycle in backend authority.

Relevant implementation:

- `backend/src/models/RentalLifecycle.ts`
- `backend/src/services/rentalLifecycleService.ts`
- `backend/src/controllers/rentalLifecycleController.ts`
- `backend/src/routes/bookingRoutes.ts`
- `backend/__tests__/rentalLifecycle.test.ts`

---

## 4. Authentication and password recovery

### 4.1 Existing capability recovered

Code inspection confirmed that MITOS already retained:

- customer Sign in / Register surfaces;
- Admin authenticated navigation/sidebar;
- suppliers/companies;
- countries;
- locations;
- vehicles;
- users;
- pricing;
- client types;
- orders/settings.

The task therefore did not rebuild these surfaces unnecessarily.

### 4.2 Password reset correction

The inherited reset flow reused account activation and could temporarily deactivate an account while reset was pending.

The new reset path introduces a dedicated reset token contract:

- purpose-specific token;
- token stored hashed;
- expiration/TTL;
- one-time consumption;
- account remains active while reset is pending;
- customer and Admin use the same security contract;
- activation endpoints remain available for backwards compatibility.

Relevant implementation:

- `backend/src/models/PasswordResetToken.ts`
- `backend/src/services/passwordResetService.ts`
- `backend/src/controllers/userController.ts`
- `backend/src/routes/userRoutes.ts`
- `frontend/src/services/PasswordResetService.ts`
- `frontend/src/pages/ForgotPassword.tsx`
- `frontend/src/pages/ResetPassword.tsx`
- Admin equivalents under `admin/src/...`

---

## 5. Reservation state authority

The frozen MITOS reservation contract is represented independently from inherited `BookingStatus`:

```text
pending
awaiting_payment
confirmed
cancelled
completed
```

Canonical payment-backed transition:

```text
pending
  ↓
awaiting_payment
  ↓
confirmed
  ↓
completed
```

Terminal state reversal is rejected. Reapplying the same state is idempotent.

Relevant implementation:

- `backend/src/models/ReservationState.ts`
- `backend/src/services/reservationStateService.ts`
- `backend/__tests__/paymentState.test.ts`

---

## 6. Payment state authority

The frozen MITOS payment states are:

```text
pending
approved
rejected
refunded
failed
```

Mercado Pago provider states are mapped conservatively:

- `approved` → `approved`
- `pending` → `pending`
- `in_process` → `pending`
- `rejected` → `rejected`
- `refunded` → `refunded`
- `charged_back` → `refunded`
- unknown/unhandled → `failed`

An unknown provider state must never promote a reservation to confirmed.

Relevant implementation:

- `backend/src/models/PaymentTransaction.ts`
- `backend/src/services/paymentStateService.ts`
- `backend/__tests__/paymentState.test.ts`

---

## 7. Mercado Pago trust boundary

### 7.1 Previous unsafe ordering

The inherited browser flow was effectively:

```text
browser amount
  ↓
Mercado Pago payment
  ↓
Booking creation
```

It also treated `approved` or `in_process` from the immediate client-visible payment response as enough to continue booking creation.

That ordering is no longer accepted for MITOS.

### 7.2 New ordering

```text
Checkout form
  ↓
Temporary Booking persisted
  ↓
ReservationState = awaiting_payment
  ↓
Server recalculates authoritative amount
  ↓
Server returns quote
  ↓
Mercado Pago Payment Brick
  ↓
Browser sends tokenized payment data only
  ↓
Backend creates provider payment
  ↓
Provider webhook / provider read-back
  ↓
PaymentTransaction updated
  ↓
approved only
  ↓
ReservationState = confirmed
```

The browser no longer supplies payment amount/currency to the create-payment endpoint.

### 7.3 Server-owned charge

`getAuthoritativeBookingCharge()` reloads persisted domain data and calculates the payment using:

- Booking;
- Car;
- supplier price-change rate;
- selected options;
- ClientType discount;
- deposit/payment mode.

The persisted booking price is corrected to the server-derived rental price before provider payment preparation.

Insurance customers currently **fail closed** because the inherited deductible policy is USD-based and has not yet been moved into an explicit authoritative FX rule. A potentially wrong insurance charge is considered worse than temporarily refusing that payment path.

Relevant implementation:

- `backend/src/services/bookingPricingService.ts`

---

## 8. Currency contract

MITOS Mercado Pago Peru certification uses an explicit PEN contract:

```text
frontend VITE_BC_BASE_CURRENCY=PEN
backend  BC_BASE_CURRENCY=PEN
backend  BC_MERCADO_PAGO_CURRENCY=PEN
```

The backend rejects payment preparation when pricing currency and Mercado Pago currency differ.

This is intentional fail-closed behavior; no silent USD/PEN conversion is permitted inside provider payment creation.

Example configuration was updated in:

- `frontend/.env.example`
- `backend/.env.example`
- `backend/.env.docker.example`
- `backend/.env.railway.example`

No real access token, webhook secret or private credential belongs in source control.

---

## 9. Mercado Pago payment creation

The browser is allowed to send only:

- `bookingId`;
- high-entropy `reservationSessionId`;
- tokenized payment token;
- installments;
- payment method id;
- issuer id when applicable;
- payer email/identification;
- `X-Idempotency-Key`.

The backend owns:

- amount;
- currency;
- description;
- `external_reference`;
- booking association;
- provider-state interpretation.

`external_reference` is set to the MITOS `bookingId`.

The Mercado Pago SDK request includes `X-Idempotency-Key` through request options.

Official reference consulted on 2026-08-31:

- Mercado Pago Peru — Payment Brick payment submission: https://www.mercadopago.com.pe/developers/es/docs/checkout-bricks/payment-brick/payment-submission
- Mercado Pago Peru — card payments / idempotency: https://www.mercadopago.com.pe/developers/es/docs/checkout-bricks/payment-brick/payment-submission/cards

Relevant implementation:

- `backend/src/controllers/mercadoPagoController.ts`
- `backend/src/config/mercadoPagoRoutes.config.ts`
- `backend/src/routes/mercadoPagoRoutes.ts`
- `frontend/src/services/MercadoPagoService.ts`
- `frontend/src/pages/Checkout.tsx`

---

## 10. Reservation idempotency

Frontend button disabling is not considered idempotency.

MITOS now creates a stable `reservationSessionId` for Mercado Pago checkout. Backend middleware checks for an existing booking with that session before entering the inherited checkout controller.

Replay behavior:

```text
same session + same reservation identity
→ return existing bookingId

same session + different reservation identity
→ 409 conflict
```

This prevents the common failure mode:

```text
server commits Booking
→ network response is lost
→ browser retries
→ duplicate Booking / duplicate guest user
```

Relevant implementation:

- `backend/src/middlewares/idempotentCheckout.ts`
- `backend/src/routes/bookingRoutes.ts`

---

## 11. Provider payment idempotency

A payment attempt carries an `X-Idempotency-Key`.

Backend behavior:

- same key + same booking → safe replay/synchronization;
- same key + different booking → `409`;
- existing provider payment → query provider truth and return synchronized state;
- transport/server failure → frontend keeps the same key for retry;
- terminal rejection → frontend generates a new key for a deliberate new payment attempt.

This protects against duplicate provider payments and duplicate approval processing.

---

## 12. Webhook authenticity and payment truth

Webhook processing requires:

- `x-signature`;
- `x-request-id`;
- `data.id`;
- configured `BC_MERCADO_PAGO_WEBHOOK_SECRET`.

Invalid/incomplete signatures return `401` before provider state is processed.

After valid notification receipt, MITOS does not trust event payload payment status. It retrieves the payment from Mercado Pago and validates:

1. `external_reference` points to a Booking;
2. provider amount equals server-recalculated amount;
3. provider currency equals configured payment currency;
4. provider state maps to MITOS state;
5. only `approved` may confirm the reservation.

The browser redirect is not a source of payment truth.

Official webhook reference consulted on 2026-08-31:

- https://www.mercadopago.com.pe/developers/en/docs/your-integrations/notifications/webhooks

Relevant tests:

- `backend/__tests__/mercadoPagoWebhook.test.ts`

---

## 13. Reconciliation

An authenticated reconciliation endpoint exists for missed/failed webhook delivery:

```text
POST /api/mercadopago/reconcile/:paymentId
```

It reads the current payment directly from Mercado Pago and applies the same amount/currency/state validation path used after a webhook.

Therefore webhook and reconciliation converge on one provider-truth synchronization function instead of implementing two payment authorities.

---

## 14. Frontend behavior after this slice

Before the Payment Brick becomes interactive:

1. the Booking exists;
2. the reservation session exists;
3. the backend has produced the amount shown by the Brick;
4. reservation options become locked;
5. changing browser-computed `amount` cannot change the provider charge.

Immediate response handling:

- `approved` → success UI;
- `pending` / `in_process` → pending UI, not confirmed;
- Yape QR response → QR may be shown while reservation remains pending;
- rejected/failed → failure UI and a deliberate next attempt gets a new idempotency key.

The booking reference shown after success remains the MITOS `bookingId`, not the Mercado Pago payment id.

---

## 15. CI evidence policy

The branch is validated by the repository `mitos-closure` workflow through Draft PR #5.

The workflow compiles/builds:

- backend;
- MITOS Admin;
- MITOS customer frontend;
- Railway image as build proof;
- configuration/syntax gates.

**Important:** building the Railway image inside CI is not deployment. No Railway service update is authorized from this workstream.

A separate evidence receipt must record the final workflow run for each coherent slice.

---

## 16. Known limitations / deliberately open gates

This document does **not** claim runtime Mercado Pago certification yet.

Still open after the current code slice:

- real Mercado Pago sandbox/test-user payment proof;
- webhook delivery proof from Mercado Pago infrastructure;
- Yape-specific runtime proof;
- explicit server-side insurance deductible/FX rule;
- full transactional email matrix;
- removal/quarantine of all demo credentials and DEV seed defaults;
- final payment reconciliation operational UI/runbook;
- full continuous E2E proof through Admin + LaborSync + return/check-in/closure.

No production readiness claim is permitted until these gates are evidenced.

---

## 17. Current safety verdict

The architectural direction of the payment slice is now:

```text
Browser = intent + tokenized provider data
Backend = reservation + price + payment authority
Mercado Pago = provider transaction truth
Webhook/reconciliation = synchronization mechanisms
```

This is the required boundary for proceeding to runtime certification without making browser redirects, client-calculated prices or duplicate retries authoritative.
