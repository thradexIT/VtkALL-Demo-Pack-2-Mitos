import { NextFunction, Request, Response } from 'express'
import Booking from '../models/Booking'
import * as logger from '../utils/logger'

const sameDate = (left: Date, right: unknown) => {
  const parsed = new Date(right as string | number | Date)
  return !Number.isNaN(parsed.getTime()) && left.getTime() === parsed.getTime()
}

/**
 * Reuse a previously created temporary checkout when the browser retries the
 * same reservation session. This prevents duplicated users/bookings when a
 * network error happens after the server committed the first checkout.
 *
 * PayPal keeps its legacy order flow and does not opt into this guard yet.
 */
export const reuseCheckoutSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId || req.body?.payPal) {
      next()
      return
    }

    const existing = await Booking.findOne({ sessionId })
    if (!existing) {
      next()
      return
    }

    const requested = req.body?.booking
    const sameReservation = requested
      && existing.car.toString() === String(requested.car)
      && existing.supplier.toString() === String(requested.supplier)
      && existing.pickupLocation.toString() === String(requested.pickupLocation)
      && existing.dropOffLocation.toString() === String(requested.dropOffLocation)
      && sameDate(existing.from, requested.from)
      && sameDate(existing.to, requested.to)

    if (!sameReservation) {
      res.status(409).json({ error: 'Checkout session already belongs to another reservation' })
      return
    }

    res.status(200).json({
      bookingId: existing._id.toString(),
      idempotentReplay: true,
    })
  } catch (err) {
    logger.error('[reuseCheckoutSession] Failed to evaluate checkout idempotency', err)
    next(err)
  }
}
