import crypto from 'node:crypto'
import { Request, Response } from 'express'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'
import i18n from '../lang/i18n'
import Booking from '../models/Booking'
import PaymentTransaction, { PaymentStatus } from '../models/PaymentTransaction'
import { ReservationStatus } from '../models/ReservationState'
import { TransactionalEmailEvent } from '../models/TransactionalEmailDelivery'
import { getAuthoritativeBookingCharge } from '../services/bookingPricingService'
import {
  getMercadoPagoPaymentByProviderId,
  upsertMercadoPagoPayment,
} from '../services/paymentStateService'
import {
  ensureReservationState,
  transitionReservation,
} from '../services/reservationStateService'
import { sendBookingEventEmailNonBlocking } from '../services/transactionalEmailService'
import * as logger from '../utils/logger'

const client = new MercadoPagoConfig({ accessToken: env.MERCADO_PAGO_ACCESS_TOKEN })
const payment = new Payment(client)

const getIdempotencyKey = (req: Request) => String(req.headers['x-idempotency-key'] || '').trim()

const parseSignature = (header: string) => Object.fromEntries(
  header.split(',').map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, value.join('=')]
  }),
)

export const validateMercadoPagoWebhookSignature = ({
  signature,
  requestId,
  dataId,
  secret,
}: {
  signature: string
  requestId: string
  dataId: string
  secret: string
}) => {
  const parts = parseSignature(signature)
  const ts = parts.ts
  const received = parts.v1
  if (!ts || !received) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  const receivedBuffer = Buffer.from(received, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
}

const validateReservationSession = (bookingSessionId: string | undefined, suppliedSessionId: string) => (
  !!bookingSessionId && bookingSessionId === suppliedSessionId
)

const applyApprovedPayment = async (bookingId: string, transactionId: string) => {
  const transaction = await PaymentTransaction.findById(transactionId)
  if (!transaction || transaction.status !== PaymentStatus.Approved) return

  const booking = await Booking.findById(bookingId)
  if (!booking) throw new Error(`Booking ${bookingId} not found`)

  // These writes are deliberately idempotent. A retried webhook or a later
  // reconciliation can safely re-apply the provider truth.
  if (booking.isDeposit) {
    booking.status = bookcarsTypes.BookingStatus.Deposit
  } else if (booking.isPayedInFull) {
    booking.status = bookcarsTypes.BookingStatus.PaidInFull
  } else {
    booking.status = bookcarsTypes.BookingStatus.Paid
  }
  booking.paymentIntentId = transaction.providerPaymentId
  booking.expireAt = undefined
  await booking.save()

  await transitionReservation(bookingId, ReservationStatus.Confirmed)

  // Payment approval and reservation confirmation are separate customer events.
  // The persistent delivery ledger makes repeated webhook/reconciliation calls
  // safe without relying on browser state.
  await sendBookingEventEmailNonBlocking({
    bookingId,
    event: TransactionalEmailEvent.PaymentApproved,
    providerPaymentId: transaction.providerPaymentId,
  })
  await sendBookingEventEmailNonBlocking({
    bookingId,
    event: TransactionalEmailEvent.ReservationConfirmed,
  })

  if (!transaction.processedApprovalAt) {
    transaction.processedApprovalAt = new Date()
    await transaction.save()
  }
}

export const syncMercadoPagoPayment = async (providerPaymentId: string) => {
  const providerPayment = await payment.get({ id: providerPaymentId })
  const bookingId = String(providerPayment.external_reference || '').trim()
  if (!bookingId) throw new Error(`Mercado Pago payment ${providerPaymentId} has no external_reference`)

  const { amount, currency } = await getAuthoritativeBookingCharge(bookingId)
  const providerAmount = Number(providerPayment.transaction_amount)
  const providerCurrency = String(providerPayment.currency_id || currency).toUpperCase()

  if (!Number.isFinite(providerAmount) || Math.abs(providerAmount - amount) > 0.009) {
    throw new Error(`Mercado Pago amount mismatch for booking ${bookingId}`)
  }
  if (providerCurrency !== currency) {
    throw new Error(`Mercado Pago currency mismatch for booking ${bookingId}`)
  }

  const existing = await getMercadoPagoPaymentByProviderId(providerPaymentId)
  const transaction = await upsertMercadoPagoPayment({
    bookingId,
    providerPaymentId,
    externalReference: bookingId,
    idempotencyKey: existing?.idempotencyKey || `recovered-${providerPaymentId}`,
    providerStatus: providerPayment.status || undefined,
    statusDetail: providerPayment.status_detail || undefined,
    amount,
    currency,
    paymentMethodId: providerPayment.payment_method_id || undefined,
  })

  if (transaction.status === PaymentStatus.Approved) {
    await applyApprovedPayment(bookingId, transaction._id.toString())
  }

  return transaction
}

/**
 * Return the server-owned amount shown by the Mercado Pago Brick. The caller
 * must prove it owns the temporary checkout session, not merely know a booking
 * identifier.
 */
export const quotePayment = async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.params.bookingId || '')
    const reservationSessionId = String(req.params.sessionId || '')
    const charge = await getAuthoritativeBookingCharge(bookingId)

    if (!validateReservationSession(charge.booking.sessionId, reservationSessionId)) {
      res.sendStatus(404)
      return
    }

    await ensureReservationState(bookingId, ReservationStatus.Pending)
    await transitionReservation(bookingId, ReservationStatus.AwaitingPayment)

    res.json({
      bookingId,
      amount: charge.amount,
      currency: charge.currency,
    })
  } catch (err) {
    logger.error('[MercadoPago.quotePayment] Failed to create authoritative quote', err)
    res.status(400).json({ error: i18n.t('ERROR') })
  }
}

/**
 * Create a reservation-bound Mercado Pago payment.
 *
 * Client data is limited to tokenized payment details. Amount, currency and
 * external_reference are server-owned and derived from the persisted booking.
 */
export const createPayment = async (req: Request, res: Response) => {
  try {
    const {
      bookingId,
      reservationSessionId,
      token,
      installments,
      paymentMethodId,
      issuerId,
      payer,
    } = req.body || {}
    const idempotencyKey = getIdempotencyKey(req)

    if (!bookingId || !reservationSessionId || !paymentMethodId || !token || !payer?.email || !idempotencyKey) {
      res.status(400).json({ error: 'bookingId, reservation session, payment details and X-Idempotency-Key are required' })
      return
    }

    const existingByKey = await PaymentTransaction.findOne({ idempotencyKey })
    if (existingByKey) {
      if (existingByKey.booking.toString() !== bookingId) {
        res.status(409).json({ error: 'Idempotency key already belongs to another reservation' })
        return
      }

      if (existingByKey.providerPaymentId) {
        const synced = await syncMercadoPagoPayment(existingByKey.providerPaymentId)
        res.status(200).json({
          bookingId,
          id: synced.providerPaymentId,
          status: synced.status,
          idempotentReplay: true,
        })
        return
      }
    }

    const { amount, currency, driver, booking } = await getAuthoritativeBookingCharge(bookingId)
    if (!validateReservationSession(booking.sessionId, String(reservationSessionId))) {
      res.sendStatus(404)
      return
    }
    if (driver.email && driver.email.toLowerCase() !== String(payer.email).toLowerCase()) {
      res.status(400).json({ error: 'Payment payer does not match reservation customer' })
      return
    }

    await ensureReservationState(bookingId, ReservationStatus.Pending)
    await transitionReservation(bookingId, ReservationStatus.AwaitingPayment)

    let paymentData: any = {
      transaction_amount: amount,
      description: `${env.WEBSITE_NAME} - Reserva ${bookingId}`,
      external_reference: bookingId,
      payment_method_id: paymentMethodId,
      payer: {
        email: payer.email,
      },
    }

    if (paymentMethodId === 'yape') {
      paymentData = {
        ...paymentData,
        token,
        installments: 1,
      }
    } else {
      paymentData = {
        ...paymentData,
        token,
        installments: Number(installments || 1),
        ...(issuerId ? { issuer_id: issuerId } : {}),
        payer: {
          ...paymentData.payer,
          ...(payer.identification?.docType && payer.identification?.docNumber
            ? {
                identification: {
                  type: payer.identification.docType,
                  number: payer.identification.docNumber,
                },
              }
            : {}),
        },
      }
    }

    const data = await payment.create({
      body: paymentData,
      requestOptions: { idempotencyKey },
    })

    const providerPaymentId = data.id ? String(data.id) : undefined
    const transaction = await upsertMercadoPagoPayment({
      bookingId,
      providerPaymentId,
      externalReference: bookingId,
      idempotencyKey,
      providerStatus: data.status || undefined,
      statusDetail: data.status_detail || undefined,
      amount,
      currency,
      paymentMethodId,
    })

    // Never treat a browser redirect/callback as payment truth. Even when the
    // create response says approved, re-read the resource from Mercado Pago.
    if (providerPaymentId && transaction.status === PaymentStatus.Approved) {
      await syncMercadoPagoPayment(providerPaymentId)
    }

    const responseData: any = {
      bookingId,
      status: transaction.status,
      id: providerPaymentId,
    }

    if (data.point_of_interaction?.transaction_data) {
      responseData.qr_code_base64 = data.point_of_interaction.transaction_data.qr_code_base64
      responseData.qr_code = data.point_of_interaction.transaction_data.qr_code
    }
    if (data.transaction_details?.external_resource_url) {
      responseData.external_resource_url = data.transaction_details.external_resource_url
    }

    res.status(201).json(responseData)
  } catch (err) {
    logger.error(`[MercadoPago.createPayment] ${i18n.t('ERROR')}`, err)
    res.status(400).json({ error: i18n.t('ERROR') })
  }
}

/**
 * Mercado Pago webhook. Authenticity is verified before provider state is read.
 */
export const webhook = async (req: Request, res: Response) => {
  try {
    const secret = env.__env__('BC_MERCADO_PAGO_WEBHOOK_SECRET', false)
    if (!secret) {
      logger.error('[MercadoPago.webhook] BC_MERCADO_PAGO_WEBHOOK_SECRET is not configured')
      res.sendStatus(500)
      return
    }

    const signature = String(req.headers['x-signature'] || '')
    const requestId = String(req.headers['x-request-id'] || '')
    const dataId = String(req.query['data.id'] || req.body?.data?.id || '')

    if (!signature || !requestId || !dataId || !validateMercadoPagoWebhookSignature({
      signature,
      requestId,
      dataId,
      secret,
    })) {
      res.sendStatus(401)
      return
    }

    const type = String(req.query.type || req.body?.type || '')
    if (type === 'payment') {
      await syncMercadoPagoPayment(dataId)
    }

    // Acknowledge valid notifications quickly. Repeated notifications are safe
    // because provider state synchronization, reservation transitions and
    // transactional email delivery are idempotent.
    res.sendStatus(200)
  } catch (err) {
    logger.error('[MercadoPago.webhook] Failed to synchronize payment', err)
    res.sendStatus(500)
  }
}

/**
 * Explicit reconciliation endpoint used when a webhook was missed.
 */
export const reconcilePayment = async (req: Request, res: Response) => {
  try {
    const providerPaymentId = String(req.params.paymentId || '')
    if (!providerPaymentId) {
      res.status(400).json({ error: 'paymentId is required' })
      return
    }

    const transaction = await syncMercadoPagoPayment(providerPaymentId)
    res.json(transaction)
  } catch (err) {
    logger.error('[MercadoPago.reconcilePayment] Failed to synchronize payment', err)
    res.status(400).json({ error: i18n.t('ERROR') })
  }
}
