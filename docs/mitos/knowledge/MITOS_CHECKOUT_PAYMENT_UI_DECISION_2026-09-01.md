# MitoS Checkout Payment UI Decision — 2026-09-01

**Status:** CURRENT DECISION  
**Repository:** `thradexIT/bookcars`  
**Working branch:** `feature/mitos-custom-secure-checkout`  
**Safety boundary:** no deploy, no merge, no `main`/`developer` mutation.

## Context

MitoS already has a certified Mercado Pago backend/payment authority through R2A and R2B. R2B proved a real Mercado Pago TEST payment while keeping amount/currency, reservation binding, idempotency and provider read-back under backend authority.

During R3 planning, two browser UI directions were considered:

1. keep Mercado Pago Checkout Bricks / Payment Brick and apply MitoS-level branding;
2. replace the Brick UI with a deeper custom Checkout API/Core Methods implementation.

A later product discussion confirmed that MitoS does not require financial-form customization beyond a coherent MitoS-colored/template experience. Source inspection also confirmed that the existing frontend already uses `@mercadopago/sdk-react` `Payment` Brick. Therefore rebuilding the financial UI with Core Methods would add implementation and PCI-surface complexity without a demonstrated product requirement.

## Decision

MitoS will use **Mercado Pago Checkout Bricks — Payment Brick** as the browser payment surface, while preserving the already-certified MitoS backend Payments API authority.

```text
MitoS Checkout shell
  ↓
Mercado Pago Payment Brick
  ├─ card methods
  └─ bank transfer methods / Yape when exposed for the Peru TEST account
  ↓
tokenized provider data
  ↓
MitoS backend
  ↓
server-owned quote + booking/session binding
  ↓
Mercado Pago Payments API
  ↓
provider read-back
  ↓
MitoS payment/reservation state
```

This supersedes the temporary design direction recorded in `MITOS_EXECUTION_KNOWLEDGE_BASE_v1.0.md` that proposed replacing Payment Brick with a custom Core Methods UI. That historical decision is intentionally not deleted.

## Why

- Existing source already uses Payment Brick.
- R2B backend behavior does not need to be rewritten.
- Required visual customization is moderate, not bespoke financial-form behavior.
- Bricks keep provider-managed sensitive payment inputs inside the Mercado Pago SDK surface.
- MitoS can still control surrounding layout, trust copy, total, reservation context and semantic brand palette.
- Avoids unnecessary custom handling around PAN/CVV/expiration while preserving the MitoS customer journey inside the site.

## Current browser implementation

The feature branch now configures the Payment Brick with:

```text
creditCard      all
debitCard       all
prepaidCard     all
bankTransfer    all
```

`bankTransfer: 'all'` is intentionally enabled so the Peru integration can expose Yape when Mercado Pago makes it available for the configured TEST account/payment context. This is **implemented but not yet runtime-certified**.

The Brick receives MitoS semantic colors through supported Brick visual variables. The surrounding MitoS shell states that payment is processed by Mercado Pago and that MitoS does not store card number, expiration date or CVV.

## Data/security boundary

MitoS must not persist or log:

- raw card number/PAN;
- CVV;
- expiration data as a financial credential;
- Mercado Pago CardToken/Yape token beyond the transient payment command need;
- Yape OTP;
- passwords/cookies/JWTs in payment evidence.

The browser does not own authoritative amount/currency or payment approval. The backend quote and Mercado Pago provider truth remain authoritative.

## Date-of-birth clarification

Source inspection revealed that the old Checkout DOB field was not a Mercado Pago requirement. It was used by legacy frontend validation against `car.minimumAge`.

Product direction is still to remove DOB from Checkout. Therefore:

- DOB is removed from the Checkout form and validation path;
- `User.birthDate` remains optional for compatibility;
- `AdditionalDriver.birthDate` becomes optional for compatibility;
- historical records containing DOB remain valid;
- `car.minimumAge` remains an unresolved rental-eligibility policy and must be re-homed into a driver/license eligibility authority before final production closure.

Removing DOB from Checkout does **not** certify or silently remove the minimum-age business rule.

## Safe compile evidence

Initial branded-Checkout run:

- run `33536494463`
- backend compile: success
- frontend compile: failed
- cause: legacy `AdditionalDriver.birthDate` remained required by the shared type
- classification: `LEGACY CONTRACT / CHECKOUT MIGRATION DEFECT`
- provider call: none

After making DOB optional in the shared and persistence contracts, the feature head reached safe compile:

- run `33537283101`
- backend compile: success
- frontend compile: success
- provider guard: success
- Mercado Pago provider call: none
- deploy: none

## Explicit nonclaims

This decision/compile gate does **not** certify:

- Payment Brick rendering in a real browser;
- Yape appearing in the real TEST Brick;
- card entry/tokenization in the browser;
- browser payment approval;
- real inbound Mercado Pago webhook;
- production configuration;
- deploy or merge readiness.

## Next gate

Create a fresh R3 certification branch from the final safe-green feature head and prove the real browser journey without the obsolete DOB harness assumptions:

```text
Checkout
→ reservation
→ authoritative quote
→ Payment Brick ready
→ card / Yape availability observation
→ TEST payment
→ provider truth
→ booking paid
→ reservation confirmed
→ success UI
```
