import { Schema, Types, model } from 'mongoose'

export enum RentalLifecycleState {
  Reserved = 'reserved',
  CheckedOut = 'checked_out',
  Returned = 'returned',
  Closed = 'closed',
}

export interface RentalLifecycleDocument {
  booking: Types.ObjectId
  state: RentalLifecycleState
  checkedOutAt?: Date
  returnedAt?: Date
  closedAt?: Date
  lastTransitionAt: Date
}

const rentalLifecycleSchema = new Schema<RentalLifecycleDocument>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
      index: true,
    },
    state: {
      type: String,
      enum: Object.values(RentalLifecycleState),
      default: RentalLifecycleState.Reserved,
      required: true,
      index: true,
    },
    checkedOutAt: Date,
    returnedAt: Date,
    closedAt: Date,
    lastTransitionAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'RentalLifecycle',
  },
)

const RentalLifecycle = model<RentalLifecycleDocument>('RentalLifecycle', rentalLifecycleSchema)

export default RentalLifecycle
