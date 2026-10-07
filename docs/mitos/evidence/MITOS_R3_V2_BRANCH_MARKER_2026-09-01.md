# MitoS R3 v2 — Browser Certification Handoff

Date: 2026-09-01
Source branch: `feature/mitos-custom-secure-checkout`
Source head before handoff: `5f555ac55e1a24939cef312e7cc04f0ac4d10063`

This marker records the handoff from the source-green Checkout Bricks implementation into a fresh browser certification branch.

The new R3 v2 harness must not inherit the obsolete date-of-birth / MUI DatePicker interaction assumptions from `cert/mitos-r3-browser-e2e`.

Certified baseline inherited below this point:

- R1 Pay Later runtime certified;
- R2A Mercado Pago application boundary certified;
- R2B real Mercado Pago TEST provider certified;
- Checkout Bricks + MitoS branding source gate green;
- Yape enabled through Brick `bankTransfer: 'all'` configuration, runtime visibility still unproven;
- Checkout no longer collects DOB;
- minimum-age rental eligibility remains a separate unresolved policy authority.

Safety boundary remains: no deploy, no merge, no main/developer mutation, no production credentials or real-money payment.
