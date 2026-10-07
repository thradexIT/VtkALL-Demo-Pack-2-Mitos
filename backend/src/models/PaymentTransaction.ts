import { Schema, Types, model } from 'mongoose'

export enum PaymentStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Refunded = 'refunded',
  Failed = 'failed',
}

export enum PaymentProvider {
  MercadoPago = 'mercado_pago',
}

export interface PaymentTransactionDocument {
  booking: Types.ObjectId
  provider: PaymentProvider
  providerPaymentId?: string
  externalReference: string
  idempotencyKey: string
  status: PaymentStatus
  statusDetail?: string
  amount: number
  currency: string
  paymentMethodId?: string
  lastProviderSyncAt?: Date
  approvedAt?: Date
  processedApprovalAt?: Date
}

const paymentTransactionSchema = new Schema<PaymentTransactionDocument>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
      index: true,
    },
    providerPaymentId: {
      type: String,
      index: true,
      sparse: true,
    },
    externalReference: {
      type: String,
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      required: true,
      default: PaymentStatus.Pending,
      index: true,
    },
    statusDetail: String,
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
    },
    paymentMethodId: String,
    lastProviderSyncAt: Date,
    approvedAt: Date,
    processedApprovalAt: Date,
  },
  {
    timestamps: true,
    strict: true,
    collection: 'PaymentTransaction',
  },
)

paymentTransactionSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, sparse: true },
)

const PaymentTransaction = model<PaymentTransactionDocument>('PaymentTransaction', paymentTransactionSchema)

export default PaymentTransaction
