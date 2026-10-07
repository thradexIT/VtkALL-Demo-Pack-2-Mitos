# MITOS R2B — Real Mercado Pago TEST Provider Certification Receipt

Date: 2026-08-31
Verdict: **CERTIFIED — REAL MERCADO PAGO TEST PROVIDER**

## Scope certified

This receipt certifies the MitoS backend/payment authority flow against Mercado Pago's real TEST provider boundary.

It does not certify production, real-money payments, browser-visual Payment Brick behavior, or real inbound webhook delivery.

## Isolation and safety

- Repository: `thradexIT/bookcars`
- Branch: `cert/mitos-r2b-mercado-pago-sandbox`
- Draft PR: #8
- Certified execution head: `eb5eb297e30062d8b917c7af6745591577543ad9`
- Workflow: `mitos-r2b-sandbox`
- Run id: `33454472309`
- No merge.
- No deploy.
- No Railway mutation.
- No production database.
- No production credentials.
- No real card.
- No real-money payment.
- `main` and `developer` untouched.

## Credentials and card handling

The execution consumed only externally configured GitHub secrets:

- `MITOS_MP_TEST_ACCESS_TOKEN`
- `MITOS_MP_TEST_PUBLIC_KEY`

No secret value is present in repository content or evidence.

The obsolete persistent `MITOS_MP_TEST_CARD_TOKEN` requirement was removed before certification.

A fresh one-time CardToken was generated during the run from:

- Mercado Pago TEST Public Key;
- Mercado Pago's published Peru TEST card data;
- the approved test outcome code.

The token was masked immediately and was not persisted in the evidence artifact.

## Workflow result

Run `33454472309` completed successfully.

### Validation job

```text
validate-harness                                  success
Compile R2B harness with backend                  success
Credential-literal scan                           success
```

### Real provider job

```text
TEST credential preflight                        success
Ephemeral MitoS identities/secrets                success
Ephemeral Mongo                                   success
Backend build                                     success
Inherited payment/security regressions            success
Isolated MitoS seed                               success
Real Mercado Pago TEST-provider certification    success
Sanitized evidence upload                         success
```

## Sanitized evidence artifact

- Artifact: `mitos-r2b-provider-evidence-33454472309`
- Artifact id: `9780953582`
- Digest: `sha256:fc9bc456164cef222955e3a046685adf795b248ad5ae3330b383038d43d91330`
- Evidence file: `mitos-r2b-provider-runtime.json`
- Result: `passed`
- Defects: `[]`

No Access Token, Public Key value, CardToken, card security code, cookie, JWT, or password is stored in the evidence.

## Observed proof

### 1. Server-owned quote

Observed:

```text
HTTP                    200
amount                  90
currency                PEN
reservation             awaiting_payment
```

The provider call occurred only after the authoritative server quote existed.

### 2. Real TEST tokenization

Observed:

```text
HTTP                    201
CardToken generated     true
CardToken persisted     false
provider token status   active
```

The actual token value is intentionally absent from evidence.

### 3. Real provider create + direct read-back

Observed:

```text
live_mode               false
external_reference      matched bookingId
transaction_amount      90
currency_id             PEN
status                  approved
```

This proves the payment resource came from Mercado Pago's TEST boundary and matched MitoS server authority.

### 4. Provider truth maps to MitoS state

Observed:

```text
payment                 approved
reservation             confirmed
booking                 paid
```

The reservation was not confirmed from a browser redirect. Provider truth was authoritative.

### 5. Same-key idempotency

Observed:

```text
HTTP                    200
same provider payment   yes
idempotentReplay        true
```

The replay did not create a second logical payment.

### 6. Distinct-key active-payment protection

Observed:

```text
HTTP                    409
expected                409
```

A second active payment attempt for the same booking was rejected before a duplicate active payment could be opened.

### 7. Backoffice reconciliation

Observed:

```text
HTTP                    200
```

Admin reconciliation re-read the real Mercado Pago TEST provider truth successfully.

## Certification verdict

```text
R2B real Mercado Pago TEST provider         CERTIFIED
Real TEST CardToken generation              CERTIFIED at provider API boundary
Server-owned amount/currency                CERTIFIED
Provider live_mode=false                    CERTIFIED
Approved → confirmed/paid                   CERTIFIED
Same-key replay                             CERTIFIED
Distinct-key active-payment protection      CERTIFIED
Backoffice reconciliation                   CERTIFIED
```

## Explicit nonclaims

The following are still separate gates and are **not** certified by this receipt:

```text
Payment Brick browser rendering/input       NOT YET CERTIFIED
Full browser checkout E2E                    NOT YET CERTIFIED
Real inbound Mercado Pago webhook            NOT YET CERTIFIED
Production credentials                       NOT USED
Real-money payment                            NOT PERFORMED
Production readiness                          NOT CLAIMED
Merge readiness                               NOT CLAIMED
Deploy                                        NOT PERFORMED
```

## Current MitoS payment position

```text
R1 Pay Later backend/operational runtime     CERTIFIED
R2A Mercado Pago application boundary        CERTIFIED
R2 reconciliation authorization              CLOSED / CERTIFIED
R2 sequential duplicate active payment       CLOSED / CERTIFIED
R2 concurrent double-payment race            CLOSED / CERTIFIED
R2 terminal retry after rejection            CERTIFIED
R2B real Mercado Pago TEST provider          CERTIFIED
Payment Brick browser proof                  PENDING
Real inbound Mercado Pago webhook            PENDING
```
