# MITOS R2B — Real Mercado Pago Test-Provider Gate Preparation Receipt

Date: 2026-08-31
Status: **PREPARATION COMPLETE — REAL TEST-PROVIDER RUN SUCCEEDED**

This file records the preparation boundary that existed immediately before the first real Mercado Pago TEST-provider execution.

The execution has now completed successfully. The authoritative final result is recorded in:

- `docs/mitos/evidence/MITOS_R2B_REAL_PROVIDER_CERTIFICATION_RECEIPT_2026-08-31.md`

## Isolation

- Repository: `thradexIT/bookcars`
- Branch: `cert/mitos-r2b-mercado-pago-sandbox`
- Draft PR: #8
- Base: `cert/mitos-r2-mercado-pago-runtime`
- Base SHA at branch creation: `24605411f91c34240463a3affa543b3d04a36eaa`
- No merge.
- No deploy.
- No Railway changes.
- No production mutation.
- `main` and `developer` untouched.

## Finalized credential/tokenization contract

The execution used only externally supplied GitHub TEST secrets:

- `MITOS_MP_TEST_ACCESS_TOKEN`
- `MITOS_MP_TEST_PUBLIC_KEY`

The obsolete `MITOS_MP_TEST_CARD_TOKEN` requirement was removed before execution.

A fresh one-time CardToken was generated during the run using Mercado Pago's TEST Public Key and published TEST card data. It was masked immediately and never persisted in evidence.

## Safety boundary

Ordinary pushes still:

- compile the backend and R2B harness;
- run the credential-literal scan;
- skip the real-provider job.

The real-provider job can run only through:

- `workflow_dispatch`; or
- a deliberate commit containing `[r2b-real]`.

No production card, production database, persistent deployment, or real-money payment is used.

## Pre-execution validation

- workflow: `mitos-r2b-sandbox`
- run id: `33454397258`
- head: `24d8c3753e4a729f3dadeac427068faee04cf26c`
- conclusion: **success**
- real provider job: skipped as expected on ordinary push

## Real-provider execution

- trigger head: `eb5eb297e30062d8b917c7af6745591577543ad9`
- workflow run: `33454472309`
- result: **success**
- sanitized artifact: `mitos-r2b-provider-evidence-33454472309`
- artifact digest: `sha256:fc9bc456164cef222955e3a046685adf795b248ad5ae3330b383038d43d91330`

## Current claim

```text
R1 Pay Later runtime                       CERTIFIED
R2A Mercado Pago application boundary      CERTIFIED
R2A concurrent payment race                CLOSED / CERTIFIED
R2B real Mercado Pago TEST provider        CERTIFIED
Payment Brick browser UI proof              NOT YET CERTIFIED
Real inbound Mercado Pago webhook           NOT YET CERTIFIED
Production readiness                       NOT CLAIMED
Merge readiness                            NOT CLAIMED
```
