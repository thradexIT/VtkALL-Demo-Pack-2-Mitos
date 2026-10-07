import { Schema, Types, model } from 'mongoose'

export enum ReservationStatus {
  Pending = 'pending',
  AwaitingPayment = 'awaiting_payment',
  Confirmed = 'confirmed',
  Cancelled = 'cancelled',
  Completed = 'completed',
}

export interface ReservationStateDocument {
  booking: Types.ObjectId
  status: ReservationStatus
  confirmedAt?: Date
  cancelledAt?: Date
  completedAt?: Date
  lastTransitionAt: Date
}

const reservationStateSchema = new Schema<ReservationStateDocument>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ReservationStatus),
      required: true,
      default: ReservationStatus.Pending,
      index: true,
    },
    confirmedAt: Date,
    cancelledAt: Date,
    completedAt: Date,
    lastTransitionAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'ReservationState',
  },
)

const ReservationState = model<ReservationStateDocument>('ReservationState', reservationStateSchema)

export default ReservationState
