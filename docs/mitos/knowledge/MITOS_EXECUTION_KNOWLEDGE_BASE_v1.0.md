# MITOS — Execution Knowledge Base v1.0

**Repository:** `thradexIT/bookcars`  
**Knowledge snapshot date:** 2026-09-01  
**Snapshot branch:** `feature/mitos-custom-secure-checkout`  
**Snapshot product head before this document:** `9228145607c9809bf62c0eb2dd6b2bbd7ab7d89d`  
**Purpose:** preserve not only what MitoS currently does, but how the current design was reached, including failed attempts, defects, false positives, discarded assumptions, certification boundaries and evidence references.

---

## 0. Preservation rule

MitoS engineering knowledge must preserve both successful and unsuccessful execution.

A failed attempt is not deleted from history after it is repaired. It is reclassified as engineering knowledge.

Every meaningful execution should leave enough information to answer:

1. What were we trying to prove or change?
2. On which branch and commit?
3. What actually happened?
4. Was the failure in product code, test harness, environment, provider or operator/tooling?
5. What evidence exists?
6. What correction was applied?
7. What did the correction prove?
8. What remains explicitly unproven?
9. What reusable lesson was learned?

Evidence and claims must remain separated:

```text
claim
  must be supported by
observable evidence
  linked to
branch + commit + workflow/run + artifact/receipt
```

No result is promoted from `implemented` to `certified` merely because source code exists or compiles.

---

# 1. Immutable execution contract

The current MitoS completion work has been executed under these hard boundaries:

```text
main                    DO NOT MODIFY
developer               DO NOT MODIFY
merge                   DO NOT PERFORM without explicit authorization
deploy                  DO NOT PERFORM
Railway production      DO NOT MUTATE
production credentials  DO NOT USE
real-money payment      DO NOT PERFORM
Ground Control          OUT OF SCOPE
Agent Factory           OUT OF SCOPE
```

Work is performed on isolated implementation/certification branches.

When a defect is demonstrated, the correction should be the smallest change that closes the demonstrated failure without rewriting already certified behavior.

Final integration into a single candidate branch aimed at `developer` is a later gate. It must remain unmerged until explicit authorization.

---

# 2. Product execution target

The MitoS rental closure target is:

```text
Landing
→ Search
→ Vehicle
→ Reservation
→ Payment / Pay Later
→ Admin
→ LaborSync
→ Checkout / Handover
→ Return
→ Check-in / Inspection
→ Closure
```

Supporting completion requirements include:

- authentication and password recovery;
- explicit reservation/payment states;
- Mercado Pago;
- payment idempotency;
- webhook authenticity + provider read-back;
- reconciliation;
- transactional emails;
- removal of unsafe demo/bootstrap credentials;
- durable storage/CDN;
- production cookie/security hardening;
- final continuous E2E certification.

---

# 3. Current authority model

## 3.1 Reservation authority

Explicit reservation lifecycle:

```text
pending
awaiting_payment
confirmed
cancelled
completed
```

## 3.2 Payment authority

Explicit payment lifecycle:

```text
pending
approved
rejected
refunded
```

Unknown provider states fail closed rather than silently confirming a reservation.

## 3.3 Rental operational lifecycle

```text
reserved
→ checked_out
→ returned
→ closed
```

Closure promotes an explicit `confirmed` reservation to `completed`.

## 3.4 Payment trust boundary

```text
Browser
  = user intent + provider-tokenized data

MitoS backend
  = booking identity + amount + currency + reservation/payment state authority

Mercado Pago
  = provider transaction truth

Webhook / reconciliation
  = synchronization mechanisms
```

Browser redirect or browser-reported success is never authoritative payment truth.

---

# 4. Execution journal

## 4.1 Implementation baseline — rental completion

Branch:

`feature/mitos-rental-completion`

Frozen implementation head:

`b6858ecfb6f7204508c4392dc79898b0bbfba672`

Draft PR:

`#5 — MitoS rental completion — lifecycle, auth and payments`

Source CI:

- workflow: `mitos-closure`
- run: `#142`
- run id: `33436024864`
- result: `success`

Implemented baseline included:

- explicit rental lifecycle;
- reservation state service;
- unconfirmed physical checkout guard;
- conservative compatibility for legacy bookings without ReservationState;
- customer/Admin auth surfaces;
- dedicated hashed password reset token with TTL/single-use semantics;
- Mercado Pago reservation-first backend flow;
- server-owned quote;
- PaymentTransaction persistence;
- webhook signature validation;
- provider read-back;
- amount/currency verification;
- reconciliation;
- transactional-email delivery ledger;
- guarded DEV seed with no default source passwords.

No deploy or merge was performed.

---

## 4.2 R1 — Pay Later backend/operational E2E

Branch:

`cert/mitos-r1-pay-later-runtime`

Draft PR:

`#6 — R1 certification — MitoS Pay Later runtime E2E`

Final clean head:

`cca34fb8e78d57473d99c43ae39041fe88857726`

Certified workflow:

- workflow: `mitos-r1-runtime`
- run: `#7`
- run id: `33438069566`
- result: `success`

Evidence established:

- customer HTTP auth `200`;
- Admin HTTP auth `200`;
- unpaid reservation initially pending;
- same reservation-session replay reused one Booking;
- unconfirmed handover rejected `409`;
- return-before-checkout rejected `409`;
- Pay Later transitioned reservation to confirmed;
- operational lifecycle started `reserved`;
- booking was visible through Admin/LaborSync query path;
- `reserved → checked_out`;
- departure replay remained idempotent with one lifecycle document;
- `checked_out → returned`;
- return replay remained `returned`;
- inspection closed the rental;
- reservation transitioned `confirmed → completed`;
- persisted odometer/inspection evidence included `kmOut=1000`, `kmIn=1012`, inspection flags true.

Verdict:

`R1 — PAY LATER BACKEND/OPERATIONAL E2E: CERTIFIED`

Explicit nonclaims:

- no browser visual certification;
- no physical mobile LaborSync device certification;
- no production/deploy readiness claim.

---

## 4.3 R2A — Mercado Pago application boundary

Branch:

`cert/mitos-r2-mercado-pago-runtime`

Draft PR:

`#7 — R2 certification — MitoS Mercado Pago runtime`

Certified product-code head:

`107886758335752f120aa180a645d22c3bb18530`

Primary receipt:

`docs/mitos/evidence/MITOS_R2A_MERCADO_PAGO_RUNTIME_CERTIFICATION_RECEIPT_2026-08-31.md`

R2A used real MitoS HTTP/routes/middleware/models/persistence with the Mercado Pago SDK substituted only at the external provider method boundary.

### Defect: reconciliation authorization

Observed:

- a normal customer token could call backoffice reconciliation and receive HTTP 200.

Classification:

`PRODUCT AUTHORIZATION DEFECT`

Correction:

- added explicit `verifyBackofficeToken` authority;
- Admin/Supplier allowed;
- customer reconciliation returns HTTP `403`.

Verdict:

`CLOSED / CERTIFIED`

### Defect: sequential duplicate active payment

Observed:

- same booking;
- first payment active;
- second request with a different idempotency key could create another provider payment.

Classification:

`PRODUCT IDEMPOTENCY DEFECT`

Correction stage 1:

- active-payment guard;
- second distinct key while active returns HTTP `409`;
- no second provider create.

### Defect: concurrent duplicate active payment race

Failing workflow run:

`33439437520`

Failing head:

`776889322428e38239a542e017c45679ed11b6ed`

Observed:

```text
providerCreateCalls = 2
responses           = 201 / 201
activeTransactions  = 2
reservationStatus   = awaiting_payment
```

This proved the sequential read-before-write guard was insufficient under concurrency.

Classification:

`PRODUCT CONCURRENCY DEFECT`

Final correction:

- deterministic `activeKey = mercado_pago:<bookingId>`;
- unique sparse MongoDB index;
- atomic pending PaymentTransaction claim before provider I/O;
- only one concurrent request can own the active key;
- active pending/approved payments retain the key;
- terminal rejected/refunded/failed states release the key;
- same-key retry preserves provider idempotency semantics.

Important design lesson:

An in-memory mutex was intentionally rejected because it would not serialize payment creation across multiple processes/instances.

Final certified metrics:

```text
providerCreateCalls = 1
responses           = 201 / 409
activeTransactions  = 1
reservationStatus   = awaiting_payment
```

Terminal-retry proof:

```text
first payment       rejected
activeKey           released
new key             accepted
second payment      pending
activeTransactions  1
```

R2A also proved:

- wrong quote session → `404`;
- quote → server-owned `90 PEN`;
- missing idempotency key → `400`;
- payer mismatch → `400`;
- wrong payment session → `404`;
- browser-supplied amount/currency cannot override backend authority;
- same-key replay → same payment, zero additional provider create;
- distinct active-payment key → `409`;
- tampered webhook → `401` before provider read;
- provider pending keeps reservation awaiting_payment;
- approved → payment approved + reservation confirmed + booking paid;
- approved webhook replay does not duplicate logical email events;
- amount mismatch fails closed;
- currency mismatch fails closed;
- rejected remains explicit/unconfirmed;
- refunded maps to explicit refunded state.

Verdict:

`R2A — MERCADO PAGO APPLICATION BOUNDARY: CERTIFIED`

---

## 4.4 R2B — real Mercado Pago TEST provider

Branch:

`cert/mitos-r2b-mercado-pago-sandbox`

Draft PR:

`#8 — R2B certification — MitoS Mercado Pago real sandbox`

Certified execution commit:

`eb5eb297e30062d8b917c7af6745591577543ad9`

Workflow:

`mitos-r2b-sandbox`

Certified run:

`33454472309`

Artifact:

- name: `mitos-r2b-provider-evidence-33454472309`
- artifact id: `9780953582`
- digest: `sha256:fc9bc456164cef222955e3a046685adf795b248ad5ae3330b383038d43d91330`

Primary receipt:

`docs/mitos/evidence/MITOS_R2B_REAL_PROVIDER_CERTIFICATION_RECEIPT_2026-08-31.md`

Real TEST-provider evidence:

```text
quote                  90 PEN
reservation            awaiting_payment
CardToken generated    true
CardToken persisted    false
provider live_mode     false
provider status        approved
payment                approved
reservation            confirmed
booking                paid
same-key replay        same provider payment
second active key      HTTP 409
Admin reconciliation   HTTP 200
```

Provider Payment ID:

`1328015420`

### Independent user/provider read-back

A later direct Mercado Pago API GET performed by the user independently corroborated the GitHub artifact.

Provider response included:

```text
id                       1328015420
status                   approved
status_detail            accredited
live_mode                false
captured                 true
currency_id              PEN
transaction_amount       90
transaction_amount_refunded 0
collector_id             3129009063
```

The `external_reference` matched the MitoS Booking ID.

The provider-returned `collector_id = 3129009063` matched the User ID shown for the Mercado Pago MitoS application.

The idempotency key also carried the R2B workflow correlation and MitoS application number.

This independent direct-provider GET removes ambiguity about whether Payment `1328015420` actually existed at Mercado Pago.

Verdict:

`R2B — REAL MERCADO PAGO TEST PROVIDER: CERTIFIED`

### Monitoring UI discrepancy

Mercado Pago Developers Monitoring BETA showed zero API requests for the selected period even while direct provider GET proved the payment existed and was approved.

Classification:

`PROVIDER UI / TELEMETRY DISCREPANCY`

Decision:

- do not use Monitoring BETA as payment existence authority;
- provider resource GET is stronger evidence for this payment;
- UI discrepancy can be investigated separately if operationally useful.

### Webhook limitation discovered from provider resource

The direct provider response contained:

`notification_url: null`

Therefore R2B did **not** prove real inbound Mercado Pago webhook delivery.

This is a deliberate open gate, not a hidden failure.

---

# 5. R3 browser history — attempts, failures and lessons

Original R3 target:

`Payment Brick browser E2E`

Historical branch:

`cert/mitos-r3-browser-e2e`

Historical plan:

`docs/mitos/evidence/MITOS_R3_PAYMENT_BRICK_BROWSER_PLAN_2026-08-31.md`

Execution markers retained on that branch:

- `MITOS_R3_BROWSER_EXECUTION_MARKER_2026-09-01.md`
- `MITOS_R3_BROWSER_REAL_EXECUTION_MARKER_2026-09-01.md`

R3 is important knowledge even though the Payment Brick UI target was later superseded by a custom Checkout API/Core Methods design.

## 5.1 Incident R3-ENV-001 — Mongo IPv6 startup

Observed:

- real browser workflow failed before browser/provider interaction;
- local backend attempted Mongo on `::1:27017` rather than intended IPv4 path.

Classification:

`HARNESS / ENVIRONMENT DEFECT`

Not classified as:

- MitoS product defect;
- Mercado Pago defect.

Correction:

- force IPv4 Mongo URI in harness/workflow;
- use TCP readiness.

Lesson:

A certification environment failure must not be mislabeled as a product failure simply because it prevents the product test from starting.

## 5.2 Incident R3-ENV-002 — Vite frontend readiness

Observed:

- backend started;
- Chromium installation completed;
- frontend did not reach readiness;
- provider was never called.

Classification:

`HARNESS / LOCAL FRONTEND STARTUP DEFECT`

Correction:

- Vite/local startup diagnostics and readiness correction.

Lesson:

Provider claims must explicitly state whether the test reached the provider boundary. A red workflow does not imply a failed provider payment.

## 5.3 Incident R3-HARNESS-003 — birth-date backing input empty

Run:

`33520723077`

Artifact:

- id: `9805709128`
- digest: `sha256:7c5aafe289c2044c6a85af7c3d5a67fa217b6057da78ba2a447c5f7b47f82411`

Observed:

- Checkout rendered;
- normal guest fields were filled;
- Terms accepted;
- pay-in-full selected;
- `/api/checkout` was never reached;
- no MP quote;
- no MP payment;
- no Brick rendering;
- browser validation reported the date field empty.

Classification:

`HARNESS INTERACTION DEFECT`

No payment/product/provider defect was claimed.

## 5.4 Incident R3-HARNESS-004 — hidden input click intercepted

Run:

`33522164977`

Artifact:

- id: `9806324830`
- digest: `sha256:6358f11493f2a8c361f7afc368d04700ffb9f83f86ae8b39bcc6565fbcbe2acc`

Observed real MUI structure:

- hidden backing input;
- visible editable date sections;
- click against hidden backing input intercepted by visible control.

Classification:

`HARNESS INTERACTION DEFECT`

Again:

- no `/api/checkout`;
- no provider payment.

## 5.5 Incident R3-HARNESS-005 — incorrect spinbutton assumption

Attempted correction:

- harness targeted segmented MUI `spinbutton` controls for day/month/year.

Latest execution marker commit:

`728290b09fbee39bb7e3116fa16f9a795eeb1d3f`

Workflow run:

`33523107198`

Observed:

- real rendered Checkout did not expose the expected spinbutton structure used by the harness assumption;
- timeout occurred before reservation/payment creation.

Classification:

`HARNESS ASSUMPTION DEFECT`

Lesson:

Automation should derive selectors from the actual rendered control rather than from a presumed MUI implementation detail.

## 5.6 Product-question escalation — why does checkout require date of birth?

During diagnosis, the browser harness complexity exposed a more important product question:

Why was date of birth required at all?

Possible legitimate reasons would have included:

- explicit minimum driver-age business rule;
- insurance requirement;
- licensing eligibility rule.

No authoritative MitoS requirement had been established for using date of birth as part of payment checkout.

Decision:

- date of birth is irrelevant to the current payment checkout;
- do not continue spending certification effort automating a field without business authority;
- future driver-age/license eligibility, if required, belongs in Driver/Profile/License policy rather than payment processing.

This is an example where a test failure revealed a product-design smell rather than merely a selector problem.

---

# 6. Custom secure checkout decision

The Payment Brick visual target was superseded before certification was complete.

New target:

`MitoS Custom Secure Checkout using Mercado Pago Checkout API / Core Methods semantics`

Active branch:

`feature/mitos-custom-secure-checkout`

Base:

R2B documented head `924ae043fd6b94079b80956f675e2898008f6567`

Reason:

The product requirement is to keep the customer inside the MitoS experience while retaining full visual control over the checkout.

Security boundary:

```text
MitoS controls
  layout
  copy
  method selection
  reservation context
  total presentation
  payment state UI

Mercado Pago secure browser components / tokenization control
  PAN
  expiration
  CVV
  provider token generation

MitoS backend controls
  booking
  authoritative amount
  authoritative currency
  external_reference
  idempotency
  reservation/payment state transitions

Mercado Pago controls
  provider transaction truth
```

Sensitive card data must never be persisted in:

- MongoDB;
- backend request logs;
- application logs;
- localStorage/sessionStorage;
- analytics;
- screenshots/evidence;
- error tracking payloads.

Only tokenized provider data should cross into the MitoS payment command.

---

# 7. Intended custom payment methods

## 7.1 Card

Target user-visible fields:

- card number;
- expiration MM/YY;
- CVV;
- cardholder name;
- email;
- identification only if required by Mercado Pago/provider rules;
- installments when applicable.

Sensitive card elements must be provider-secure/tokenizing fields, not normal MitoS inputs that send PAN/CVV to the backend.

Card flow:

```text
secure browser card fields
→ CardToken
→ MitoS backend payment command
→ Mercado Pago
→ provider read-back
→ approved?
  YES → payment approved + reservation confirmed + booking paid
  NO  → remain explicit pending/rejected
```

## 7.2 Yape

Current backend already contains a `paymentMethodId === 'yape'` path which sends:

```text
token
installments = 1
payment_method_id = yape
```

Target browser flow:

```text
cell phone + approval OTP
→ provider Yape token
→ MitoS backend
→ Mercado Pago
→ provider truth
```

Raw Yape OTP must not be persisted by MitoS.

## 7.3 Pay Later

No financial data is required.

The reservation proceeds through the already-certified Pay Later flow.

---

# 8. Birth-date cleanup — exact current truth

This section corrects an earlier overly broad statement that date of birth had been fully removed from Checkout.

Commit:

`39a12be5e450c9c4293ad1de7a2e8c3e2c06eab8`

Commit message:

`fix(mitos-checkout): remove irrelevant birth date field from checkout`

What the commit actually changed:

- shared `frontend/src/components/DatePicker.tsx` now accepts a `name` prop;
- when `name === 'birthDate'` and pathname is `/checkout`, the component returns `null`.

Therefore:

```text
birth-date visual field on /checkout         SUPPRESSED
browser required-field blocker               REMOVED
frontend compile                              PASS
backend compile                               PASS
birthDate legacy schema field                 STILL PRESENT
birthDate guest driver payload property       STILL PRESENT
additional-driver birthDate behavior          STILL PRESENT
full domain cleanup                           NOT YET DONE
```

Classification:

`INTERIM PRODUCT WORKAROUND / PARTIAL CLEANUP`

This is not the desired final architecture because a shared component contains route-specific MitoS behavior.

Required later cleanup:

- remove primary-driver birth-date requirement from Checkout.tsx directly;
- remove unused primary-driver validation/ref/focus behavior;
- remove or explicitly retain the domain field based on Driver/Profile requirements;
- keep shared DatePicker generic;
- decide additional-driver age/date policy separately rather than silently deleting it.

This debt must be closed before final MitoS checkout certification.

---

# 9. Custom-checkout CI history

## 9.1 Product change commit

`39a12be5e450c9c4293ad1de7a2e8c3e2c06eab8`

## 9.2 Safe validation workflow added

Commit:

`47c7361d0700d2ac0e16d68be8a67e33dd42b7c3`

Purpose:

- backend compile;
- frontend compile;
- no provider call;
- no application deploy.

### Incident CI-HARNESS-001 — false red gate

Run:

`33531608465`

Observed:

```text
backend compile   PASS
frontend compile  PASS
extra R2A tsc step FAIL
```

The failing step invoked R2A scripts with `--module commonjs` even though those scripts/backend modules use top-level await and repository-specific TypeScript/path configuration.

Classification:

`CERTIFICATION WORKFLOW / TOOLING ERROR`

Not classified as:

- product regression;
- Mercado Pago regression;
- frontend failure;
- backend failure.

Correction commit:

`9228145607c9809bf62c0eb2dd6b2bbd7ab7d89d`

Correction:

- removed the invalid ad-hoc TypeScript invocation;
- kept the safe gate focused on actual product builds and explicit no-provider guard.

Corrected run:

`33531888438`

Result:

```text
backend dependencies  PASS
backend compile       PASS
frontend dependencies PASS
frontend compile      PASS
provider guard        PASS
workflow              SUCCESS
```

Lesson:

A custom certification command must not bypass or contradict the repository's real compilation configuration. A false-red harness should be documented rather than treated as a product defect.

---

# 10. Other execution/tooling incidents preserved

These incidents did not mutate protected branches or production, but are retained because they matter for engineering process quality.

## R1 tooling incidents

- an update attempt used an invalid/bogus file SHA and GitHub returned `409`; no mutation occurred;
- temporary probe/pending files were accidentally introduced during certification work and then deleted; final R1 branch was cleaned before certification;
- a PR creation attempt was made before the target branch existed and GitHub returned `422`; no repository mutation occurred.

Lesson:

Repository-write failures and temporary artifacts should be checked for net state, not merely ignored because the final run passes.

## R2 documentation tooling incident

- an attempt to `create_file` for an already-existing receipt returned `422`; no mutation occurred.

Lesson:

Fetch/inspect target path before choosing create vs update.

## R2B secret-scanner false positive

First scanner implementation embedded its own detection regex/literal pattern in the file being scanned.

Run:

`33450693917`

Result:

- compile passed;
- scanner flagged its own source pattern.

Classification:

`TEST/SCANNER FALSE POSITIVE`

Correction:

- change scanner construction so the scanner does not match its own detection literals.

Lesson:

Security scanners themselves require fixtures that distinguish real leaks from scanner-source literals.

---

# 11. Decision log

## DEC-001 — protected branch safety

No direct mutation of `main` or `developer` during completion/certification.

## DEC-002 — no deploy during current certification

Runtime/product certification remains isolated from deployment authorization.

## DEC-003 — browser is not payment authority

A redirect, success component or client state cannot confirm payment.

## DEC-004 — backend owns amount and currency

Frontend payment data cannot choose authoritative charge amount/currency.

## DEC-005 — provider read-back is mandatory truth synchronization

Approved payment processing re-reads Mercado Pago resource truth rather than trusting create/redirect alone.

## DEC-006 — idempotency is both key-based and reservation-active-state-based

Same-key provider replay is necessary but insufficient. The system also prevents a different key from opening a second active payment for the same booking.

## DEC-007 — concurrency serialization belongs in durable shared storage

MongoDB unique `activeKey` is preferred over process-local mutexes.

## DEC-008 — reconciliation is backoffice authority

Customer tokens cannot mutate payment/reservation truth through reconciliation.

## DEC-009 — terminal payment states release active-payment ownership

A rejected/refunded/failed historical payment must not permanently prevent a later legitimate attempt.

## DEC-010 — insurance online pricing fails closed

The unresolved USD deductible/FX policy is not invented. Insurance online payment remains blocked until an authoritative rule exists.

## DEC-011 — TEST provider before production

Real Mercado Pago TEST provider proof is required before any production credentials or money movement.

## DEC-012 — CardToken is ephemeral

CardToken is generated for a payment attempt and is not treated as a persistent application credential.

## DEC-013 — sensitive card data is not MitoS data

PAN/CVV/expiration exist only long enough inside provider-secure browser tokenization boundaries and are never persisted by MitoS.

## DEC-014 — Payment Brick UI superseded

MitoS chooses a custom secure checkout surface for visual/product control rather than preserving Payment Brick as the final UI goal.

The already-certified backend Payments API path is retained; changing to a different provider API solely for novelty is deferred.

## DEC-015 — Yape target

Cell phone + approval OTP are used to generate provider tokenization; raw OTP is not stored.

## DEC-016 — Pay Later contains no payment data

Pay Later is a reservation path, not an online provider payment waiting for approval.

## DEC-017 — date of birth is not a payment requirement

Primary-driver date of birth is removed from payment checkout unless a future explicit age/license/insurance policy gives it business authority.

## DEC-018 — evidence before certification claim

A green source build proves buildability, not runtime/provider/browser certification.

## DEC-019 — provider monitoring UI is not authoritative transaction truth

When Monitoring BETA disagrees with direct provider resource GET, the direct provider payment resource is used for the transaction-existence claim.

## DEC-020 — real inbound webhook remains a separate gate

R2B's `notification_url: null` means provider payment certification cannot be stretched into inbound-webhook certification.

---

# 12. Evidence index

## Implementation baseline

```text
branch     feature/mitos-rental-completion
PR         #5
head       b6858ecfb6f7204508c4392dc79898b0bbfba672
workflow   mitos-closure
run id     33436024864
result     success
```

## R1 Pay Later

```text
branch     cert/mitos-r1-pay-later-runtime
PR         #6
head       cca34fb8e78d57473d99c43ae39041fe88857726
workflow   mitos-r1-runtime
run id     33438069566
receipt    docs/mitos/evidence/MITOS_R1_PAY_LATER_RUNTIME_CERTIFICATION_RECEIPT_2026-08-31.md
verdict    CERTIFIED
```

## R2A application boundary

```text
branch     cert/mitos-r2-mercado-pago-runtime
PR         #7
cert head  107886758335752f120aa180a645d22c3bb18530
fail run   33439437520   concurrent race reproduced
receipt    docs/mitos/evidence/MITOS_R2A_MERCADO_PAGO_RUNTIME_CERTIFICATION_RECEIPT_2026-08-31.md
verdict    CERTIFIED
```

## R2B real TEST provider

```text
branch     cert/mitos-r2b-mercado-pago-sandbox
PR         #8
exec head  eb5eb297e30062d8b917c7af6745591577543ad9
run id     33454472309
artifact   9780953582
payment    1328015420
amount     90 PEN
provider   live_mode=false
status     approved / accredited
receipt    docs/mitos/evidence/MITOS_R2B_REAL_PROVIDER_CERTIFICATION_RECEIPT_2026-08-31.md
verdict    CERTIFIED
```

## R3 historical browser attempts

```text
branch     cert/mitos-r3-browser-e2e
plan       docs/mitos/evidence/MITOS_R3_PAYMENT_BRICK_BROWSER_PLAN_2026-08-31.md
run        33520723077   DOB backing field blocker
artifact   9805709128
run        33522164977   hidden input / visible control interaction
artifact   9806324830
run        33523107198   segmented spinbutton assumption failure
verdict    NOT CERTIFIED / TARGET SUPERSEDED
```

## Custom secure checkout start

```text
branch     feature/mitos-custom-secure-checkout
base       924ae043fd6b94079b80956f675e2898008f6567
DOB UI     39a12be5e450c9c4293ad1de7a2e8c3e2c06eab8  interim suppression
CI add     47c7361d0700d2ac0e16d68be8a67e33dd42b7c3
false run  33531608465
CI fix     9228145607c9809bf62c0eb2dd6b2bbd7ab7d89d
safe run   33531888438 success
provider   NOT CALLED by custom-checkout safe gate
```

---

# 13. Current status snapshot — v0.2 truth

```text
R1 Pay Later backend/operational runtime      ✅ CERTIFIED
R2A Mercado Pago application boundary         ✅ CERTIFIED
R2 reconciliation authorization               ✅ CLOSED / CERTIFIED
R2 sequential duplicate active payment        ✅ CLOSED / CERTIFIED
R2 concurrent double-payment race             ✅ CLOSED / CERTIFIED
R2 terminal retry after rejection             ✅ CERTIFIED
R2B real Mercado Pago TEST provider           ✅ CERTIFIED
Direct Mercado Pago API read-back              ✅ CONFIRMED
TEST provider tokenization                     ✅ CERTIFIED
Server-owned amount/currency                   ✅ CERTIFIED
Approved → confirmed/paid                      ✅ CERTIFIED
Same-key replay                                ✅ CERTIFIED
Distinct-key active payment protection         ✅ CERTIFIED
Backoffice reconciliation                      ✅ CERTIFIED

Custom secure Checkout                         🟡 BUILDING
Primary DOB field visual blocker               ✅ SUPPRESSED
Primary DOB legacy schema/payload cleanup       ⏳ PENDING
Custom secure card fields/tokenization UI       ⏳ PENDING
Yape browser tokenization UI                    ⏳ PENDING
Custom browser payment E2E                      ⏳ PENDING
Real inbound Mercado Pago webhook               ⏳ PENDING
Transactional email real transport final        ⏳ PENDING
Password recovery final browser/runtime proof   ⏳ PENDING
Durable storage/CDN                             ⏳ PENDING
Demo/bootstrap final cleanup                    ⏳ PENDING
Production cookie/security hardening            ⏳ PENDING
Final continuous rental E2E                     ⏳ PENDING
Final integration candidate branch              ⏳ PENDING
Production deploy/certification                  🔒 NOT AUTHORIZED
```

---

# 14. Security findings not to lose

During custom-checkout safe CI, dependency installation reports existing npm vulnerability counts across inherited packages.

These were not introduced by the birth-date suppression change and were not used to classify the checkout change as failed because the current gate is build-focused.

However, production-security hardening must include a separate dependency-vulnerability review rather than silently ignoring these audit results.

No automatic `npm audit fix --force` should be applied inside payment certification because it can introduce uncontrolled breaking dependency changes.

---

# 15. Next execution sequence

The current ordered path is:

```text
1. Replace interim route-specific DOB suppression with clean Checkout-level removal.
2. Keep shared DatePicker generic.
3. Build custom secure card payment UI.
4. Ensure PAN/CVV/expiration never enter MitoS persistence/logging.
5. Generate CardToken in browser provider boundary.
6. Use already-certified backend create-payment authority.
7. Add Yape phone + OTP tokenization UI.
8. Safe compile/security regression gate with provider disabled.
9. Isolated real Mercado Pago TEST browser certification.
10. Real inbound webhook certification as a separate externally reachable HTTPS gate.
11. Transactional email real transport certification.
12. Password-recovery final browser/runtime certification.
13. Durable storage/CDN and demo/bootstrap/security cleanup.
14. Final one-shot rental E2E.
15. Consolidate work into one integration/candidate branch aimed at developer.
16. Leave unmerged/un-deployed until explicit authorization.
```

---

# 16. Knowledge maintenance protocol

From this snapshot onward, each major gate should append or version knowledge with:

```text
DATE
GATE / INCIDENT / DECISION ID
branch
commit
workflow + run id
artifact id/digest when applicable
intent
observed result
classification
correction
proof after correction
nonclaims
lesson
next gate
```

Recommended classification vocabulary:

```text
PRODUCT DEFECT
SECURITY DEFECT
AUTHORIZATION DEFECT
IDEMPOTENCY DEFECT
CONCURRENCY DEFECT
HARNESS DEFECT
ENVIRONMENT DEFECT
WORKFLOW/TOOLING ERROR
PROVIDER UI/TELEMETRY DISCREPANCY
PRODUCT DECISION
POLICY GAP
EXPECTED FAIL-CLOSED BEHAVIOR
CERTIFIED
NOT CERTIFIED
SUPERSEDED
```

Never remove a historical incident merely because the final implementation changed direction.

Historical R3 Payment Brick failures remain useful because they explain why the product requirement was reconsidered and why the final checkout architecture differs from the original certification plan.

---

# 17. Final truth boundary for this snapshot

This knowledge snapshot supports the following statement:

> MitoS has a certified Pay Later operational backend path and a certified Mercado Pago TEST-provider payment core, including server-owned pricing, provider truth read-back, idempotency, concurrent duplicate-payment protection and reconciliation. The final customer-facing custom secure card/Yape browser checkout, real inbound Mercado Pago webhook, final email/auth/storage/security gates and production deployment remain open.

It does **not** support claims of:

- complete MitoS v1 certification;
- production readiness;
- production Mercado Pago credentials;
- real-money payment;
- real inbound webhook certification;
- complete custom secure Checkout;
- final browser payment E2E;
- final merge readiness;
- deployment.

`main` and `developer` remain outside this work boundary.
