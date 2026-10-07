import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import mongoose from 'mongoose'
import { Payment } from 'mercadopago'
import Booking from '../src/models/Booking'
import Car from '../src/models/Car'
import Location from '../src/models/Location'
import PaymentTransaction, { PaymentStatus } from '../src/models/PaymentTransaction'
import ReservationState, { ReservationStatus } from '../src/models/ReservationState'
import TransactionalEmailDelivery, { TransactionalEmailEvent } from '../src/models/TransactionalEmailDelivery'
import User from '../src/models/User'

const apiBase = 'http://127.0.0.1:4003'
const dbUri = String(process.env.BC_DB_URI || '')
const runId = String(process.env.GITHUB_RUN_ID || `local-${Date.now()}`)
const evidenceDir = String(process.env.R2_EVIDENCE_DIR || path.resolve(process.cwd(), '../r2-evidence'))
const customerEmail = String(process.env.MITOS_DEMO_CUSTOMER_EMAIL || '')
const adminEmail = String(process.env.MITOS_DEMO_ADMIN_EMAIL || '')
const supplierEmail = String(process.env.MITOS_DEMO_SUPPLIER_EMAIL || '')
const password = String(process.env.MITOS_DEMO_PASSWORD || '')
const webhookSecret = String(process.env.BC_MERCADO_PAGO_WEBHOOK_SECRET || '')

if (!dbUri || !customerEmail || !adminEmail || !supplierEmail || !password || !webhookSecret) {
  throw new Error('R2A runtime fixture environment is incomplete')
}

type ProviderPayment = {
  id: string
  status: string
  status_detail?: string
  external_reference: string
  transaction_amount: number
  currency_id: string
  payment_method_id?: string
}

type EvidenceStep = {
  name: string
  timestamp: string
  httpStatus?: number
  observed?: unknown
  expected?: unknown
  defect?: string
}

const evidence = {
  runId,
  startedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || 'cert/mitos-r2-mercado-pago-runtime',
  commit: process.env.GITHUB_SHA || 'local',
  providerMode: 'simulated-sdk-boundary',
  steps: [] as EvidenceStep[],
  defects: [] as string[],
  result: 'running' as 'running' | 'passed' | 'failed',
  completedAt: '',
  failure: '',
}

const record = (step: EvidenceStep) => {
  evidence.steps.push(step)
  if (step.defect) evidence.defects.push(step.defect)
  console.log(`[R2A] ${step.name}${step.httpStatus ? ` -> HTTP ${step.httpStatus}` : ''}${step.defect ? ` DEFECT=${step.defect}` : ''}`)
}

const providerStore = new Map<string, ProviderPayment>()
const providerCreateCalls: Array<{ id: string; idempotencyKey: string; body: any }> = []
const providerGetCalls: string[] = []
let providerSequence = 0

const originalCreate = (Payment.prototype as any).create
const originalGet = (Payment.prototype as any).get

;(Payment.prototype as any).create = async ({ body, requestOptions }: any) => {
  const id = `r2-provider-${runId}-${++providerSequence}`
  const payment: ProviderPayment = {
    id,
    status: 'pending',
    status_detail: 'pending_waiting_payment',
    external_reference: String(body.external_reference || ''),
    transaction_amount: Number(body.transaction_amount),
    currency_id: 'PEN',
    payment_method_id: String(body.payment_method_id || ''),
  }
  providerStore.set(id, payment)
  providerCreateCalls.push({
    id,
    idempotencyKey: String(requestOptions?.idempotencyKey || ''),
    body: JSON.parse(JSON.stringify(body)),
  })
  return JSON.parse(JSON.stringify(payment))
}

;(Payment.prototype as any).get = async ({ id }: any) => {
  const key = String(id)
  providerGetCalls.push(key)
  const payment = providerStore.get(key)
  if (!payment) throw new Error(`Simulated Mercado Pago payment ${key} not found`)
  return JSON.parse(JSON.stringify(payment))
}

const request = async (pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBase}${pathname}`, init)
  const text = await response.text()
  let body: any = text
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }
  return { response, body }
}

const jsonHeaders = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  ...extra,
})

const cookieFrom = (response: Response) => {
  const setCookie = response.headers.get('set-cookie') || ''
  return setCookie.split(';')[0]
}

const signWebhook = (dataId: string, requestId: string, ts = String(Math.floor(Date.now() / 1000))) => {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex')
  return { signature: `ts=${ts},v1=${v1}`, ts }
}

const waitReservation = async (bookingId: string, expected: ReservationStatus, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await ReservationState.findOne({ booking: new mongoose.Types.ObjectId(bookingId) }).lean()
    if (state?.status === expected) return state
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return ReservationState.findOne({ booking: new mongoose.Types.ObjectId(bookingId) }).lean()
}

const createTemporaryBooking = async ({
  supplierId,
  driverId,
  carId,
  locationId,
  slot,
}: {
  supplierId: string
  driverId: string
  carId: string
  locationId: string
  slot: number
}) => {
  const from = new Date(Date.now() + (20 + slot * 4) * 24 * 60 * 60 * 1000)
  const to = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000)
  const sessionId = `r2-session-${runId}-${slot}`
  const checkout = await request('/api/checkout', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      booking: {
        supplier: supplierId,
        car: carId,
        driver: driverId,
        pickupLocation: locationId,
        dropOffLocation: locationId,
        from: from.toISOString(),
        to: to.toISOString(),
        status: 'pending',
        cancellation: false,
        amendments: false,
        theftProtection: false,
        collisionDamageWaiver: false,
        fullInsurance: false,
        additionalDriver: false,
        price: 0.01,
      },
      payLater: false,
      sessionId,
      payPal: false,
    }),
  })
  if (checkout.response.status !== 200 || !checkout.body?.bookingId) {
    throw new Error(`Temporary booking failed: HTTP ${checkout.response.status} ${JSON.stringify(checkout.body)}`)
  }
  return { bookingId: String(checkout.body.bookingId), sessionId }
}

const quote = async (bookingId: string, sessionId: string) => request(
  `/api/mercadopago/quote/${encodeURIComponent(bookingId)}/${encodeURIComponent(sessionId)}`,
)

const createPayment = async ({
  bookingId,
  sessionId,
  payerEmail,
  idempotencyKey,
  extraBody = {},
}: {
  bookingId: string
  sessionId: string
  payerEmail: string
  idempotencyKey?: string
  extraBody?: Record<string, unknown>
}) => request('/api/create-mercadopago-payment', {
  method: 'POST',
  headers: jsonHeaders(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
  body: JSON.stringify({
    bookingId,
    reservationSessionId: sessionId,
    token: 'r2-tokenized-provider-data',
    installments: 1,
    paymentMethodId: 'visa',
    payer: { email: payerEmail },
    ...extraBody,
  }),
})

const webhook = async (providerPaymentId: string, validSignature = true) => {
  const requestId = `r2-request-${crypto.randomUUID()}`
  const signed = signWebhook(providerPaymentId, requestId)
  return request(`/api/mercadopago/webhook?data.id=${encodeURIComponent(providerPaymentId)}&type=payment`, {
    method: 'POST',
    headers: jsonHeaders({
      'x-request-id': requestId,
      'x-signature': validSignature ? signed.signature : `ts=${signed.ts},v1=${'0'.repeat(64)}`,
    }),
    body: JSON.stringify({ type: 'payment', data: { id: providerPaymentId } }),
  })
}

let server: http.Server | undefined

try {
  await fs.mkdir(evidenceDir, { recursive: true })
  await mongoose.connect(dbUri)

  // Patch is in place before the app imports the Mercado Pago controller and
  // constructs its Payment instance. Only the external SDK boundary is replaced.
  const { default: app } = await import('../src/app')
  server = http.createServer(app)
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(4003, '127.0.0.1', () => resolve())
  })

  const [customer, admin, supplier] = await Promise.all([
    User.findOne({ email: customerEmail }),
    User.findOne({ email: adminEmail }),
    User.findOne({ email: supplierEmail }),
  ])
  if (!customer || !admin || !supplier) throw new Error('Seeded R2A identities missing')
  const car = await Car.findOne({ supplier: supplier._id }).sort({ name: 1 })
  const location = await Location.findOne({ supplier: supplier._id })
  if (!car || !location) throw new Error('Seeded R2A car/location missing')

  const customerSignin = await request('/api/sign-in/frontend', {
    method: 'POST',
    headers: jsonHeaders({ origin: 'http://localhost:3002' }),
    body: JSON.stringify({ email: customerEmail, password, mobile: false }),
  })
  const customerCookie = cookieFrom(customerSignin.response)
  if (customerSignin.response.status !== 200 || !customerCookie) throw new Error('Customer web auth failed')

  const adminSignin = await request('/api/sign-in/admin', {
    method: 'POST',
    headers: jsonHeaders({ origin: 'http://localhost:3001' }),
    body: JSON.stringify({ email: adminEmail, password, mobile: false }),
  })
  const adminCookie = cookieFrom(adminSignin.response)
  if (adminSignin.response.status !== 200 || !adminCookie) throw new Error('Admin web auth failed')
  record({ name: 'customer and admin web auth established', timestamp: new Date().toISOString(), observed: { customer: 200, admin: 200 } })

  const ids = {
    supplierId: supplier._id.toString(),
    driverId: customer._id.toString(),
    carId: car._id.toString(),
    locationId: location._id.toString(),
  }

  const primary = await createTemporaryBooking({ ...ids, slot: 1 })

  const wrongQuote = await quote(primary.bookingId, `${primary.sessionId}-wrong`)
  record({
    name: 'wrong reservation session cannot quote',
    timestamp: new Date().toISOString(),
    httpStatus: wrongQuote.response.status,
    expected: 404,
    observed: wrongQuote.response.status,
    ...(wrongQuote.response.status === 404 ? {} : { defect: 'R2-SESSION-QUOTE' }),
  })

  const primaryQuote = await quote(primary.bookingId, primary.sessionId)
  if (primaryQuote.response.status !== 200) throw new Error(`Authoritative quote failed: ${primaryQuote.response.status}`)
  const quoteAmount = Number(primaryQuote.body?.amount)
  const quoteCurrency = String(primaryQuote.body?.currency || '')
  const awaiting = await waitReservation(primary.bookingId, ReservationStatus.AwaitingPayment)
  record({
    name: 'authoritative quote moves reservation to awaiting_payment',
    timestamp: new Date().toISOString(),
    httpStatus: primaryQuote.response.status,
    observed: { amount: quoteAmount, currency: quoteCurrency, reservation: awaiting?.status },
    expected: { currency: 'PEN', reservation: 'awaiting_payment' },
    ...((quoteCurrency === 'PEN' && awaiting?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2-QUOTE-AUTHORITY' }),
  })

  const missingKey = await createPayment({
    bookingId: primary.bookingId,
    sessionId: primary.sessionId,
    payerEmail: customerEmail,
  })
  record({
    name: 'missing idempotency key rejected',
    timestamp: new Date().toISOString(),
    httpStatus: missingKey.response.status,
    expected: 400,
    observed: missingKey.response.status,
    ...(missingKey.response.status === 400 ? {} : { defect: 'R2-IDEMPOTENCY-REQUIRED' }),
  })

  const mismatchPayer = await createPayment({
    bookingId: primary.bookingId,
    sessionId: primary.sessionId,
    payerEmail: 'other@example.test',
    idempotencyKey: `r2-payer-${runId}`,
  })
  record({
    name: 'payer identity mismatch rejected',
    timestamp: new Date().toISOString(),
    httpStatus: mismatchPayer.response.status,
    expected: 400,
    observed: mismatchPayer.response.status,
    ...(mismatchPayer.response.status === 400 ? {} : { defect: 'R2-PAYER-BINDING' }),
  })

  const wrongSessionCreate = await createPayment({
    bookingId: primary.bookingId,
    sessionId: `${primary.sessionId}-wrong`,
    payerEmail: customerEmail,
    idempotencyKey: `r2-wrong-session-${runId}`,
  })
  record({
    name: 'wrong reservation session cannot create provider payment',
    timestamp: new Date().toISOString(),
    httpStatus: wrongSessionCreate.response.status,
    expected: 404,
    observed: wrongSessionCreate.response.status,
    ...(wrongSessionCreate.response.status === 404 ? {} : { defect: 'R2-SESSION-CREATE' }),
  })

  const firstKey = `r2-primary-${runId}`
  const firstPayment = await createPayment({
    bookingId: primary.bookingId,
    sessionId: primary.sessionId,
    payerEmail: customerEmail,
    idempotencyKey: firstKey,
    extraBody: { amount: 0.01, currency: 'USD' },
  })
  if (firstPayment.response.status !== 201 || !firstPayment.body?.id) {
    throw new Error(`Primary provider-simulated payment failed: ${firstPayment.response.status}`)
  }
  const primaryProviderId = String(firstPayment.body.id)
  const firstProviderCall = providerCreateCalls.find((call) => call.id === primaryProviderId)
  const primaryTransaction = await PaymentTransaction.findOne({ providerPaymentId: primaryProviderId }).lean()
  const pendingReservation = await waitReservation(primary.bookingId, ReservationStatus.AwaitingPayment)
  record({
    name: 'browser amount/currency ignored; server owns provider charge',
    timestamp: new Date().toISOString(),
    httpStatus: firstPayment.response.status,
    expected: { transaction_amount: quoteAmount, external_reference: primary.bookingId, payment: 'pending', reservation: 'awaiting_payment' },
    observed: {
      transaction_amount: firstProviderCall?.body?.transaction_amount,
      external_reference: firstProviderCall?.body?.external_reference,
      payment: primaryTransaction?.status,
      reservation: pendingReservation?.status,
    },
    ...((Number(firstProviderCall?.body?.transaction_amount) === quoteAmount
      && firstProviderCall?.body?.external_reference === primary.bookingId
      && primaryTransaction?.status === PaymentStatus.Pending
      && pendingReservation?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2-SERVER-PRICE-AUTHORITY' }),
  })

  const createCountBeforeReplay = providerCreateCalls.length
  const sameKeyReplay = await createPayment({
    bookingId: primary.bookingId,
    sessionId: primary.sessionId,
    payerEmail: customerEmail,
    idempotencyKey: firstKey,
  })
  record({
    name: 'same idempotency key reuses provider payment',
    timestamp: new Date().toISOString(),
    httpStatus: sameKeyReplay.response.status,
    expected: { providerCreatesDelta: 0, idempotentReplay: true, providerPaymentId: primaryProviderId },
    observed: {
      providerCreatesDelta: providerCreateCalls.length - createCountBeforeReplay,
      idempotentReplay: sameKeyReplay.body?.idempotentReplay,
      providerPaymentId: sameKeyReplay.body?.id,
    },
    ...((providerCreateCalls.length === createCountBeforeReplay
      && sameKeyReplay.body?.idempotentReplay === true
      && String(sameKeyReplay.body?.id) === primaryProviderId) ? {} : { defect: 'R2-SAME-KEY-REPLAY' }),
  })

  const customerReconcile = await request(`/api/mercadopago/reconcile/${encodeURIComponent(primaryProviderId)}`, {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3002',
      cookie: customerCookie,
    },
  })
  record({
    name: 'customer must not access payment reconciliation',
    timestamp: new Date().toISOString(),
    httpStatus: customerReconcile.response.status,
    expected: '401/403',
    observed: customerReconcile.response.status,
    ...(customerReconcile.response.status === 401 || customerReconcile.response.status === 403
      ? {}
      : { defect: 'R2-RECONCILE-AUTHZ' }),
  })

  const createCountBeforeSecondKey = providerCreateCalls.length
  const secondKeyPayment = await createPayment({
    bookingId: primary.bookingId,
    sessionId: primary.sessionId,
    payerEmail: customerEmail,
    idempotencyKey: `r2-primary-second-key-${runId}`,
  })
  const duplicateActivePaymentCreated = providerCreateCalls.length > createCountBeforeSecondKey
  record({
    name: 'different key cannot create a second active payment for same reservation',
    timestamp: new Date().toISOString(),
    httpStatus: secondKeyPayment.response.status,
    expected: { providerCreatesDelta: 0 },
    observed: {
      providerCreatesDelta: providerCreateCalls.length - createCountBeforeSecondKey,
      status: secondKeyPayment.response.status,
      providerPaymentId: secondKeyPayment.body?.id,
    },
    ...(duplicateActivePaymentCreated ? { defect: 'R2-DUPLICATE-ACTIVE-PAYMENT' } : {}),
  })

  const getCallsBeforeBadSignature = providerGetCalls.length
  const invalidWebhook = await webhook(primaryProviderId, false)
  record({
    name: 'tampered webhook rejected before provider read',
    timestamp: new Date().toISOString(),
    httpStatus: invalidWebhook.response.status,
    expected: { status: 401, providerReadsDelta: 0 },
    observed: { status: invalidWebhook.response.status, providerReadsDelta: providerGetCalls.length - getCallsBeforeBadSignature },
    ...((invalidWebhook.response.status === 401 && providerGetCalls.length === getCallsBeforeBadSignature)
      ? {}
      : { defect: 'R2-WEBHOOK-SIGNATURE' }),
  })

  const pendingWebhook = await webhook(primaryProviderId, true)
  const stillAwaiting = await waitReservation(primary.bookingId, ReservationStatus.AwaitingPayment)
  record({
    name: 'valid pending webhook does not confirm reservation',
    timestamp: new Date().toISOString(),
    httpStatus: pendingWebhook.response.status,
    expected: { status: 200, reservation: 'awaiting_payment' },
    observed: { status: pendingWebhook.response.status, reservation: stillAwaiting?.status },
    ...((pendingWebhook.response.status === 200 && stillAwaiting?.status === ReservationStatus.AwaitingPayment)
      ? {}
      : { defect: 'R2-PENDING-NOT-CONFIRMED' }),
  })

  const primaryProvider = providerStore.get(primaryProviderId)!
  primaryProvider.status = 'approved'
  primaryProvider.status_detail = 'accredited'
  const approvedWebhook = await webhook(primaryProviderId, true)
  const confirmedReservation = await waitReservation(primary.bookingId, ReservationStatus.Confirmed)
  const approvedTransaction = await PaymentTransaction.findOne({ providerPaymentId: primaryProviderId }).lean()
  const paidBooking = await Booking.findById(primary.bookingId).lean()
  record({
    name: 'provider-approved truth confirms reservation',
    timestamp: new Date().toISOString(),
    httpStatus: approvedWebhook.response.status,
    expected: { payment: 'approved', reservation: 'confirmed', bookingStatus: 'paid' },
    observed: {
      payment: approvedTransaction?.status,
      reservation: confirmedReservation?.status,
      bookingStatus: paidBooking?.status,
    },
    ...((approvedTransaction?.status === PaymentStatus.Approved
      && confirmedReservation?.status === ReservationStatus.Confirmed
      && paidBooking?.status === 'paid') ? {} : { defect: 'R2-APPROVAL-CONFIRMATION' }),
  })

  const emailCountBeforeReplay = await TransactionalEmailDelivery.countDocuments({
    booking: new mongoose.Types.ObjectId(primary.bookingId),
    event: { $in: [TransactionalEmailEvent.PaymentApproved, TransactionalEmailEvent.ReservationConfirmed] },
  })
  const approvalReplay = await webhook(primaryProviderId, true)
  await new Promise((resolve) => setTimeout(resolve, 200))
  const emailCountAfterReplay = await TransactionalEmailDelivery.countDocuments({
    booking: new mongoose.Types.ObjectId(primary.bookingId),
    event: { $in: [TransactionalEmailEvent.PaymentApproved, TransactionalEmailEvent.ReservationConfirmed] },
  })
  record({
    name: 'approved webhook replay is idempotent for confirmation email ledger',
    timestamp: new Date().toISOString(),
    httpStatus: approvalReplay.response.status,
    expected: { logicalEmailEvents: 2, replayDelta: 0 },
    observed: { logicalEmailEvents: emailCountAfterReplay, replayDelta: emailCountAfterReplay - emailCountBeforeReplay },
    ...((emailCountAfterReplay === 2 && emailCountAfterReplay === emailCountBeforeReplay) ? {} : { defect: 'R2-WEBHOOK-REPLAY' }),
  })

  const mismatch = await createTemporaryBooking({ ...ids, slot: 2 })
  const mismatchQuote = await quote(mismatch.bookingId, mismatch.sessionId)
  if (mismatchQuote.response.status !== 200) throw new Error('Mismatch fixture quote failed')
  const mismatchPayment = await createPayment({
    bookingId: mismatch.bookingId,
    sessionId: mismatch.sessionId,
    payerEmail: customerEmail,
    idempotencyKey: `r2-amount-${runId}`,
  })
  const mismatchId = String(mismatchPayment.body?.id || '')
  providerStore.get(mismatchId)!.transaction_amount = Number(mismatchQuote.body.amount) + 10
  const amountMismatchReconcile = await request(`/api/mercadopago/reconcile/${encodeURIComponent(mismatchId)}`, {
    method: 'POST',
    headers: { origin: 'http://localhost:3001', cookie: adminCookie },
  })
  const mismatchReservation = await waitReservation(mismatch.bookingId, ReservationStatus.AwaitingPayment)
  record({
    name: 'provider amount mismatch fails closed',
    timestamp: new Date().toISOString(),
    httpStatus: amountMismatchReconcile.response.status,
    expected: { status: 400, reservation: 'awaiting_payment' },
    observed: { status: amountMismatchReconcile.response.status, reservation: mismatchReservation?.status },
    ...((amountMismatchReconcile.response.status === 400 && mismatchReservation?.status === ReservationStatus.AwaitingPayment)
      ? {}
      : { defect: 'R2-AMOUNT-MISMATCH' }),
  })

  const currencyCase = await createTemporaryBooking({ ...ids, slot: 3 })
  const currencyQuote = await quote(currencyCase.bookingId, currencyCase.sessionId)
  if (currencyQuote.response.status !== 200) throw new Error('Currency fixture quote failed')
  const currencyPayment = await createPayment({
    bookingId: currencyCase.bookingId,
    sessionId: currencyCase.sessionId,
    payerEmail: customerEmail,
    idempotencyKey: `r2-currency-${runId}`,
  })
  const currencyId = String(currencyPayment.body?.id || '')
  providerStore.get(currencyId)!.currency_id = 'USD'
  const currencyMismatchReconcile = await request(`/api/mercadopago/reconcile/${encodeURIComponent(currencyId)}`, {
    method: 'POST',
    headers: { origin: 'http://localhost:3001', cookie: adminCookie },
  })
  const currencyReservation = await waitReservation(currencyCase.bookingId, ReservationStatus.AwaitingPayment)
  record({
    name: 'provider currency mismatch fails closed',
    timestamp: new Date().toISOString(),
    httpStatus: currencyMismatchReconcile.response.status,
    expected: { status: 400, reservation: 'awaiting_payment' },
    observed: { status: currencyMismatchReconcile.response.status, reservation: currencyReservation?.status },
    ...((currencyMismatchReconcile.response.status === 400 && currencyReservation?.status === ReservationStatus.AwaitingPayment)
      ? {}
      : { defect: 'R2-CURRENCY-MISMATCH' }),
  })

  const rejectedCase = await createTemporaryBooking({ ...ids, slot: 4 })
  await quote(rejectedCase.bookingId, rejectedCase.sessionId)
  const rejectedCreate = await createPayment({
    bookingId: rejectedCase.bookingId,
    sessionId: rejectedCase.sessionId,
    payerEmail: customerEmail,
    idempotencyKey: `r2-rejected-${runId}`,
  })
  const rejectedId = String(rejectedCreate.body?.id || '')
  providerStore.get(rejectedId)!.status = 'rejected'
  const rejectedWebhook = await webhook(rejectedId, true)
  const rejectedTransaction = await PaymentTransaction.findOne({ providerPaymentId: rejectedId }).lean()
  const rejectedReservation = await waitReservation(rejectedCase.bookingId, ReservationStatus.AwaitingPayment)
  record({
    name: 'rejected provider truth remains unconfirmed',
    timestamp: new Date().toISOString(),
    httpStatus: rejectedWebhook.response.status,
    expected: { payment: 'rejected', reservation: 'awaiting_payment' },
    observed: { payment: rejectedTransaction?.status, reservation: rejectedReservation?.status },
    ...((rejectedTransaction?.status === PaymentStatus.Rejected && rejectedReservation?.status === ReservationStatus.AwaitingPayment)
      ? {}
      : { defect: 'R2-REJECTED-SEMANTICS' }),
  })

  primaryProvider.status = 'refunded'
  primaryProvider.status_detail = 'refunded'
  const refundWebhook = await webhook(primaryProviderId, true)
  const refundedTransaction = await PaymentTransaction.findOne({ providerPaymentId: primaryProviderId }).lean()
  const stillConfirmed = await waitReservation(primary.bookingId, ReservationStatus.Confirmed)
  record({
    name: 'refunded provider truth maps payment state explicitly',
    timestamp: new Date().toISOString(),
    httpStatus: refundWebhook.response.status,
    expected: { payment: 'refunded', reservation: 'confirmed' },
    observed: { payment: refundedTransaction?.status, reservation: stillConfirmed?.status },
    ...((refundedTransaction?.status === PaymentStatus.Refunded && stillConfirmed?.status === ReservationStatus.Confirmed)
      ? {}
      : { defect: 'R2-REFUND-SEMANTICS' }),
  })

  evidence.result = evidence.defects.length === 0 ? 'passed' : 'failed'
  evidence.completedAt = new Date().toISOString()
  if (evidence.defects.length > 0) {
    evidence.failure = `Reproduced defects: ${evidence.defects.join(', ')}`
    process.exitCode = 1
  }
} catch (error) {
  evidence.result = 'failed'
  evidence.completedAt = new Date().toISOString()
  evidence.failure = error instanceof Error ? error.stack || error.message : String(error)
  console.error('[R2A] HARNESS FAILURE', error)
  process.exitCode = 1
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  ;(Payment.prototype as any).create = originalCreate
  ;(Payment.prototype as any).get = originalGet
  await fs.mkdir(evidenceDir, { recursive: true })
  await fs.writeFile(path.join(evidenceDir, 'mitos-r2a-runtime.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await mongoose.disconnect().catch(() => undefined)
  console.log(`[R2A] RESULT=${evidence.result} defects=${evidence.defects.join(',') || 'none'}`)
}
