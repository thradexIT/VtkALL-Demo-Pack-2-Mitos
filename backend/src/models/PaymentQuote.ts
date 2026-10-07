import { Schema, Types, model } from 'mongoose'

export interface PaymentQuoteDocument {
  booking: Types.ObjectId
  user: Types.ObjectId
  amountMinor: number
  currency: string
  exponent: number
  version: string
  description: string
  payerEmail: string
}

const paymentQuoteSchema = new Schema<PaymentQuoteDocument>(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true },
    exponent: { type: Number, required: true, min: 0, max: 3 },
    version: { type: String, required: true },
    description: { type: String, required: true },
    payerEmail: { type: String, required: true },
  },
  { timestamps: true, strict: true, collection: 'PaymentQuote' },
)

const PaymentQuote = model<PaymentQuoteDocument>('PaymentQuote', paymentQuoteSchema)
export default PaymentQuote
