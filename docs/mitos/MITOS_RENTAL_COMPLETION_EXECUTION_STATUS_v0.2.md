# MITOS Rental Completion — Execution Status v0.2

**Date:** 2026-09-01  
**Branch snapshot:** `feature/mitos-custom-secure-checkout`  
**Rule:** isolated branch work only; no merge and no deploy.

This document supersedes `MITOS_RENTAL_COMPLETION_EXECUTION_STATUS_v0.1.md` as the current status snapshot but does not delete or rewrite v0.1.

For full history, incidents, discarded assumptions and evidence links, see:

`docs/mitos/knowledge/MITOS_EXECUTION_KNOWLEDGE_BASE_v1.0.md`

## Current status

| Gate / capability | Status | Truth boundary |
|---|---|---|
| Pay Later backend/operational E2E | ✅ CERTIFIED | R1 runtime proof complete. |
| Reservation/payment explicit states | ✅ CERTIFIED | Reservation and payment authorities implemented/tested. |
| Mercado Pago application boundary | ✅ CERTIFIED | R2A real app + simulated external provider boundary. |
| Reconciliation authorization | ✅ CERTIFIED | Customer rejected; backoffice authority only. |
| Same-key idempotency | ✅ CERTIFIED | Replay reuses same payment. |
| Different-key active-payment guard | ✅ CERTIFIED | Active second payment rejected `409`. |
| Concurrent double-payment protection | ✅ CERTIFIED | Mongo durable `activeKey` closes cross-request race. |
| Terminal payment retry | ✅ CERTIFIED | Rejected terminal payment releases active ownership. |
| Real Mercado Pago TEST provider | ✅ CERTIFIED | R2B real TEST provider payment approved. |
| Direct provider payment existence/read-back | ✅ CONFIRMED | Payment `1328015420`, `approved`, `accredited`, `live_mode=false`, `90 PEN`. |
| Booking/reservation mapping | ✅ CERTIFIED | Approved provider truth → booking paid + reservation confirmed. |
| Backoffice reconciliation against real TEST provider | ✅ CERTIFIED | Real provider read-back succeeded. |
| Real inbound Mercado Pago webhook | ⏳ PENDING | R2B provider resource showed `notification_url: null`; not certified. |
| Payment Brick browser E2E | ⏹ SUPERSEDED | Historical R3 target abandoned before certification. |
| Custom secure card checkout | 🟡 BUILDING | New Checkout API/Core Methods-style target; browser tokenization UI not yet complete/certified. |
| Yape custom checkout | 🟡 BUILDING | Backend token path exists; browser phone+OTP tokenization UI pending. |
| Pay Later UI path | ✅ BACKEND CERTIFIED | Final browser visual proof remains part of final E2E. |
| Primary DOB checkout blocker | ✅ VISUALLY SUPPRESSED | Interim workaround only; legacy schema/payload cleanup still pending. |
| Password recovery final browser/runtime proof | ⏳ PENDING | Hardened implementation exists; final certification still open. |
| Transactional email real transport | ⏳ PENDING | Persistent logical-event delivery exists; real transport final proof open. |
| Durable storage/CDN | ⏳ PENDING | Final storage durability gate open. |
| Demo/bootstrap cleanup final audit | ⏳ PENDING | Unsafe defaults removed/guarded; final audit open. |
| Production cookie/security hardening | ⏳ PENDING | Separate production gate. |
| Final continuous rental E2E | ⏳ PENDING | Must include payment + Admin + LaborSync + handover + return + inspection + closure. |
| Final integration candidate | ⏳ PENDING | Later consolidation toward `developer`; no merge authorized. |
| Production deploy/certification | 🔒 NOT AUTHORIZED | No deploy at this stage. |

## Payment truth now

```text
MitoS payment core
  ✅ integrated
  ✅ provider TEST certified
  ✅ server-owned pricing
  ✅ provider read-back
  ✅ idempotency
  ✅ concurrent duplicate-payment protection
  ✅ reconciliation

Customer-facing final payment surface
  🟡 custom secure checkout under construction

Inbound provider webhook
  ⏳ separate open gate
```

Mercado Pago is therefore **not “pending integration.”** It is in final browser/webhook certification and product-surface completion.

## Custom secure checkout target

### Card

```text
MitoS visual checkout
→ provider-secure PAN / expiry / CVV fields
→ CardToken
→ MitoS backend
→ server-owned amount/currency
→ Mercado Pago
→ provider read-back
→ explicit payment/reservation state
```

MitoS must never persist PAN/CVV/expiration or raw sensitive card data.

### Yape

```text
cell phone + approval OTP
→ provider token
→ MitoS backend
→ Mercado Pago
→ provider truth
```

Raw OTP must not be persisted.

### Pay Later

No payment data is required.

## Important current debt — date of birth

The current branch no longer displays the primary-driver birth-date field on `/checkout`, so the old browser blocker is removed.

However, the current implementation achieves that through a route-specific condition in the shared `DatePicker` component. The legacy primary `birthDate` schema/payload remains present.

Therefore the correct status is:

```text
visual blocker removed          ✅
full checkout cleanup           ❌ not yet
shared component architecture   🟡 needs cleanup
additional-driver DOB policy    ⏳ separate decision
```

Before custom-checkout certification, the workaround should be replaced with a clean Checkout-level removal and the shared DatePicker returned to generic behavior.

## Latest safe custom-checkout validation

Current custom-checkout validation history:

```text
39a12be5e450c9c4293ad1de7a2e8c3e2c06eab8
  interim primary DOB suppression

47c7361d0700d2ac0e16d68be8a67e33dd42b7c3
  added safe compile gate

run 33531608465
  backend compile   PASS
  frontend compile  PASS
  auxiliary ad-hoc R2A tsc step FAIL
  classification   workflow/tooling false red

9228145607c9809bf62c0eb2dd6b2bbd7ab7d89d
  removed invalid auxiliary tsc invocation

run 33531888438
  backend compile   PASS
  frontend compile  PASS
  provider guard    PASS
  workflow          SUCCESS
```

No Mercado Pago provider call and no application deploy were performed by this safe gate.

## Next ordered gates

1. Cleanly remove primary DOB from Checkout rather than shared DatePicker route logic.
2. Build custom secure card fields/tokenization surface.
3. Build Yape phone+OTP tokenization surface.
4. Add security/logging checks that prove sensitive raw values are not persisted/logged.
5. Safe compile/regression gate with provider disabled.
6. Isolated real Mercado Pago TEST browser E2E.
7. Real inbound Mercado Pago webhook certification.
8. Real transactional-email transport certification.
9. Password-recovery final browser/runtime proof.
10. Storage/CDN + demo/bootstrap + cookie/security hardening.
11. Final one-shot rental E2E.
12. Consolidate into one integration candidate aimed at `developer`.
13. Do not merge or deploy until explicit authorization.

## Explicit nonclaims

This status does **not** claim:

- final custom secure checkout certification;
- browser card/Yape certification;
- real inbound webhook certification;
- production credentials;
- real-money payment;
- production readiness;
- final merge readiness;
- deploy.

`main` and `developer` remain outside the current execution boundary.
