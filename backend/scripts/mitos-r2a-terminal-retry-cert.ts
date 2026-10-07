import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import mongoose from 'mongoose'
import { Payment } from 'mercadopago'
import Car from '../src/models/Car'
import Location from '../src/models/Location'
import PaymentTransaction, { PaymentStatus } from '../src/models/PaymentTransaction'
import ReservationState, { ReservationStatus } from '../src/models/ReservationState'
import User from '../src/models/User'

const apiBase = 'http://127.0.0.1:4005'
const dbUri = String(process.env.BC_DB_URI || '')
const runId = String(process.env.GITHUB_RUN_ID || `local-${Date.now()}`)
const evidenceDir = String(process.env.R2_EVIDENCE_DIR || path.resolve(process.cwd(), '../r2-evidence'))
const customerEmail = String(process.env.MITOS_DEMO_CUSTOMER_EMAIL || '')
const supplierEmail = String(process.env.MITOS_DEMO_SUPPLIER_EMAIL || '')

if (!dbUri || !customerEmail || !supplierEmail) throw new Error('R2 terminal retry environment incomplete')

const evidence = {
  runId,
  startedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || 'local',
  test: 'terminal-payment-releases-active-claim',
  firstStatus: 0,
  secondStatus: 0,
  providerCreateCalls: 0,
  transactionStatuses: [] as string[],
  activeTransactions: 0,
  reservationStatus: '',
  result: 'running' as 'running' | 'passed' | 'failed',
  failure: '',
  completedAt: '',
}

let providerSequence = 0
let providerCreateCalls = 0
const originalCreate = (Payment.prototype as any).create
const originalGet = (Payment.prototype as any).get
const providerStore = new Map<string, any>()

;(Payment.prototype as any).create = async ({ body }: any) => {
  providerCreateCalls += 1
  const id = `r2-terminal-${runId}-${++providerSequence}`
  const payment = {
    id,
    status: providerCreateCalls === 1 ? 'rejected' : 'pending',
    status_detail: providerCreateCalls === 1 ? 'cc_rejected_other_reason' : 'pending_waiting_payment',
    external_reference: String(body.external_reference || ''),
    transaction_amount: Number(body.transaction_amount),
    currency_id: 'PEN',
    payment_method_id: String(body.payment_method_id || ''),
  }
  providerStore.set(id, payment)
  return structuredClone(payment)
}

;(Payment.prototype as any).get = async ({ id }: any) => {
  const payment = providerStore.get(String(id))
  if (!payment) throw new Error(`Provider payment ${id} missing`)
  return structuredClone(payment)
}

const request = async (pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBase}${pathname}`, init)
  const text = await response.text()
  let body: unknown = text
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }
  return { response, body }
}

let server: http.Server | undefined

try {
  await fs.mkdir(evidenceDir, { recursive: true })
  await mongoose.connect(dbUri)
  const { default: app } = await import('../src/app')
  server = http.createServer(app)
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(4005, '127.0.0.1', () => resolve())
  })

  const [customer, supplier] = await Promise.all([
    User.findOne({ email: customerEmail }),
    User.findOne({ email: supplierEmail }),
  ])
  if (!customer || !supplier) throw new Error('R2 terminal retry identities missing')

  const car = await Car.findOne({ supplier: supplier._id }).sort({ name: 1 })
  const location = await Location.findOne({ supplier: supplier._id })
  if (!car || !location) throw new Error('R2 terminal retry fixture missing')

  const from = new Date(Date.now() + 220 * 86400000)
  const to = new Date(from.getTime() + 2 * 86400000)
  const sessionId = `r2-terminal-session-${runId}`
  const checkout = await request('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      booking: {
        supplier: supplier._id.toString(),
        car: car._id.toString(),
        driver: customer._id.toString(),
        pickupLocation: location._id.toString(),
        dropOffLocation: location._id.toString(),
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
  if (checkout.response.status !== 200 || !(checkout.body as any)?.bookingId) {
    throw new Error(`Terminal retry booking failed HTTP ${checkout.response.status}`)
  }
  const bookingId = String((checkout.body as any).bookingId)

  const quote = await request(`/api/mercadopago/quote/${bookingId}/${sessionId}`)
  if (quote.response.status !== 200) throw new Error(`Terminal retry quote failed HTTP ${quote.response.status}`)

  const makePayment = (key: string) => request('/api/create-mercadopago-payment', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': key,
    },
    body: JSON.stringify({
      bookingId,
      reservationSessionId: sessionId,
      token: `token-${key}`,
      installments: 1,
      paymentMethodId: 'visa',
      payer: { email: customerEmail },
    }),
  })

  const first = await makePayment(`r2-terminal-a-${runId}`)
  evidence.firstStatus = first.response.status

  const firstTransaction = await PaymentTransaction.findOne({
    booking: new mongoose.Types.ObjectId(bookingId),
  }).sort({ createdAt: 1 })

  if (
    first.response.status !== 201
    || firstTransaction?.status !== PaymentStatus.Rejected
    || firstTransaction.activeKey
  ) {
    throw new Error(`Rejected payment did not release active claim: HTTP ${first.response.status}, status=${firstTransaction?.status}, activeKey=${firstTransaction?.activeKey || ''}`)
  }

  const second = await makePayment(`r2-terminal-b-${runId}`)
  evidence.secondStatus = second.response.status
  evidence.providerCreateCalls = providerCreateCalls

  const transactions = await PaymentTransaction.find({
    booking: new mongoose.Types.ObjectId(bookingId),
  }).sort({ createdAt: 1 }).lean()
  evidence.transactionStatuses = transactions.map((transaction) => String(transaction.status))
  evidence.activeTransactions = transactions.filter((transaction) => (
    transaction.status === PaymentStatus.Pending || transaction.status === PaymentStatus.Approved
  )).length

  const reservation = await ReservationState.findOne({
    booking: new mongoose.Types.ObjectId(bookingId),
  }).lean()
  evidence.reservationStatus = String(reservation?.status || '')

  if (
    second.response.status !== 201
    || providerCreateCalls !== 2
    || transactions.length !== 2
    || evidence.transactionStatuses[0] !== PaymentStatus.Rejected
    || evidence.transactionStatuses[1] !== PaymentStatus.Pending
    || evidence.activeTransactions !== 1
    || reservation?.status !== ReservationStatus.AwaitingPayment
  ) {
    throw new Error(
      `Terminal retry failed: secondHTTP=${second.response.status}, providerCreates=${providerCreateCalls}, transactions=${evidence.transactionStatuses.join(',')}, active=${evidence.activeTransactions}, reservation=${reservation?.status}`,
    )
  }

  evidence.result = 'passed'
  evidence.completedAt = new Date().toISOString()
} catch (error) {
  evidence.result = 'failed'
  evidence.failure = error instanceof Error ? error.stack || error.message : String(error)
  evidence.completedAt = new Date().toISOString()
  process.exitCode = 1
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  ;(Payment.prototype as any).create = originalCreate
  ;(Payment.prototype as any).get = originalGet
  await fs.mkdir(evidenceDir, { recursive: true })
  await fs.writeFile(path.join(evidenceDir, 'mitos-r2a-terminal-retry.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await mongoose.disconnect().catch(() => undefined)
  console.log(`[R2A-terminal-retry] RESULT=${evidence.result} ${evidence.failure}`)
}
