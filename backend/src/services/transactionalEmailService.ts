import Booking from '../models/Booking'
import Car from '../models/Car'
import User from '../models/User'
import TransactionalEmailDelivery, {
  TransactionalEmailDeliveryStatus,
  TransactionalEmailEvent,
} from '../models/TransactionalEmailDelivery'
import { en } from '../lang/en'
import { es } from '../lang/es'
import { fr } from '../lang/fr'
import * as env from '../config/env.config'
import * as helper from '../utils/helper'
import * as logger from '../utils/logger'
import * as mailHelper from '../utils/mailHelper'

const SENDING_CLAIM_STALE_MS = 5 * 60 * 1000

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const getCopy = (language?: string) => {
  if (language === 'fr') return fr
  if (language === 'es') return es
  return en
}

const getVehicleLabel = (language?: string) => {
  if (language === 'fr') return 'Véhicule'
  if (language === 'en') return 'Vehicle'
  return 'Vehículo'
}

const eventCopy = (event: TransactionalEmailEvent, copy: typeof en) => {
  switch (event) {
    case TransactionalEmailEvent.ReservationReceived:
      return {
        subject: copy.RESERVATION_RECEIVED_SUBJECT,
        body: copy.RESERVATION_RECEIVED_BODY,
      }
    case TransactionalEmailEvent.PaymentApproved:
      return {
        subject: copy.PAYMENT_APPROVED_SUBJECT,
        body: copy.PAYMENT_APPROVED_BODY,
      }
    case TransactionalEmailEvent.ReservationConfirmed:
      return {
        subject: copy.RESERVATION_CONFIRMED_SUBJECT,
        body: copy.RESERVATION_CONFIRMED_BODY,
      }
    case TransactionalEmailEvent.CancellationRequested:
      return {
        subject: copy.CANCELLATION_REQUESTED_SUBJECT,
        body: copy.CANCELLATION_REQUESTED_BODY,
      }
    case TransactionalEmailEvent.ReservationCancelled:
      return {
        subject: copy.RESERVATION_CANCELLED_SUBJECT,
        body: copy.RESERVATION_CANCELLED_BODY,
      }
    default:
      throw new Error(`Unsupported transactional email event: ${event}`)
  }
}

const ensureDelivery = async (bookingId: string, event: TransactionalEmailEvent) => {
  try {
    await TransactionalEmailDelivery.updateOne(
      { booking: bookingId, event },
      {
        $setOnInsert: {
          booking: bookingId,
          event,
          status: TransactionalEmailDeliveryStatus.Pending,
          attempts: 0,
        },
      },
      { upsert: true },
    )
  } catch (err: any) {
    // Another concurrent request may win the unique booking/event insert.
    // That is expected; the atomic claim below decides who may send.
    if (err?.code !== 11000) throw err
  }
}

const claimDelivery = async (bookingId: string, event: TransactionalEmailEvent) => {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - SENDING_CLAIM_STALE_MS)

  return TransactionalEmailDelivery.findOneAndUpdate(
    {
      booking: bookingId,
      event,
      status: { $ne: TransactionalEmailDeliveryStatus.Sent },
      $or: [
        { status: { $in: [TransactionalEmailDeliveryStatus.Pending, TransactionalEmailDeliveryStatus.Failed] } },
        {
          status: TransactionalEmailDeliveryStatus.Sending,
          lastAttemptAt: { $lt: staleBefore },
        },
      ],
    },
    {
      $set: {
        status: TransactionalEmailDeliveryStatus.Sending,
        lastAttemptAt: now,
        lastError: undefined,
      },
      $inc: { attempts: 1 },
    },
    { new: true },
  )
}

/**
 * Send one customer-facing rental event email per booking/event.
 *
 * The persistent claim prevents ordinary duplicate delivery from repeated
 * webhooks/reconciliation or repeated booking requests. A process crash after
 * provider acceptance but before the `sent` marker can still produce a later
 * retry; that is an unavoidable at-least-once edge without a provider-side
 * idempotent mail API/outbox acknowledgement protocol.
 */
export const sendBookingEventEmail = async ({
  bookingId,
  event,
  providerPaymentId,
}: {
  bookingId: string
  event: TransactionalEmailEvent
  providerPaymentId?: string
}) => {
  await ensureDelivery(bookingId, event)
  const delivery = await claimDelivery(bookingId, event)
  if (!delivery) {
    return { sent: false, deduplicated: true }
  }

  try {
    const booking = await Booking.findById(bookingId)
    if (!booking) throw new Error(`Booking ${bookingId} not found`)

    const driver = await User.findById(booking.driver)
    if (!driver?.email) throw new Error(`Booking ${bookingId} has no customer email`)

    const car = await Car.findById(booking.car)
    const language = driver.language || env.DEFAULT_LANGUAGE
    const copy = getCopy(language)
    const eventText = eventCopy(event, copy)
    const bookingUrl = helper.joinURL(env.FRONTEND_HOST, `booking?b=${encodeURIComponent(bookingId)}`)

    const providerReference = providerPaymentId
      ? `<br>${escapeHtml(copy.PAYMENT_APPROVED_SUBJECT)}: ${escapeHtml(providerPaymentId)}`
      : ''

    const info = await mailHelper.sendMail({
      from: env.SMTP_FROM,
      to: driver.email,
      subject: `${eventText.subject} · ${bookingId}`,
      html: `<p>
        ${copy.HELLO}${escapeHtml(driver.fullName)},<br><br>
        ${escapeHtml(eventText.body)}<br><br>
        <strong>${escapeHtml(copy.BOOKING_CONFIRMED_SUBJECT_PART1)}:</strong> ${escapeHtml(bookingId)}<br>
        ${car?.name ? `<strong>${escapeHtml(getVehicleLabel(language))}:</strong> ${escapeHtml(car.name)}<br>` : ''}
        ${providerReference}<br><br>
        ${bookingUrl ? `<a href="${escapeHtml(bookingUrl)}">${escapeHtml(copy.BOOKING_CONFIRMED_PART14)}</a><br><br>` : ''}
        ${copy.REGARDS}
      </p>`,
    })

    if (info.messageId === 'mitos-dev-email-disabled') {
      throw new Error('Transactional email transport is disabled (BC_EMAIL_ENABLED=false)')
    }

    await TransactionalEmailDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: TransactionalEmailDeliveryStatus.Sent,
          sentAt: new Date(),
          lastError: undefined,
        },
      },
    )

    return { sent: true, deduplicated: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await TransactionalEmailDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: TransactionalEmailDeliveryStatus.Failed,
          lastError: message,
        },
      },
    )
    throw err
  }
}

/**
 * Persist the delivery intent before returning to the business-state caller,
 * then move the external provider call off the request/webhook critical path.
 * State transitions therefore cannot be rolled back or delayed by email.
 */
export const sendBookingEventEmailNonBlocking = async (args: {
  bookingId: string
  event: TransactionalEmailEvent
  providerPaymentId?: string
}) => {
  try {
    await ensureDelivery(args.bookingId, args.event)

    setImmediate(() => {
      void sendBookingEventEmail(args).catch((err) => {
        logger.error(`[transactionalEmail] ${args.event} failed for booking ${args.bookingId}`, err)
      })
    })

    return { sent: false, deduplicated: false, queued: true }
  } catch (err) {
    logger.error(`[transactionalEmail] Failed to queue ${args.event} for booking ${args.bookingId}`, err)
    return { sent: false, deduplicated: false, queued: false, error: true }
  }
}
