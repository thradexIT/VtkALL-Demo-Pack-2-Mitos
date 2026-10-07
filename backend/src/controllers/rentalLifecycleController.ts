import { Request, Response } from 'express'
import path from 'node:path'
import asyncFs from 'node:fs/promises'
import Booking from '../models/Booking'
import * as env from '../config/env.config'
import i18n from '../lang/i18n'
import * as logger from '../utils/logger'
import { RentalLifecycleState } from '../models/RentalLifecycle'
import { ReservationStatus } from '../models/ReservationState'
import {
  InvalidRentalTransitionError,
  assertRentalTransition,
  canCheckoutReservationStatus,
  closeRentalIfReady,
  getRentalLifecycle as findRentalLifecycle,
  transitionRental,
} from '../services/rentalLifecycleService'
import {
  getReservationState,
  transitionReservation,
} from '../services/reservationStateService'

const sendLifecycleError = (res: Response, err: unknown) => {
  if (err instanceof InvalidRentalTransitionError) {
    res.status(409).send(err.message)
    return true
  }
  return false
}

/**
 * Closing the physical rental is the authoritative completion boundary for a
 * confirmed MITOS reservation. Legacy bookings that have no explicit
 * ReservationState are left untouched rather than inventing history.
 */
const completeReservationIfRentalClosed = async (bookingId: string, lifecycle: any) => {
  if (!lifecycle || lifecycle.state !== RentalLifecycleState.Closed) return

  const reservation = await getReservationState(bookingId)
  if (!reservation || reservation.status !== ReservationStatus.Confirmed) return

  await transitionReservation(bookingId, ReservationStatus.Completed)
}

/**
 * Complete physical vehicle departure and advance the rental lifecycle.
 * Replays are idempotent: repeating checkout for the same booking keeps the
 * lifecycle in checked_out and does not create a second lifecycle record.
 */
export const checkoutDeparture = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const booking = await Booking.findById(id).populate<{ car: env.Car }>('car')
    if (!booking) {
      res.status(404).send('Booking not found')
      return
    }

    // If this booking participates in the new MITOS ReservationState model,
    // physical handover is forbidden until the commercial reservation is
    // confirmed. Legacy bookings without ReservationState remain compatible.
    const reservation = await getReservationState(id)
    if (!canCheckoutReservationStatus(reservation?.status)) {
      res.status(409).send(`Reservation must be confirmed before checkout (current: ${reservation?.status})`)
      return
    }

    await assertRentalTransition(id, RentalLifecycleState.CheckedOut)

    const kmOut = Number(req.body.kmOut)
    const fuelOut = req.body.fuelOut
    const remarksOut = req.body.remarksOut
    const files = req.files as any

    if (!Number.isFinite(kmOut) || kmOut < 0) {
      res.status(400).send('Invalid checkout mileage')
      return
    }

    booking.kmOut = kmOut
    booking.fuelOut = fuelOut
    booking.remarksOut = remarksOut

    if (files && files.length > 0) {
      const picturesOut: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const carName = booking.car ? booking.car.name.replace(/[^a-zA-Z0-9]/g, '-') : 'auto'
        const filename = `${carName}-checkout-${id}-${Date.now()}-${i}${path.extname(file.originalname || '.jpg')}`
        const filepath = path.join(env.CDN_CARS, filename)

        await asyncFs.writeFile(filepath, file.buffer)
        picturesOut.push(`${file.fieldname}|${filename}`)
      }

      booking.picturesOut = picturesOut
    }

    await booking.save()
    await transitionRental(id, RentalLifecycleState.CheckedOut)

    // Preserve the legacy HTTP contract consumed by Admin/LaborSync.
    res.json(booking)
  } catch (err) {
    if (sendLifecycleError(res, err)) {
      return
    }
    logger.error(`[rentalLifecycle.checkoutDeparture] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Complete physical vehicle return and advance the rental lifecycle.
 * A return cannot be accepted before the vehicle has been checked out.
 */
export const checkinReturn = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const booking = await Booking.findById(id).populate<{ car: env.Car }>('car')
    if (!booking) {
      res.status(404).send('Booking not found')
      return
    }

    await assertRentalTransition(id, RentalLifecycleState.Returned)

    const kmIn = Number(req.body.kmIn)
    const fuelIn = req.body.fuelIn
    const remarksIn = req.body.remarksIn
    const files = req.files as any

    if (!Number.isFinite(kmIn) || kmIn < 0) {
      res.status(400).send('Invalid return mileage')
      return
    }
    if (booking.kmOut !== undefined && kmIn < booking.kmOut) {
      res.status(400).send('Return mileage cannot be lower than checkout mileage')
      return
    }

    booking.kmIn = kmIn
    booking.fuelIn = fuelIn
    booking.remarksIn = remarksIn

    if (files && files.length > 0) {
      const picturesIn: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const carName = booking.car ? booking.car.name.replace(/[^a-zA-Z0-9]/g, '-') : 'auto'
        const filename = `${carName}-checkin-${id}-${Date.now()}-${i}${path.extname(file.originalname || '.jpg')}`
        const filepath = path.join(env.CDN_CARS, filename)

        await asyncFs.writeFile(filepath, file.buffer)
        picturesIn.push(`${file.fieldname}|${filename}`)
      }

      booking.picturesIn = picturesIn
    }

    await booking.save()
    await transitionRental(id, RentalLifecycleState.Returned)
    const lifecycle = await closeRentalIfReady(id, booking)
    await completeReservationIfRentalClosed(id, lifecycle)

    // Preserve the legacy HTTP contract consumed by Admin/LaborSync.
    res.json(booking)
  } catch (err) {
    if (sendLifecycleError(res, err)) {
      return
    }
    logger.error(`[rentalLifecycle.checkinReturn] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Verify checkout/check-in evidence. Once both evidence sets are verified and
 * the vehicle has returned, the lifecycle closes automatically.
 */
export const verifyInspection = async (req: Request, res: Response) => {
  const { id } = req.params
  const {
    picturesOutVerified,
    picturesInVerified,
    verificationRemarks,
  } = req.body

  try {
    const booking = await Booking.findById(id)
    if (!booking) {
      res.status(404).send('Booking not found')
      return
    }

    if (picturesOutVerified !== undefined) {
      booking.picturesOutVerified = picturesOutVerified
    }
    if (picturesInVerified !== undefined) {
      booking.picturesInVerified = picturesInVerified
    }
    if (verificationRemarks !== undefined) {
      booking.verificationRemarks = verificationRemarks
    }

    await booking.save()
    const lifecycle = await closeRentalIfReady(id, booking)
    await completeReservationIfRentalClosed(id, lifecycle)

    const updatedBooking = await Booking.findById(id)
      .populate<{ supplier: env.UserInfo }>('supplier')
      .populate<{ car: env.CarInfo }>({
        path: 'car',
        populate: {
          path: 'supplier',
          model: 'User',
        },
      })
      .populate<{ driver: env.User }>('driver')
      .populate<{ pickupLocation: env.LocationInfo }>({
        path: 'pickupLocation',
        populate: {
          path: 'values',
          model: 'LocationValue',
        },
      })
      .populate<{ dropOffLocation: env.LocationInfo }>({
        path: 'dropOffLocation',
        populate: {
          path: 'values',
          model: 'LocationValue',
        },
      })
      .populate<{ _additionalDriver: env.AdditionalDriver }>('_additionalDriver')
      .lean()

    // Preserve the legacy HTTP contract consumed by Admin/LaborSync.
    res.json(updatedBooking)
  } catch (err) {
    if (sendLifecycleError(res, err)) {
      return
    }
    logger.error(`[rentalLifecycle.verifyInspection] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Read the operational rental state. Before first departure the state is
 * implicitly reserved, so consumers can rely on a stable lifecycle contract.
 */
export const getRentalLifecycle = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const booking = await Booking.exists({ _id: id })
    if (!booking) {
      res.status(404).send('Booking not found')
      return
    }

    const lifecycle = await findRentalLifecycle(id)
    if (!lifecycle) {
      res.json({
        booking: id,
        state: RentalLifecycleState.Reserved,
        implicit: true,
      })
      return
    }

    res.json(lifecycle)
  } catch (err) {
    logger.error(`[rentalLifecycle.getRentalLifecycle] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}
