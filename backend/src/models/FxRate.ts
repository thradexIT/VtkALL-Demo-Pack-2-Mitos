import { Schema, model } from 'mongoose'

export interface FxRateDocument {
  pair: string
  base: string
  quote: string
  rate: number
  provider: string
  providerDate?: string
  fetchedAt: Date
}

const fxRateSchema = new Schema<FxRateDocument>(
  {
    pair: { type: String, required: true, unique: true, index: true },
    base: { type: String, required: true },
    quote: { type: String, required: true },
    rate: { type: Number, required: true, min: 0.000001 },
    provider: { type: String, required: true },
    providerDate: { type: String },
    fetchedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, strict: true, collection: 'FxRate' },
)

const FxRate = model<FxRateDocument>('FxRate', fxRateSchema)
export default FxRate
