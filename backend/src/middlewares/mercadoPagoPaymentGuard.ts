import { NextFunction, Request, Response } from 'express'
import { Types } from 'mongoose'
import PaymentTransaction, {
  PaymentProvider,
  PaymentStatus,
} from '../models/PaymentTransaction'
import { getAuthoritativeBookingCharge } from '../services/bookingPricingService'
import { getMercadoPagoActiveKey } from '../services/paymentStateService'
import * as logger from '../utils/logger'

const activeStatuses = [PaymentStatus.Pending, PaymentStatus.Approved]

const isDuplicateKeyError = (err: unknown) => (
  !!err
  && typeof err === 'object'
  && 'code' in err
  && Number((err as { code?: unknown }).code) === 11000
)

/**
 * Atomically reserve the right to create an active Mercado Pago payment.
 *
 * The previous implementation did a read-before-write check, which allowed two
 * simultaneous requests with different idempotency keys to both observe "no
 * active payment" and then both call the provider. This middleware now inserts
 * the pending PaymentTransaction claim before provider I/O. A unique sparse
 * activeKey index makes MongoDB the cross-process serialization boundary.
 *
 * Same-key retries are still safe: they reuse the same PaymentTransaction and
 * the controller/provider idempotency contract remains authoritative. Terminal
 * provider states release activeKey in paymentStateService, enabling a later
 * legitimate retry with a new key.
 */
const mercadoPagoPaymentGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      bookingId,
      reservationSessionId,
      token,
      paymentMethodId,
      payer,
    } = req.body || {}
    const idempotencyKey = String(req.headers['x-idempotency-key'] || '').trim()

    // Preserve the controller's existing malformed-request contract. Only
    // create a financial claim once all pre-provider identifiers are present.
    if (
      !bookingId
      || !reservationSessionId
      || !paymentMethodId
      || !token
      || !payer?.email
      || !idempotencyKey
    ) {
      next()
      return
    }

    const bookingIdString = String(bookingId)
    const { amount, currency, booking, driver } = await getAuthoritativeBookingCharge(bookingIdString)

    if (!booking.sessionId || booking.sessionId !== String(reservationSessionId)) {
      res.sendStatus(404)
      return
    }

    if (driver.email && driver.email.toLowerCase() !== String(payer.email).toLowerCase()) {
      res.status(400).json({ error: 'Payment payer does not match reservation customer' })
      return
    }

    // Preserve compatibility with active transactions created before activeKey
    // existed. This read is not the concurrency primitive; the unique claim
    // below is. It simply prevents a legacy active transaction from being
    // bypassed by a new key.
    const existingActive = await PaymentTransaction.findOne({
      booking: booking._id,
      provider: PaymentProvider.MercadoPago,
      status: { $in: activeStatuses },
    }).sort({ _id: -1 })

    if (existingActive && existingActive.idempotencyKey !== idempotencyKey) {
      res.status(409).json({
        error: 'Reservation already has an active Mercado Pago payment',
        status: existingActive.status,
      })
      return
    }

    const activeKey = getMercadoPagoActiveKey(bookingIdString)

    try {
      const claim = await PaymentTransaction.findOneAndUpdate(
        { idempotencyKey },
        {
          $setOnInsert: {
            booking: new Types.ObjectId(bookingIdString),
            provider: PaymentProvider.MercadoPago,
            externalReference: bookingIdString,
            idempotencyKey,
            activeKey,
            status: PaymentStatus.Pending,
            amount,
            currency,
            paymentMethodId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )

      if (!claim) {
        throw new Error('Mercado Pago payment claim was not created')
      }

      if (claim.booking.toString() !== bookingIdString) {
        res.status(409).json({ error: 'Idempotency key already belongs to another reservation' })
        return
      }

      next()
      return
    } catch (err) {
      if (!isDuplicateKeyError(err)) {
        throw err
      }

      // A duplicate can mean either:
      // 1) same idempotency key racing with itself -> safe to continue because
      //    the provider receives the same key, or
      // 2) a different key lost the unique activeKey race -> block it before
      //    any provider call.
      const existingByKey = await PaymentTransaction.findOne({ idempotencyKey })
      if (existingByKey) {
        if (existingByKey.booking.toString() !== bookingIdString) {
          res.status(409).json({ error: 'Idempotency key already belongs to another reservation' })
          return
        }

        next()
        return
      }

      const winningActiveClaim = await PaymentTransaction.findOne({ activeKey })
      if (winningActiveClaim) {
        res.status(409).json({
          error: 'Reservation already has an active Mercado Pago payment',
          status: winningActiveClaim.status,
        })
        return
      }

      throw err
    }
  } catch (err) {
    logger.error('[MercadoPago.paymentGuard] Failed to reserve active payment', err)
    // Payment creation is a financial mutation: guard failures fail closed.
    res.status(500).json({ error: 'Unable to reserve active payment state' })
  }
}

export default mercadoPagoPaymentGuard
