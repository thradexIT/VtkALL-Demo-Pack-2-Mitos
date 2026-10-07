import { Types } from 'mongoose'
import ReservationState, { ReservationStatus } from '../models/ReservationState'

const transitions: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.Pending]: [
    ReservationStatus.AwaitingPayment,
    ReservationStatus.Confirmed,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.AwaitingPayment]: [
    ReservationStatus.Confirmed,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.Confirmed]: [
    ReservationStatus.Cancelled,
    ReservationStatus.Completed,
  ],
  [ReservationStatus.Cancelled]: [],
  [ReservationStatus.Completed]: [],
}

export class InvalidReservationTransitionError extends Error {
  constructor(current: ReservationStatus, next: ReservationStatus) {
    super(`Invalid reservation transition: ${current} -> ${next}`)
    this.name = 'InvalidReservationTransitionError'
  }
}

export const canTransitionReservation = (current: ReservationStatus, next: ReservationStatus) => (
  current === next || transitions[current].includes(next)
)

export const getReservationState = async (bookingId: string) => ReservationState.findOne({
  booking: new Types.ObjectId(bookingId),
})

export const ensureReservationState = async (
  bookingId: string,
  initialStatus: ReservationStatus = ReservationStatus.Pending,
) => ReservationState.findOneAndUpdate(
  { booking: new Types.ObjectId(bookingId) },
  {
    $setOnInsert: {
      booking: new Types.ObjectId(bookingId),
      status: initialStatus,
      lastTransitionAt: new Date(),
    },
  },
  { upsert: true, new: true, setDefaultsOnInsert: true },
)

export const transitionReservation = async (bookingId: string, next: ReservationStatus) => {
  const state = await ensureReservationState(bookingId)

  if (!canTransitionReservation(state.status, next)) {
    throw new InvalidReservationTransitionError(state.status, next)
  }

  if (state.status === next) {
    return state
  }

  const now = new Date()
  state.status = next
  state.lastTransitionAt = now

  if (next === ReservationStatus.Confirmed) {
    state.confirmedAt = state.confirmedAt || now
  }
  if (next === ReservationStatus.Cancelled) {
    state.cancelledAt = state.cancelledAt || now
  }
  if (next === ReservationStatus.Completed) {
    state.completedAt = state.completedAt || now
  }

  await state.save()
  return state
}
