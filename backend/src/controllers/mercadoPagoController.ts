import { Request, Response } from 'express'
import { PaymentError } from '@em3rc0d/m-pago'
import { ReservationStatus } from '../models/ReservationState'
import {
  getAuthoritativeBookingCharge,
  getFrozenPaymentQuote,
} from '../services/bookingPricingService'
import {
  ensureReservationState,
  transitionReservation,
} from '../services/reservationStateService'
import {
  dispatchPaymentEvents,
  getBookingPaymentContext,
  hasRealWebhookSecret,
  operatorContext,
  paymentService,
} from '../services/mitosPaymentService'
import * as logger from '../utils/logger'

export { validateMercadoPagoWebhookSignature } from '../utils/mercadoPagoWebhookSignature'
const sendError = (res: Response, err: unknown) => {
  if (err instanceof PaymentError) {
    res.status(err.status || 409).json({ error: err.code })
    return
  }
  logger.error('[MercadoPago] payment integration failure', err)
  res.status(500).json({ error: 'PAYMENT_FAILURE' })
}

export const quotePayment = async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.params.bookingId || '')
    const sessionId = String(req.params.sessionId || '')
    const quote = await getFrozenPaymentQuote(bookingId, sessionId)
    const charge = await getAuthoritativeBookingCharge(bookingId)

    await ensureReservationState(bookingId, ReservationStatus.Pending)
    await transitionReservation(bookingId, ReservationStatus.AwaitingPayment)

    res.json({
      bookingId,
      amount: quote.amountMinor / (10 ** quote.exponent),
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      exponent: quote.exponent,
      version: quote.version,
      rentalPrice: charge.rentalPrice,
      balanceDue: charge.balanceDue,
      paymentPlan: charge.paymentPlan,
      reservationPolicy: charge.reservationPolicy,
    })
  } catch (err) {
    sendError(res, err)
  }
}

export const createPayment = async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.body?.bookingId || '')
    const reservationSessionId = String(req.body?.reservationSessionId || '')
    const idempotencyKey = String(req.headers['x-idempotency-key'] || '').trim()
    const token = req.body?.instrument?.token ?? req.body?.token
    const paymentMethodId = req.body?.instrument?.paymentMethodId
      ?? req.body?.paymentMethodId
      ?? req.body?.payment_method_id
    const installments = req.body?.instrument?.installments ?? req.body?.installments ?? 1
    const issuerId = req.body?.instrument?.issuerId ?? req.body?.issuerId ?? req.body?.issuer_id

    if (!bookingId || !reservationSessionId || !idempotencyKey || !token || !paymentMethodId) {
      res.status(400).json({ error: 'INVALID_PAYMENT_REQUEST' })
      return
    }

    await getFrozenPaymentQuote(bookingId, reservationSessionId)
    const { context, payableId } = await getBookingPaymentContext(bookingId, reservationSessionId)
    await ensureReservationState(bookingId, ReservationStatus.Pending)
    await transitionReservation(bookingId, ReservationStatus.AwaitingPayment)

    const payment = await paymentService.create(context, {
      payableId,
      idempotencyKey,
      instrument: {
        token: String(token),
        paymentMethodId: String(paymentMethodId),
        installments: Number(installments || 1),
        ...(issuerId ? { issuerId: String(issuerId) } : {}),
      },
    })

    await dispatchPaymentEvents()

    res.status(201).json({
      bookingId,
      paymentId: payment.id,
      id: payment.providerId,
      providerId: payment.providerId,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      paymentMethodId: payment.paymentMethodId,
      refundedMinor: payment.refundedMinor,
      version: payment.version,
    })
  } catch (err) {
    sendError(res, err)
  }
}

export const getPayment = async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.params.bookingId || '')
    const sessionId = String(req.params.sessionId || '')
    const paymentId = String(req.params.paymentId || '')
    const { context, payableId } = await getBookingPaymentContext(bookingId, sessionId)
    const payment = await paymentService.get(context, { payableId, paymentId })
    res.json(payment)
  } catch (err) {
    sendError(res, err)
  }
}

export const webhook = async (req: Request, res: Response) => {
  try {
    if (!hasRealWebhookSecret()) {
      res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED' })
      return
    }
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
    const host = req.get('host')
    const url = new URL(req.originalUrl, `${proto}://${host}`).toString()
    const result = await paymentService.webhook({ url, headers: req.headers })
    await dispatchPaymentEvents()
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
}

export const reconcilePayment = async (req: Request, res: Response) => {
  try {
    const paymentId = String(req.params.paymentId || '')
    const payment = await paymentService.reconcile(operatorContext, paymentId)
    await dispatchPaymentEvents()
    res.json(payment)
  } catch (err) {
    sendError(res, err)
  }
}
