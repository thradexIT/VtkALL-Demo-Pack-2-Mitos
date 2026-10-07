import { Types } from 'mongoose'
import RentalLifecycle, { RentalLifecycleState } from '../models/RentalLifecycle'
import { ReservationStatus } from '../models/ReservationState'

const transitionMap: Record<RentalLifecycleState, RentalLifecycleState[]> = {
  [RentalLifecycleState.Reserved]: [RentalLifecycleState.CheckedOut],
  [RentalLifecycleState.CheckedOut]: [RentalLifecycleState.Returned],
  [RentalLifecycleState.Returned]: [RentalLifecycleState.Closed],
  [RentalLifecycleState.Closed]: [],
}

export class InvalidRentalTransitionError extends Error {
  constructor(current: RentalLifecycleState, next: RentalLifecycleState) {
    super(`Invalid rental lifecycle transition: ${current} -> ${next}`)
    this.name = 'InvalidRentalTransitionError'
  }
}

export const canTransitionRental = (current: RentalLifecycleState, next: RentalLifecycleState) => {
  if (current === next) {
    return true
  }

  return transitionMap[current].includes(next)
}

/**
 * New MITOS reservations must be commercially confirmed before vehicle
 * handover. Undefined is intentionally accepted for pre-MITOS/legacy bookings
 * that have no ReservationState yet, preserving inherited Admin/LaborSync
 * compatibility during migration.
 */
export const canCheckoutReservationStatus = (status?: ReservationStatus) => (
  status === undefined || status === ReservationStatus.Confirmed
)

export const getRentalLifecycle = async (bookingId: string) => RentalLifecycle.findOne({
  booking: new Types.ObjectId(bookingId),
})

export const assertRentalTransition = async (bookingId: string, next: RentalLifecycleState) => {
  const lifecycle = await getRentalLifecycle(bookingId)
  const current = lifecycle?.state || RentalLifecycleState.Reserved

  if (!canTransitionRental(current, next)) {
    throw new InvalidRentalTransitionError(current, next)
  }

  return lifecycle
}

export const transitionRental = async (bookingId: string, next: RentalLifecycleState) => {
  let lifecycle = await assertRentalTransition(bookingId, next)
  const now = new Date()

  if (!lifecycle) {
    lifecycle = new RentalLifecycle({
      booking: new Types.ObjectId(bookingId),
      state: RentalLifecycleState.Reserved,
      lastTransitionAt: now,
    })
  }

  // Idempotent replay: returning the current lifecycle is safe.
  if (lifecycle.state === next) {
    return lifecycle
  }

  lifecycle.state = next
  lifecycle.lastTransitionAt = now

  if (next === RentalLifecycleState.CheckedOut) {
    lifecycle.checkedOutAt = lifecycle.checkedOutAt || now
  }
  if (next === RentalLifecycleState.Returned) {
    lifecycle.returnedAt = lifecycle.returnedAt || now
  }
  if (next === RentalLifecycleState.Closed) {
    lifecycle.closedAt = lifecycle.closedAt || now
  }

  await lifecycle.save()
  return lifecycle
}

export const closeRentalIfReady = async (
  bookingId: string,
  evidence: { picturesOutVerified?: boolean; picturesInVerified?: boolean },
) => {
  if (!evidence.picturesOutVerified || !evidence.picturesInVerified) {
    return getRentalLifecycle(bookingId)
  }

  const lifecycle = await getRentalLifecycle(bookingId)
  if (!lifecycle || lifecycle.state !== RentalLifecycleState.Returned) {
    return lifecycle
  }

  return transitionRental(bookingId, RentalLifecycleState.Closed)
}
