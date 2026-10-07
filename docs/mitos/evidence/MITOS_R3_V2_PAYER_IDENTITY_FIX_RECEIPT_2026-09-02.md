# MitoS R3 v2 — Payment Brick payer identity fix receipt

**Date:** 2026-09-02  
**Repository:** `thradexIT/bookcars`  
**Branch:** `cert/mitos-r3-payment-brick-browser-v2`  
**Certified head:** `b827e8a3d121a9d2f7a27ef030101b1681890b05`  
**Workflow:** `mitos-r3-v2-browser-e2e`  
**Run:** `33660106614`  
**Verdict:** `PASS — defects=none`

## Reproduced defect

The real Payment Brick browser run reached the provider but Mercado Pago rejected the payer identity:

```text
HTTP 400
payer.email must be a valid email
```

The first syntactic correction proved a second TEST-provider constraint:

```text
HTTP 400
Payer email forbidden
```

Root cause: the R3 browser harness generated arbitrary test-domain payer emails. Mercado Pago TEST accepts the provider-certified payer identity already used by the successful R2B gate.

## Code correction

`frontend/scripts/mitos-r3-v2-browser-cert.mjs` now:

1. reuses the R2B-certified Mercado Pago TEST payer `test@testuser.com`;
2. waits for the actual payment API response;
3. fails immediately with the provider HTTP status/message instead of timing out on `.checkout-status`;
4. preserves only sanitized provider error fields in evidence.

Implementation commits:

- `77ddcf4846160356d89605f1593b81891ec31b58` — provider-valid email format plus fail-fast payment response diagnostics;
- `b827e8a3d121a9d2f7a27ef030101b1681890b05` — exact R2B-certified TEST payer identity.

## Final executable proof

Run `33660106614` completed successfully:

```text
validate-browser-harness       PASS
real-payment-brick-browser     PASS

real MitoS Checkout rendered without DOB
guest reservation form completed
Mercado Pago Payment Brick ready
Mercado Pago TEST card entered through Payment Brick
browser payment completed and success UI rendered
RESULT=passed defects=none
```

Evidence artifact:

- name: `mitos-r3-v2-browser-evidence-33660106614`
- artifact id: `9858471500`
- digest: `sha256:37ce6bd591fed0e9ba72dee7c7d98c72659fd3b3821f14b2b4428b90a4b551cf`
- retention expiry: 2026-09-16

## Scope

Certified:

- real MitoS Checkout browser path;
- authoritative quote `90 PEN`;
- Mercado Pago Payment Brick rendering;
- TEST card entry through the Brick;
- provider payment request accepted;
- successful checkout status rendered;
- no R3 defects reported by the evidence harness.

Still not claimed:

- production credentials;
- production payment;
- deployment;
- merge readiness;
- real inbound webhook delivery;
- Ground Control;
- Agent Factory.
