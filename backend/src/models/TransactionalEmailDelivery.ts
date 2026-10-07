import { Schema, Types, model } from 'mongoose'

export enum TransactionalEmailEvent {
  ReservationReceived = 'reservation_received',
  PaymentApproved = 'payment_approved',
  ReservationConfirmed = 'reservation_confirmed',
  CancellationRequested = 'cancellation_requested',
  ReservationCancelled = 'reservation_cancelled',
}

export enum TransactionalEmailDeliveryStatus {
  Pending = 'pending',
  Sending = 'sending',
  Sent = 'sent',
  Failed = 'failed',
}

export interface TransactionalEmailDeliveryDocument {
  booking: Types.ObjectId
  event: TransactionalEmailEvent
  status: TransactionalEmailDeliveryStatus
  attempts: number
  lastAttemptAt?: Date
  sentAt?: Date
  lastError?: string
}

const transactionalEmailDeliverySchema = new Schema<TransactionalEmailDeliveryDocument>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    event: {
      type: String,
      enum: Object.values(TransactionalEmailEvent),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TransactionalEmailDeliveryStatus),
      required: true,
      default: TransactionalEmailDeliveryStatus.Pending,
      index: true,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
    },
    lastAttemptAt: Date,
    sentAt: Date,
    lastError: String,
  },
  {
    timestamps: true,
    strict: true,
    collection: 'TransactionalEmailDelivery',
  },
)

transactionalEmailDeliverySchema.index(
  { booking: 1, event: 1 },
  { unique: true },
)

const TransactionalEmailDelivery = model<TransactionalEmailDeliveryDocument>(
  'TransactionalEmailDelivery',
  transactionalEmailDeliverySchema,
)

export default TransactionalEmailDelivery
