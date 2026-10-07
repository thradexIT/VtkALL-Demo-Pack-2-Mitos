# MitoS Checkout Execution Log — 2026-09-01

**Scope:** browser payment UI direction, DOB removal, Checkout Bricks branding and safe validation.  
**Branch:** `feature/mitos-custom-secure-checkout`  
**No deploy / no merge / protected refs untouched.**

## Entry 1 — Payment UI direction inspection

### Intent

Determine whether MitoS should continue toward a deeply custom Checkout API/Core Methods financial form or keep Mercado Pago Checkout Bricks.

### Observation

Source inspection of `frontend/src/pages/Checkout.tsx` proved the current frontend already uses `@mercadopago/sdk-react` `Payment` Brick.

### Decision

Keep Payment Brick and brand it for MitoS. Do not rewrite the already-certified R2B backend payment authority.

### Classification

`PRODUCT / ARCHITECTURE DECISION`

### Learning

Before changing integration modality, inspect the actual current implementation. Similar Mercado Pago product names can hide materially different frontend work even when they share the same backend payment authority.

---

## Entry 2 — DOB legacy authority discovered

### Intent

Remove date of birth from Checkout after it was identified as unrelated to payment collection.

### Observation

`frontend/src/models/CheckoutForm.ts` used DOB to calculate age and compare it with `car.minimumAge`.

Therefore DOB was not present because Mercado Pago required it; it was part of a legacy rental-eligibility check.

### Decision

Remove DOB from the payment/reservation Checkout surface, but do not pretend the minimum-age policy disappeared. Re-home that policy later into a driver/license eligibility authority.

### Classification

`PRODUCT POLICY DISCOVERY`

### Remaining debt

`car.minimumAge` is still part of the car model. Final production closure must decide and certify where that rule is enforced.

---

## Entry 3 — Payment Brick branding/Yape implementation

### Changes

- semantic MitoS payment palette added to `mitosBrand`;
- branded trust shell added around Payment Brick;
- supported Brick visual variables used instead of styling SDK internals;
- `bankTransfer: 'all'` enabled for Peru/Yape availability;
- card/debit/prepaid methods retained;
- payer email provided when already known;
- Brick readiness/loading state added;
- provider form/token data removed from browser error logging;
- DOB fields removed from Checkout form and payload creation.

### Security boundary

No Access Token moved to browser. No PAN/CVV/OTP persistence was introduced. Backend amount/currency and provider truth remain unchanged.

---

## Entry 4 — Safe compile failure after DOB removal

### Run

`33536494463`

### Result

```text
backend compile   PASS
frontend compile  FAIL
provider call     NONE
```

### Error

TypeScript rejected the additional-driver object because shared `AdditionalDriver` still required `birthDate`.

### Classification

`LEGACY CONTRACT / CHECKOUT MIGRATION DEFECT`

### Correction

Make `AdditionalDriver.birthDate` optional in:

- shared `bookcars-types` contract;
- backend `env.AdditionalDriver` contract;
- Mongo AdditionalDriver schema.

Historical DOB values remain compatible.

---

## Entry 5 — Tooling/edit integrity incident

### Incident ID

`INC-CHECKOUT-TOOLING-001`

### Intent

Apply the minimal `birthDate: Date` → `birthDate?: Date` contract change.

### What went wrong

A full-file GitHub connector replacement was composed from partial file views for two large shared files. The resulting intermediate commits unintentionally removed unrelated content from:

- `packages/bookcars-types/index.ts`;
- `backend/src/config/env.config.ts`.

### Detection

Before accepting CI as proof, a deliberate compare was run against the known-good Checkout head `add8fd8c0c0d5763c75f442dfffaf62bf389a658`.

The compare exposed hundreds of unrelated line changes when only a pair of optional-property changes were expected.

### Impact boundary

- isolated feature branch only;
- no merge;
- no deploy;
- no provider call;
- `main` untouched;
- `developer` untouched;
- no production state affected.

### Correction

The two files were restored from their exact known-good Git blobs and the DOB optionality change was reapplied narrowly. `backend/src/models/AdditionalDriver.ts` retained only the intended persistence relaxation.

### Post-recovery integrity check

A compare from `add8fd8...` to the repaired head showed the large collateral deletion was gone. Net shared-contract changes returned to the intended small scope.

### Classification

`WORKFLOW / TOOLING EDIT ERROR`

### Reusable lesson

Never perform a full-file replacement of a large shared contract from a truncated/partial source view. For large files, fetch the exact blob or use a patch-capable path, then compare against a known-good commit before trusting CI.

CI passing is not sufficient if the diff itself is unexpectedly broad.

---

## Entry 6 — Recovered safe gate

### Run

`33537283101`

### Result

```text
backend dependencies  PASS
backend compile       PASS
frontend dependencies PASS
frontend compile      PASS
provider guard        PASS
provider call         NONE
deploy                NONE
```

### Verdict

`CHECKOUT BRICKS FEATURE SOURCE GATE — GREEN`

This is a source/compile gate only. It does not certify browser rendering or a real TEST payment from the Brick.

---

## Current next action

Branch from the safe-green Checkout Bricks feature head into a fresh R3 browser-certification branch and prove:

1. checkout form without DOB;
2. reservation creation;
3. authoritative quote;
4. Payment Brick rendering/ready;
5. card UI availability;
6. Yape availability if exposed by Mercado Pago TEST context;
7. real browser TEST tokenization/payment;
8. approved provider truth;
9. booking `paid`;
10. reservation `confirmed`;
11. success UI;
12. sanitized screenshot/runtime evidence.

No production/deploy/merge claim follows from this log.
