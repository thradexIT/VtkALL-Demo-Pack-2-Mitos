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
  /**
   * Distributed concurrency claim for an active provider payment.
   *
   * Only pending/approved transactions carry this value. The unique sparse
   * index makes MongoDB the serialization point for concurrent payment-create
   * requests across processes/instances, rather than relying on an in-memory
   * lock or a racy read-before-write check.
   */
  activeKey?: string
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
    activeKey: {
      type: String,
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

// At most one active Mercado Pago payment may exist for a reservation.
// Terminal transactions unset activeKey, allowing a legitimate later retry.
paymentTransactionSchema.index(
  { activeKey: 1 },
  { unique: true, sparse: true },
)

const PaymentTransaction = model<PaymentTransactionDocument>('PaymentTransaction', paymentTransactionSchema)

export default PaymentTransaction
