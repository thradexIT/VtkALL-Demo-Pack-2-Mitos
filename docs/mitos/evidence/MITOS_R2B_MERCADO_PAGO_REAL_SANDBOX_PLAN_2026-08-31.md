# MITOS R2B — Mercado Pago Real Sandbox / Test-Credentials Plan

Date: 2026-08-31
Status: **PREPARED — CREDENTIAL-BOUND, NOT YET EXECUTED**

## Isolation

- Repository: `thradexIT/bookcars`
- Branch: `cert/mitos-r2b-mercado-pago-sandbox`
- Parent certification branch: `cert/mitos-r2-mercado-pago-runtime`
- Parent head: `24605411f91c34240463a3affa543b3d04a36eaa`
- R2A is already certified and must not be modified from this gate.
- `main` and `developer` remain untouched.
- No merge or deploy is authorized.

## Objective

R2B exists to replace the simulated Mercado Pago SDK boundary used by R2A with Mercado Pago's real test environment/test credentials while preserving the same MitoS authority rules.

R2B must prove provider acceptance/read-back without using production credentials or real money.

## Official test model frozen for this gate

For Checkout Bricks card testing, Mercado Pago currently documents:

- use the application's **test Public Key** and **test Access Token**;
- keep the Access Token backend-only;
- tokenize card data through the Brick / MercadoPago.js boundary;
- send the resulting CardToken to the backend;
- send `X-Idempotency-Key` for `/v1/payments`;
- use Mercado Pago test cards/test outcomes;
- do not switch to production credentials during this gate.

Reference pages reviewed on 2026-08-31:

- https://www.mercadopago.com.pe/developers/es/docs/checkout-bricks/integration-test/test-payment-flow
- https://www.mercadopago.com.pe/developers/es/docs/checkout-bricks/payment-brick/payment-submission/cards
- https://www.mercadopago.com.pe/developers/es/docs/your-integrations/credentials

## Existing MitoS configuration contract

Frontend:

- `VITE_BC_PAYMENT_GATEWAY=MercadoPago`
- `VITE_BC_MERCADO_PAGO_PUBLIC_KEY=<TEST_PUBLIC_KEY>`
- no Access Token in frontend

Backend:

- `BC_MERCADO_PAGO_ACCESS_TOKEN=<TEST_ACCESS_TOKEN>`
- `BC_MERCADO_PAGO_CURRENCY=PEN`
- `BC_BASE_CURRENCY=PEN`
- `BC_MERCADO_PAGO_WEBHOOK_SECRET=<TEST/APP_WEBHOOK_SECRET>` only when real inbound webhook proof is performed

## Secret-handling rule

No Mercado Pago credential, token, webhook secret, test-account password, card token, or card data may be committed to Git.

When automated or CI-assisted execution is used, secret values must come from a GitHub Environment/Repository Secret or from a deliberately supplied local shell environment.

Proposed secret names for an isolated test environment:

```text
MITOS_MP_TEST_PUBLIC_KEY
MITOS_MP_TEST_ACCESS_TOKEN
MITOS_MP_TEST_WEBHOOK_SECRET
```

The repository must never contain the secret values.

## R2B gates

### R2B-0 — Credential preflight

Must prove:

- Public Key exists and is clearly test-scoped;
- Access Token exists and is test-scoped;
- Access Token is never exposed to frontend build output or browser source;
- base currency and Mercado Pago currency are both `PEN`;
- no production credential is used.

If this gate cannot distinguish test vs production credentials safely, stop.

### R2B-1 — Real Brick/tokenization

Run MitoS frontend locally against an isolated backend/Mongo instance.

Expected sequence:

```text
Checkout
→ backend temporary Booking
→ authoritative quote
→ Reservation awaiting_payment
→ Payment Brick initialized with TEST Public Key
→ Mercado Pago test card entered
→ one-time CardToken returned
→ backend create-payment called
```

Evidence must not contain raw card data or the one-time CardToken.

### R2B-2 — Real provider create + read-back

The real Mercado Pago test API must receive MitoS backend-owned:

- `transaction_amount` calculated by MitoS;
- `external_reference = bookingId`;
- expected payer email;
- `X-Idempotency-Key`;
- test payment method/token.

MitoS must then read the provider resource back and verify:

- provider payment id exists;
- external reference matches booking;
- amount matches server quote;
- currency is `PEN`;
- provider status maps through MitoS PaymentStatus.

The browser response or redirect is not authority.

### R2B-3 — Approved outcome

For a Mercado Pago-approved test scenario:

```text
payment     approved
reservation confirmed
booking     paid/deposit/paid-in-full according to selected mode
```

Provider read-back must be the authority that produces confirmation.

### R2B-4 — Pending/rejected outcome

At minimum prove one non-approved provider outcome.

Expected invariant:

```text
pending/rejected != reservation confirmed
```

### R2B-5 — Provider idempotency + MitoS active-payment lock

Repeat same logical payment attempt with the same idempotency key:

- no second provider payment resource.

Attempt a second active payment for the same booking with a distinct key:

- MitoS rejects before provider create;
- R2A's Mongo activeKey race protection remains intact.

### R2B-6 — Reconciliation against real provider

Using Admin/Supplier authority only:

- call MitoS reconciliation for the real test providerPaymentId;
- MitoS re-reads provider truth;
- state remains idempotent;
- customer token remains rejected.

## Real inbound webhook boundary

A real provider-delivered inbound webhook requires an externally reachable HTTPS callback.

This branch does **not** authorize creating a persistent deployment merely to obtain that callback.

If real webhook delivery cannot be proven without changing the no-deploy constraint, record it as a separate pending gate rather than weakening the claim.

Allowed future proof options require explicit execution decision, for example:

- an ephemeral secure tunnel to an isolated local/CI backend; or
- an already-approved non-production test endpoint.

Until that proof exists, claim only provider create/read-back/reconciliation—not real inbound webhook delivery.

## Evidence schema

Every real-provider payment proof should record only non-sensitive evidence:

```text
run timestamp
branch SHA
bookingId
reservation session hash/redacted identifier
providerPaymentId
MitoS amount
currency
provider status
MitoS payment status
reservation status
booking status
idempotent replay result
reconciliation result
```

Never record:

```text
Access Token
Public Key unless intentionally treated as public metadata
webhook secret
raw card number
CVV
CardToken
cookies/JWT
user passwords
```

## Stop conditions

Stop R2B immediately if:

- only production credentials are available;
- a secret would need to be committed;
- test payment would move real money;
- a deploy would be required without explicit authorization;
- amount/currency cannot be verified from provider truth;
- browser redirect would be the only confirmation source;
- the payment race/idempotency invariant regresses.

## Current claim

```text
R1 Pay Later runtime                       CERTIFIED
R2A Mercado Pago application boundary      CERTIFIED
R2A concurrent payment race                CLOSED / CERTIFIED
R2B real Mercado Pago test provider        PREPARED / NOT EXECUTED
Real inbound Mercado Pago webhook          NOT YET CERTIFIED
Production readiness                       NOT CLAIMED
Merge readiness                            NOT CLAIMED
```
