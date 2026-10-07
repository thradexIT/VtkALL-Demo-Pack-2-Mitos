import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import mongoose from 'mongoose'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import Booking from '../src/models/Booking'
import Car from '../src/models/Car'
import Location from '../src/models/Location'
import PaymentTransaction from '../src/models/PaymentTransaction'
import ReservationState, { ReservationStatus } from '../src/models/ReservationState'
import User from '../src/models/User'

const apiBase = 'http://127.0.0.1:4004'
const dbUri = String(process.env.BC_DB_URI || '')
const runId = String(process.env.GITHUB_RUN_ID || `local-${Date.now()}`)
const evidenceDir = String(process.env.R2B_EVIDENCE_DIR || path.resolve(process.cwd(), '../r2b-evidence'))
const customerEmail = String(process.env.MITOS_DEMO_CUSTOMER_EMAIL || '')
const adminEmail = String(process.env.MITOS_DEMO_ADMIN_EMAIL || '')
const supplierEmail = String(process.env.MITOS_DEMO_SUPPLIER_EMAIL || '')
const password = String(process.env.MITOS_DEMO_PASSWORD || '')
const accessToken = String(process.env.BC_MERCADO_PAGO_ACCESS_TOKEN || '')
const publicKey = String(process.env.MITOS_MP_TEST_PUBLIC_KEY || '')
const paymentMethodId = String(process.env.MITOS_MP_TEST_PAYMENT_METHOD_ID || 'visa')
const expectedStatus = String(process.env.MITOS_MP_EXPECTED_STATUS || 'approved').toLowerCase()

const allowedExpected = new Set(['approved', 'pending', 'rejected'])
if (!dbUri || !customerEmail || !adminEmail || !supplierEmail || !password) {
  throw new Error('R2B isolated fixture environment is incomplete')
}
if (!accessToken || !publicKey) {
  throw new Error('R2B requires Mercado Pago TEST Public Key and TEST Access Token via environment secrets')
}
if (!publicKey.startsWith('TEST-')) {
  throw new Error('R2B refuses a Public Key that is not explicitly TEST-scoped')
}
if (!allowedExpected.has(expectedStatus)) {
  throw new Error(`Unsupported MITOS_MP_EXPECTED_STATUS=${expectedStatus}`)
}

type EvidenceStep = {
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
  branch: process.env.GITHUB_REF_NAME || 'cert/mitos-r2b-mercado-pago-sandbox',
  commit: process.env.GITHUB_SHA || 'local',
  providerMode: 'real-mercado-pago-test-provider',
  tokenizationMode: 'mercado-pago-card-token-api-with-test-public-key',
  expectedStatus,
  steps: [] as EvidenceStep[],
  defects: [] as string[],
  providerPaymentId: '',
  result: 'running' as 'running' | 'passed' | 'failed',
  completedAt: '',
  failure: '',
}

const record = (step: EvidenceStep) => {
  evidence.steps.push(step)
  if (step.defect) evidence.defects.push(step.defect)
  console.log(`[R2B] ${step.name}${step.httpStatus ? ` HTTP=${step.httpStatus}` : ''}${step.defect ? ` DEFECT=${step.defect}` : ''}`)
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
const tokenHeaders = (token: string) => ({ 'x-access-token': token })

const cardholderNameByExpectedStatus: Record<string, string> = {
  approved: 'APRO',
  pending: 'CONT',
  rejected: 'OTHE',
}

/**
 * R2B uses only Mercado Pago's published Peru TEST card data. This function
 * creates a fresh, one-time CardToken with the TEST Public Key immediately
 * before the payment attempt. The CardToken is never persisted in evidence,
 * committed, or printed.
 */
const createFreshTestCardToken = async () => {
  const cardholderName = cardholderNameByExpectedStatus[expectedStatus]
  const cardholder: Record<string, unknown> = { name: cardholderName }

  if (expectedStatus !== 'pending') {
    cardholder.identification = {
      type: 'DNI',
      number: '123456789',
    }
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        card_number: '4009175332806176',
        expiration_month: 11,
        expiration_year: 2030,
        security_code: '123',
        cardholder,
      }),
    },
  )

  let body: any = undefined
  try {
    body = await response.json()
  } catch {
    // The status alone is enough for sanitized failure evidence.
  }

  if (!response.ok || !body?.id) {
    throw new Error(`Mercado Pago TEST card tokenization failed: HTTP ${response.status}`)
  }

  const token = String(body.id)
  // GitHub Actions interprets this command and masks the one-time token if any
  // dependency ever writes it later in the same job.
  console.log(`::add-mask::${token}`)

  record({
    name: 'fresh one-time TEST CardToken generated from TEST Public Key',
    timestamp: new Date().toISOString(),
    httpStatus: response.status,
    expected: { generated: true, persisted: false },
    observed: { generated: true, persisted: false, providerTokenStatus: body?.status || 'created' },
  })

  return token
}

const signinAdmin = async () => {
  const result = await httpRequest('/api/sign-in/admin', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: adminEmail, password, mobile: true }),
  })
  if (result.response.status !== 200 || !result.body?.accessToken) {
    throw new Error(`R2B admin signin failed: HTTP ${result.response.status}`)
  }
  return String(result.body.accessToken)
}

const waitReservation = async (bookingId: string, expected: ReservationStatus, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await ReservationState.findOne({ booking: new mongoose.Types.ObjectId(bookingId) }).lean()
    if (state?.status === expected) return state
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return ReservationState.findOne({ booking: new mongoose.Types.ObjectId(bookingId) }).lean()
}

const createTemporaryBooking = async (ids: { supplierId: string; driverId: string; carId: string; locationId: string }) => {
  const from = new Date(Date.now() + 40 * 86400000)
  const to = new Date(from.getTime() + 2 * 86400000)
  const sessionId = `r2b-session-${runId}`
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
    throw new Error(`R2B temporary booking failed: HTTP ${result.response.status}`)
  }
  return { bookingId: String(result.body.bookingId), sessionId }
}

const quote = (bookingId: string, sessionId: string) => httpRequest(
  `/api/mercadopago/quote/${encodeURIComponent(bookingId)}/${encodeURIComponent(sessionId)}`,
)

const pay = (
  bookingId: string,
  sessionId: string,
  idempotencyKey: string,
  cardToken: string,
) => httpRequest('/api/create-mercadopago-payment', {
  method: 'POST',
  headers: jsonHeaders({ 'x-idempotency-key': idempotencyKey }),
  body: JSON.stringify({
    bookingId,
    reservationSessionId: sessionId,
    token: cardToken,
    installments: 1,
    paymentMethodId,
    payer: {
      email: customerEmail,
      ...(expectedStatus !== 'pending'
        ? { identification: { docType: 'DNI', docNumber: '123456789' } }
        : {}),
    },
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
    server!.listen(4004, '127.0.0.1', resolve)
  })

  const [customer, admin, supplier] = await Promise.all([
    User.findOne({ email: customerEmail }),
    User.findOne({ email: adminEmail }),
    User.findOne({ email: supplierEmail }),
  ])
  if (!customer || !admin || !supplier) throw new Error('R2B seeded identities missing')
  const car = await Car.findOne({ supplier: supplier._id }).sort({ name: 1 })
  const location = await Location.findOne({ supplier: supplier._id })
  if (!car || !location) throw new Error('R2B seeded vehicle/location missing')

  const adminToken = await signinAdmin()
  const ids = {
    supplierId: supplier._id.toString(),
    driverId: customer._id.toString(),
    carId: car._id.toString(),
    locationId: location._id.toString(),
  }

  const booking = await createTemporaryBooking(ids)
  const authoritativeQuote = await quote(booking.bookingId, booking.sessionId)
  if (authoritativeQuote.response.status !== 200) throw new Error(`R2B quote failed: HTTP ${authoritativeQuote.response.status}`)
  const amount = Number(authoritativeQuote.body.amount)
  const currency = String(authoritativeQuote.body.currency)
  const awaiting = await waitReservation(booking.bookingId, ReservationStatus.AwaitingPayment)
  record({
    name: 'server quote established before provider call',
    timestamp: new Date().toISOString(),
    httpStatus: authoritativeQuote.response.status,
    expected: { currency: 'PEN', reservation: 'awaiting_payment' },
    observed: { amount, currency, reservation: awaiting?.status },
    ...((amount > 0 && currency === 'PEN' && awaiting?.status === ReservationStatus.AwaitingPayment) ? {} : { defect: 'R2B-QUOTE-AUTHORITY' }),
  })

  const cardToken = await createFreshTestCardToken()
  const idempotencyKey = `r2b-${runId}`
  const created = await pay(booking.bookingId, booking.sessionId, idempotencyKey, cardToken)
  if (![200, 201].includes(created.response.status) || !created.body?.id) {
    throw new Error(`R2B provider payment creation failed: HTTP ${created.response.status}`)
  }
  const providerPaymentId = String(created.body.id)
  evidence.providerPaymentId = providerPaymentId

  const providerClient = new MercadoPagoConfig({ accessToken })
  const provider = new Payment(providerClient)
  const providerPayment: any = await provider.get({ id: providerPaymentId })
  const providerStatus = String(providerPayment?.status || '').toLowerCase()
  const liveMode = providerPayment?.live_mode
  record({
    name: 'real provider read-back is test-mode and matches MitoS authority',
    timestamp: new Date().toISOString(),
    expected: {
      liveMode: false,
      externalReference: booking.bookingId,
      amount,
      currency: 'PEN',
      status: expectedStatus,
    },
    observed: {
      liveMode,
      externalReference: providerPayment?.external_reference,
      amount: Number(providerPayment?.transaction_amount),
      currency: providerPayment?.currency_id,
      status: providerStatus,
    },
    ...((liveMode === false
      && String(providerPayment?.external_reference) === booking.bookingId
      && Number(providerPayment?.transaction_amount) === amount
      && String(providerPayment?.currency_id) === 'PEN'
      && providerStatus === expectedStatus)
      ? {}
      : { defect: 'R2B-PROVIDER-READBACK' }),
  })

  const transaction = await PaymentTransaction.findOne({ providerPaymentId }).lean()
  const reservation = await ReservationState.findOne({ booking: new mongoose.Types.ObjectId(booking.bookingId) }).lean()
  const bookingDoc = await Booking.findById(booking.bookingId).lean()
  const shouldConfirm = expectedStatus === 'approved'
  record({
    name: 'provider status maps to reservation truth',
    timestamp: new Date().toISOString(),
    expected: shouldConfirm
      ? { payment: 'approved', reservation: 'confirmed' }
      : { reservationNotConfirmed: true },
    observed: {
      payment: transaction?.status,
      reservation: reservation?.status,
      booking: bookingDoc?.status,
    },
    ...((shouldConfirm
      ? transaction?.status === 'approved' && reservation?.status === ReservationStatus.Confirmed
      : reservation?.status !== ReservationStatus.Confirmed)
      ? {}
      : { defect: 'R2B-STATE-MAPPING' }),
  })

  const sameKey = await pay(booking.bookingId, booking.sessionId, idempotencyKey, cardToken)
  record({
    name: 'same idempotency key reuses existing provider payment without reusing token at provider',
    timestamp: new Date().toISOString(),
    httpStatus: sameKey.response.status,
    expected: { providerPaymentId, replay: true },
    observed: { providerPaymentId: sameKey.body?.id, replay: sameKey.body?.idempotentReplay },
    ...((String(sameKey.body?.id) === providerPaymentId && sameKey.body?.idempotentReplay === true)
      ? {}
      : { defect: 'R2B-SAME-KEY-REPLAY' }),
  })

  if (expectedStatus === 'approved' || expectedStatus === 'pending') {
    const secondKey = await pay(booking.bookingId, booking.sessionId, `r2b-second-${runId}`, cardToken)
    record({
      name: 'different key cannot open second active provider payment',
      timestamp: new Date().toISOString(),
      httpStatus: secondKey.response.status,
      expected: 409,
      observed: secondKey.response.status,
      ...(secondKey.response.status === 409 ? {} : { defect: 'R2B-DISTINCT-KEY-ACTIVE-PAYMENT' }),
    })
  }

  const reconcile = await httpRequest(`/api/mercadopago/reconcile/${encodeURIComponent(providerPaymentId)}`, {
    method: 'POST',
    headers: tokenHeaders(adminToken),
  })
  record({
    name: 'backoffice reconciliation re-reads real provider truth',
    timestamp: new Date().toISOString(),
    httpStatus: reconcile.response.status,
    expected: 200,
    observed: { status: reconcile.response.status, providerPaymentId: reconcile.body?.id },
    ...(reconcile.response.status === 200 ? {} : { defect: 'R2B-RECONCILIATION' }),
  })

  evidence.result = evidence.defects.length === 0 ? 'passed' : 'failed'
  evidence.completedAt = new Date().toISOString()
  if (evidence.defects.length) {
    evidence.failure = `R2B defects: ${evidence.defects.join(', ')}`
    process.exitCode = 1
  }
} catch (error) {
  evidence.result = 'failed'
  evidence.completedAt = new Date().toISOString()
  evidence.failure = error instanceof Error ? error.message : String(error)
  console.error('[R2B] HARNESS FAILURE', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  await fs.mkdir(evidenceDir, { recursive: true })
  await fs.writeFile(path.join(evidenceDir, 'mitos-r2b-provider-runtime.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await mongoose.disconnect().catch(() => undefined)
  console.log(`[R2B] RESULT=${evidence.result} defects=${evidence.defects.join(',') || 'none'}`)
}
