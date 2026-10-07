import * as bookcarsTypes from ':bookcars-types'
import {
  MercadoPagoAdapter,
  PaymentError,
  PaymentService,
  SQLitePaymentStore,
  type PaymentContext,
} from '@em3rc0d/m-pago'
import * as env from '../config/env.config'
import Booking from '../models/Booking'
import Car from '../models/Car'
import { getFrozenPaymentQuote } from './bookingPricingService'

const TENANT_ID = 'mitos'
const collectorId = env.__env__('MP_COLLECTOR_ID', true)
const currency = env.__env__('BC_MERCADO_PAGO_CURRENCY', false, 'PEN').toUpperCase()
const exponent = Number.parseInt(env.__env__('MP_CURRENCY_EXPONENT', false, '2'), 10)
const environment = env.__env__('MP_ENVIRONMENT', false, 'test') as 'test' | 'live'
const databasePath = env.__env__('MP_DATABASE_PATH', false, '/data/payments.sqlite')
const configuredWebhookSecret = env.__env__('BC_MERCADO_PAGO_WEBHOOK_SECRET', false)

const provider = new MercadoPagoAdapter({
  accessToken: env.MERCADO_PAGO_ACCESS_TOKEN,
  collectorId,
  currency,
  exponent,
  environment,
  allowLive: env.__env__('MP_ALLOW_LIVE', false, 'false').toLowerCase() === 'true',
})

const store = new SQLitePaymentStore(databasePath)

const parsePayableId = (payableId: string) => {
  const match = /^booking:([a-fA-F0-9]{24})$/.exec(payableId)
  if (!match) throw new PaymentError('INVALID_PAYABLE_ID', 400)
  return match[1]
}

export const payableIdForBooking = (bookingId: string) => `booking:${bookingId}`

export const paymentService = new PaymentService({
  store,
  provider,
  webhookSecret: configuredWebhookSecret || 'webhook-disabled-mitos-test',
  resolveQuote: async (context: PaymentContext, payableId: string) => {
    const bookingId = parsePayableId(payableId)
    const quote = await getFrozenPaymentQuote(bookingId)
    if (String(quote.user) !== context.userId || context.tenantId !== TENANT_ID) {
      throw new PaymentError('FORBIDDEN', 403)
    }
    return {
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      exponent: quote.exponent,
      version: quote.version,
      description: quote.description,
      payer: { email: quote.payerEmail },
    }
  },
  authorizeOperator: async (context: PaymentContext) => (
    context.tenantId === TENANT_ID && context.role === 'backoffice'
  ),
})

export const getBookingPaymentContext = async (bookingId: string, reservationSessionId?: string) => {
  const booking = await Booking.findById(bookingId)
  if (!booking) throw new PaymentError('PAYABLE_NOT_FOUND', 404)
  if (reservationSessionId && booking.sessionId !== reservationSessionId) {
    throw new PaymentError('PAYABLE_NOT_FOUND', 404)
  }
  return {
    booking,
    context: { tenantId: TENANT_ID, userId: booking.driver.toString() } satisfies PaymentContext,
    payableId: payableIdForBooking(bookingId),
  }
}

const paidStatuses = new Set([
  bookcarsTypes.BookingStatus.Paid,
  bookcarsTypes.BookingStatus.Deposit,
  bookcarsTypes.BookingStatus.PaidInFull,
])

export const dispatchPaymentEvents = async () => paymentService.dispatchEvents(
  { tenantId: TENANT_ID, userId: 'system', role: 'backoffice' },
  async (event: any) => {
    if (!event?.payment?.payableId) return
    const bookingId = parsePayableId(String(event.payment.payableId))
    const booking = await Booking.findById(bookingId)
    if (!booking) throw new Error(`Booking ${bookingId} not found`)

    if (event.type === 'payment.approved') {
      const wasPaid = paidStatuses.has(booking.status)
      if (booking.isDeposit) {
        booking.status = bookcarsTypes.BookingStatus.Deposit
      } else if (booking.isPayedInFull) {
        booking.status = bookcarsTypes.BookingStatus.PaidInFull
      } else {
        booking.status = bookcarsTypes.BookingStatus.Paid
      }
      booking.paymentIntentId = event.payment.providerId || undefined
      booking.expireAt = undefined
      await booking.save()
      if (!wasPaid) {
        await Car.updateOne({ _id: booking.car }, { $inc: { trips: 1 } })
      }
    }
  },
  { limit: 100 },
)

export const hasRealWebhookSecret = () => Boolean(configuredWebhookSecret && configuredWebhookSecret.length >= 16)
export const operatorContext = { tenantId: TENANT_ID, userId: 'backoffice', role: 'backoffice' } satisfies PaymentContext
