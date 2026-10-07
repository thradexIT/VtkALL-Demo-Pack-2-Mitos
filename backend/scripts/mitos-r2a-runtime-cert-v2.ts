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
  throw new Error('R2A v2 runtime fixture environment is incomplete')
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

type Step = {
  name: string
  timestamp: string
  httpStatus?: number
  expected?: unknown
  observed?: unknown
  defect?: string
}

const evidence = {
  runId,
  startedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || 'cert/mitos-r2-mercado-pago-runtime',
  commit: process.env.GITHUB_SHA || 'local',
  providerMode: 'simulated-sdk-boundary-v2',
  steps: [] as Step[],
  defects: [] as string[],
  result: 'running' as 'running' | 'passed' | 'failed',
  completedAt: '',
  failure: '',
}

const record = (step: Step) => {
  evidence.steps.push(step)
  if (step.defect) evidence.defects.push(step.defect)
  console.log(`[R2A-v2] ${step.name}${step.httpStatus ? ` HTTP=${step.httpStatus}` : ''}${step.defect ? ` DEFECT=${step.defect}` : ''}`)
}

const providerStore = new Map<string, ProviderPayment>()
const providerCreateCalls: Array<{ id: string; idempotencyKey: string; body: any }> = []
const providerGetCalls: string[] = []
let providerSequence = 0

const originalCreate = (Payment.prototype as any).create
const originalGet = (Payment.prototype as any).get

;(Payment.prototype as any).create = async ({ body, requestOptions }: any) => {
  const id = `r2-provider-${runId}-${++providerSequence}`
  const item: ProviderPayment = {
    id,
    status: 'pending',
    status_detail: 'pending_waiting_payment',
    external_reference: String(body.external_reference || ''),
    transaction_amount: Number(body.transaction_amount),
    currency_id: 'PEN',
    payment_method_id: String(body.payment_method_id || ''),
  }
  providerStore.set(id, item)
  providerCreateCalls.push({ id, idempotencyKey: String(requestOptions?.idempotencyKey || ''), body: structuredClone(body) })
  return structuredClone(item)
}

;(Payment.prototype as any).get = async ({ id }: any) => {
  const key = String(id)
  providerGetCalls.push(key)
  const item = providerStore.get(key)
  if (!item) throw new Error(`Simulated provider payment ${key} not found`)
  return structuredClone(item)
}

const httpRequest = async (pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBase}${pathname}`, init)
  const text = await response.text()
  let body: any = text
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }
  return { response, body }
}

const jsonHeaders = (extra: Record<string, string> = {}) => ({ 'content-type': 'application/json', ...extra })
const tokenHeaders = (token: string, json = false) => ({ 'x-access-token': token, ...(json ? { 'content-type': 'application/json' } : {}) })

const signinMobile = async (surface: 'frontend' | 'admin', email: string) => {
  const result = await httpRequest(`/api/sign-in/${surface}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password, mobile: true }),
  })
  if (result.response.status !== 200 || !result.body?.accessToken) {
    throw new Error(`${surface} mobile signin failed: HTTP ${result.response.status}`)
  }
  return String(result.body.accessToken)
}

const waitReservation = async (bookingId: string, desired: ReservationStatus, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await ReservationState.findOne({ booking: new mongoose.Types.ObjectId(bookingId) }).lean()
    if (state?.status === desired) return state
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return ReservationState.findOne({ booking: new mongoose.Types.ObjectId(bookingId) }).lean()
}

const signWebhook = (dataId: string, requestId: string) => {
  const ts = String(Math.floor(Date.now() / 1000))
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

const sendWebhook = async (providerPaymentId: string, valid = true) => {
  const requestId = `r2-${crypto.randomUUID()}`
  const signature = signWebhook(providerPaymentId, requestId)
  return httpRequest(`/api/mercadopago/webhook?data.id=${encodeURIComponent(providerPaymentId)}&type=payment`, {
    method: 'POST',
    headers: jsonHeaders({
      'x-request-id': requestId,
      'x-signature': valid ? signature : signature.replace(/v1=.*/, `v1=${'0'.repeat(64)}`),
    }),
    body: JSON.stringify({ type: 'payment', data: { id: providerPaymentId } }),
  })
}

const createTemporaryBooking = async (
  ids: { supplierId: string; driverId: string; carId: string; locationId: string },
  slot: number,
) => {
  const from = new Date(Date.now() + (30 + slot * 4) * 86400000)
  const to = new Date(from.getTime() + 2 * 86400000)
  const sessionId = `r2-session-${runId}-${slot}`
  const result = await httpRequest('/api/checkout', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      booking: {
        supplier: ids.supplierId,
        car: ids.carId,
        driver: ids.driverId,
        pickupLocation: ids.locationId,
        dropOffLocation: ids.locationId,
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
  if (result.response.status !== 200 || !result.body?.bookingId) {
    throw new Error(`Temporary booking ${slot} failed: ${result.response.status}`)
  }
  return { bookingId: String(result.body.bookingId), sessionId }
}

const quote = (bookingId: string, sessionId: string) => httpRequest(
  `/api/mercadopago/quote/${encodeURIComponent(bookingId)}/${encodeURIComponent(sessionId)}`,
)

const pay = (
  bookingId: string,
  sessionId: string,
  payerEmail: string,
  idempotencyKey?: string,
  extra: Record<string, unknown> = {},
) => httpRequest('/api/create-mercadopago-payment', {
  method: 'POST',
  headers: jsonHeaders(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
  body: JSON.stringify({
    bookingId,
    reservationSessionId: sessionId,
    token: 'tokenized-test-data',
    installments: 1,
    paymentMethodId: 'visa',
    payer: { email: payerEmail },
    ...extra,
  }),
})

let server: http.Server | undefined

try {
  await fs.mkdir(evidenceDir, { recursive: true })
  await mongoose.connect(dbUri)
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
  if (!customer || !admin || !supplier) throw new Error('R2A identities missing')
  const car = await Car.findOne({ supplier: supplier._id }).sort({ name: 1 })
  const location = await Location.findOne({ supplier: supplier._id })
  if (!car || !location) throw new Error('R2A vehicle/location missing')

  const customerToken = await signinMobile('frontend', customerEmail)
  const adminToken = await signinMobile('admin', adminEmail)
  record({ name: 'ephemeral customer/admin tokens established', timestamp: new Date().toISOString(), observed: { customer: 200, admin: 200 } })

  const ids = {
    supplierId: supplier._id.toString(),
    driverId: customer._id.toString(),
    carId: car._id.toString(),
    locationId: location._id.toString(),
  }

  const primary = await createTemporaryBooking(ids, 1)
  const wrongQuote = await quote(primary.bookingId, `${primary.sessionId}-wrong`)
  record({ name: 'wrong session quote rejected', timestamp: new Date().toISOString(), httpStatus: wrongQuote.response.status, expected: 404, observed: wrongQuote.response.status, ...(wrongQuote.response.status === 404 ? {} : { defect: 'R2-SESSION-QUOTE' }) })

  const primaryQuote = await quote(primary.bookingId, primary.sessionId)
  if (primaryQuote.response.status !== 200) throw new Error('Primary authoritative quote failed')
  const amount = Number(primaryQuote.body.amount)
  const currency = String(primaryQuote.body.currency)
  const awaiting = await waitReservation(primary.bookingId, ReservationStatus.AwaitingPayment)
  record({ name: 'quote is server-owned and awaiting_payment', timestamp: new Date().toISOString(), httpStatus: 200, expected: { currency: 'PEN', reservation: 'awaiting_payment' }, observed: { amount, currency, reservation: awaiting?.status }, ...((currency === 'PEN' && awaiting?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2-QUOTE-AUTHORITY' }) })

  const noKey = await pay(primary.bookingId, primary.sessionId, customerEmail)
  record({ name: 'idempotency key required', timestamp: new Date().toISOString(), httpStatus: noKey.response.status, expected: 400, observed: noKey.response.status, ...(noKey.response.status === 400 ? {} : { defect: 'R2-IDEMPOTENCY-REQUIRED' }) })

  const wrongPayer = await pay(primary.bookingId, primary.sessionId, 'other@example.test', `r2-payer-${runId}`)
  record({ name: 'payer binding enforced', timestamp: new Date().toISOString(), httpStatus: wrongPayer.response.status, expected: 400, observed: wrongPayer.response.status, ...(wrongPayer.response.status === 400 ? {} : { defect: 'R2-PAYER-BINDING' }) })

  const wrongSessionPay = await pay(primary.bookingId, `${primary.sessionId}-wrong`, customerEmail, `r2-session-bad-${runId}`)
  record({ name: 'wrong session payment rejected', timestamp: new Date().toISOString(), httpStatus: wrongSessionPay.response.status, expected: 404, observed: wrongSessionPay.response.status, ...(wrongSessionPay.response.status === 404 ? {} : { defect: 'R2-SESSION-CREATE' }) })

  const primaryKey = `r2-primary-${runId}`
  const created = await pay(primary.bookingId, primary.sessionId, customerEmail, primaryKey, { amount: 0.01, currency: 'USD' })
  if (created.response.status !== 201 || !created.body?.id) throw new Error('Primary simulated payment creation failed')
  const providerId = String(created.body.id)
  const providerCall = providerCreateCalls.find((item) => item.id === providerId)
  const pendingTx = await PaymentTransaction.findOne({ providerPaymentId: providerId }).lean()
  record({ name: 'client amount/currency cannot override server charge', timestamp: new Date().toISOString(), httpStatus: 201, expected: { amount, externalReference: primary.bookingId, payment: 'pending' }, observed: { amount: providerCall?.body.transaction_amount, externalReference: providerCall?.body.external_reference, payment: pendingTx?.status }, ...((providerCall?.body.transaction_amount === amount && providerCall?.body.external_reference === primary.bookingId && pendingTx?.status === PaymentStatus.Pending) ? {} : { defect: 'R2-SERVER-PRICE-AUTHORITY' }) })

  const beforeSameKey = providerCreateCalls.length
  const sameKey = await pay(primary.bookingId, primary.sessionId, customerEmail, primaryKey)
  record({ name: 'same key replay does not create provider payment', timestamp: new Date().toISOString(), httpStatus: sameKey.response.status, expected: { createDelta: 0, replay: true }, observed: { createDelta: providerCreateCalls.length - beforeSameKey, replay: sameKey.body?.idempotentReplay }, ...((providerCreateCalls.length === beforeSameKey && sameKey.body?.idempotentReplay === true) ? {} : { defect: 'R2-SAME-KEY-REPLAY' }) })

  const customerReconcile = await httpRequest(`/api/mercadopago/reconcile/${encodeURIComponent(providerId)}`, {
    method: 'POST',
    headers: tokenHeaders(customerToken),
  })
  record({ name: 'customer token cannot reconcile provider payment', timestamp: new Date().toISOString(), httpStatus: customerReconcile.response.status, expected: '401/403', observed: customerReconcile.response.status, ...((customerReconcile.response.status === 401 || customerReconcile.response.status === 403) ? {} : { defect: 'R2-RECONCILE-AUTHZ' }) })

  const beforeDifferentKey = providerCreateCalls.length
  const differentKey = await pay(primary.bookingId, primary.sessionId, customerEmail, `r2-primary-different-${runId}`)
  record({ name: 'different key cannot duplicate active payment for booking', timestamp: new Date().toISOString(), httpStatus: differentKey.response.status, expected: { createDelta: 0 }, observed: { createDelta: providerCreateCalls.length - beforeDifferentKey, providerPaymentId: differentKey.body?.id }, ...(providerCreateCalls.length === beforeDifferentKey ? {} : { defect: 'R2-DUPLICATE-ACTIVE-PAYMENT' }) })

  const readsBeforeTamper = providerGetCalls.length
  const tampered = await sendWebhook(providerId, false)
  record({ name: 'tampered webhook rejected before provider read', timestamp: new Date().toISOString(), httpStatus: tampered.response.status, expected: { status: 401, readDelta: 0 }, observed: { status: tampered.response.status, readDelta: providerGetCalls.length - readsBeforeTamper }, ...((tampered.response.status === 401 && providerGetCalls.length === readsBeforeTamper) ? {} : { defect: 'R2-WEBHOOK-SIGNATURE' }) })

  const pendingWebhook = await sendWebhook(providerId, true)
  const stillAwaiting = await waitReservation(primary.bookingId, ReservationStatus.AwaitingPayment)
  record({ name: 'pending provider truth does not confirm reservation', timestamp: new Date().toISOString(), httpStatus: pendingWebhook.response.status, expected: 'awaiting_payment', observed: stillAwaiting?.status, ...((pendingWebhook.response.status === 200 && stillAwaiting?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2-PENDING-NOT-CONFIRMED' }) })

  providerStore.get(providerId)!.status = 'approved'
  providerStore.get(providerId)!.status_detail = 'accredited'
  const approved = await sendWebhook(providerId, true)
  const confirmed = await waitReservation(primary.bookingId, ReservationStatus.Confirmed)
  const approvedTx = await PaymentTransaction.findOne({ providerPaymentId: providerId }).lean()
  const booking = await Booking.findById(primary.bookingId).lean()
  record({ name: 'provider-approved truth confirms reservation', timestamp: new Date().toISOString(), httpStatus: approved.response.status, expected: { payment: 'approved', reservation: 'confirmed', booking: 'paid' }, observed: { payment: approvedTx?.status, reservation: confirmed?.status, booking: booking?.status }, ...((approvedTx?.status === PaymentStatus.Approved && confirmed?.status === ReservationStatus.Confirmed && booking?.status === 'paid') ? {} : { defect: 'R2-APPROVAL-CONFIRMATION' }) })

  await new Promise((resolve) => setTimeout(resolve, 200))
  const logicalEmailsBefore = await TransactionalEmailDelivery.countDocuments({ booking: new mongoose.Types.ObjectId(primary.bookingId), event: { $in: [TransactionalEmailEvent.PaymentApproved, TransactionalEmailEvent.ReservationConfirmed] } })
  const replay = await sendWebhook(providerId, true)
  await new Promise((resolve) => setTimeout(resolve, 200))
  const logicalEmailsAfter = await TransactionalEmailDelivery.countDocuments({ booking: new mongoose.Types.ObjectId(primary.bookingId), event: { $in: [TransactionalEmailEvent.PaymentApproved, TransactionalEmailEvent.ReservationConfirmed] } })
  record({ name: 'approved webhook replay keeps one logical event of each type', timestamp: new Date().toISOString(), httpStatus: replay.response.status, expected: { logicalEvents: 2, delta: 0 }, observed: { logicalEvents: logicalEmailsAfter, delta: logicalEmailsAfter - logicalEmailsBefore }, ...((logicalEmailsAfter === 2 && logicalEmailsAfter === logicalEmailsBefore) ? {} : { defect: 'R2-WEBHOOK-REPLAY' }) })

  const amountCase = await createTemporaryBooking(ids, 2)
  const amountQuote = await quote(amountCase.bookingId, amountCase.sessionId)
  const amountCreate = await pay(amountCase.bookingId, amountCase.sessionId, customerEmail, `r2-amount-${runId}`)
  const amountProviderId = String(amountCreate.body?.id || '')
  providerStore.get(amountProviderId)!.transaction_amount = Number(amountQuote.body.amount) + 10
  const amountReconcile = await httpRequest(`/api/mercadopago/reconcile/${encodeURIComponent(amountProviderId)}`, { method: 'POST', headers: tokenHeaders(adminToken) })
  const amountReservation = await waitReservation(amountCase.bookingId, ReservationStatus.AwaitingPayment)
  record({ name: 'amount mismatch fails closed', timestamp: new Date().toISOString(), httpStatus: amountReconcile.response.status, expected: { status: 400, reservation: 'awaiting_payment' }, observed: { status: amountReconcile.response.status, reservation: amountReservation?.status }, ...((amountReconcile.response.status === 400 && amountReservation?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2-AMOUNT-MISMATCH' }) })

  const currencyCase = await createTemporaryBooking(ids, 3)
  await quote(currencyCase.bookingId, currencyCase.sessionId)
  const currencyCreate = await pay(currencyCase.bookingId, currencyCase.sessionId, customerEmail, `r2-currency-${runId}`)
  const currencyProviderId = String(currencyCreate.body?.id || '')
  providerStore.get(currencyProviderId)!.currency_id = 'USD'
  const currencyReconcile = await httpRequest(`/api/mercadopago/reconcile/${encodeURIComponent(currencyProviderId)}`, { method: 'POST', headers: tokenHeaders(adminToken) })
  const currencyReservation = await waitReservation(currencyCase.bookingId, ReservationStatus.AwaitingPayment)
  record({ name: 'currency mismatch fails closed', timestamp: new Date().toISOString(), httpStatus: currencyReconcile.response.status, expected: { status: 400, reservation: 'awaiting_payment' }, observed: { status: currencyReconcile.response.status, reservation: currencyReservation?.status }, ...((currencyReconcile.response.status === 400 && currencyReservation?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2-CURRENCY-MISMATCH' }) })

  const rejectedCase = await createTemporaryBooking(ids, 4)
  await quote(rejectedCase.bookingId, rejectedCase.sessionId)
  const rejectedCreate = await pay(rejectedCase.bookingId, rejectedCase.sessionId, customerEmail, `r2-rejected-${runId}`)
  const rejectedId = String(rejectedCreate.body?.id || '')
  providerStore.get(rejectedId)!.status = 'rejected'
  await sendWebhook(rejectedId, true)
  const rejectedTx = await PaymentTransaction.findOne({ providerPaymentId: rejectedId }).lean()
  const rejectedReservation = await waitReservation(rejectedCase.bookingId, ReservationStatus.AwaitingPayment)
  record({ name: 'rejected provider truth stays unconfirmed', timestamp: new Date().toISOString(), expected: { payment: 'rejected', reservation: 'awaiting_payment' }, observed: { payment: rejectedTx?.status, reservation: rejectedReservation?.status }, ...((rejectedTx?.status === PaymentStatus.Rejected && rejectedReservation?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2-REJECTED-SEMANTICS' }) })

  providerStore.get(providerId)!.status = 'refunded'
  await sendWebhook(providerId, true)
  const refundedTx = await PaymentTransaction.findOne({ providerPaymentId: providerId }).lean()
  const refundedReservation = await waitReservation(primary.bookingId, ReservationStatus.Confirmed)
  record({ name: 'refunded truth maps explicit payment state', timestamp: new Date().toISOString(), expected: { payment: 'refunded', reservation: 'confirmed' }, observed: { payment: refundedTx?.status, reservation: refundedReservation?.status }, ...((refundedTx?.status === PaymentStatus.Refunded && refundedReservation?.status === ReservationStatus.Confirmed) ? {} : { defect: 'R2-REFUND-SEMANTICS' }) })

  evidence.result = evidence.defects.length === 0 ? 'passed' : 'failed'
  evidence.completedAt = new Date().toISOString()
  if (evidence.defects.length) {
    evidence.failure = `Reproduced product defects: ${evidence.defects.join(', ')}`
    process.exitCode = 1
  }
} catch (error) {
  evidence.result = 'failed'
  evidence.completedAt = new Date().toISOString()
  evidence.failure = error instanceof Error ? error.stack || error.message : String(error)
  console.error('[R2A-v2] HARNESS FAILURE', error)
  process.exitCode = 1
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  ;(Payment.prototype as any).create = originalCreate
  ;(Payment.prototype as any).get = originalGet
  await fs.mkdir(evidenceDir, { recursive: true })
  await fs.writeFile(path.join(evidenceDir, 'mitos-r2a-runtime-v2.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await mongoose.disconnect().catch(() => undefined)
  console.log(`[R2A-v2] RESULT=${evidence.result} defects=${evidence.defects.join(',') || 'none'}`)
}
