import { Types } from 'mongoose'
import PaymentTransaction, {
  PaymentProvider,
  PaymentStatus,
} from '../models/PaymentTransaction'

export const mapMercadoPagoStatus = (status?: string): PaymentStatus => {
  switch ((status || '').toLowerCase()) {
    case 'approved':
      return PaymentStatus.Approved
    case 'rejected':
    case 'cancelled':
      return PaymentStatus.Rejected
    case 'refunded':
    case 'charged_back':
      return PaymentStatus.Refunded
    case 'pending':
    case 'in_process':
    case 'in_mediation':
    case 'authorized':
      return PaymentStatus.Pending
    default:
      return PaymentStatus.Failed
  }
}

export const isActivePaymentStatus = (status: PaymentStatus) => (
  status === PaymentStatus.Pending || status === PaymentStatus.Approved
)

export const getMercadoPagoActiveKey = (bookingId: string) => (
  `${PaymentProvider.MercadoPago}:${bookingId}`
)

export const getMercadoPagoPaymentByBooking = async (bookingId: string) => PaymentTransaction.findOne({
  booking: new Types.ObjectId(bookingId),
  provider: PaymentProvider.MercadoPago,
})

export const getMercadoPagoPaymentByProviderId = async (providerPaymentId: string) => PaymentTransaction.findOne({
  provider: PaymentProvider.MercadoPago,
  providerPaymentId,
})

export const upsertMercadoPagoPayment = async ({
  bookingId,
  providerPaymentId,
  externalReference,
  idempotencyKey,
  providerStatus,
  statusDetail,
  amount,
  currency,
  paymentMethodId,
}: {
  bookingId: string
  providerPaymentId?: string
  externalReference: string
  idempotencyKey: string
  providerStatus?: string
  statusDetail?: string
  amount: number
  currency: string
  paymentMethodId?: string
}) => {
  const status = mapMercadoPagoStatus(providerStatus)
  const now = new Date()
  const active = isActivePaymentStatus(status)

  const update: Record<string, unknown> = {
    $setOnInsert: {
      booking: new Types.ObjectId(bookingId),
      provider: PaymentProvider.MercadoPago,
      externalReference,
      idempotencyKey,
      amount,
      currency,
    },
    $set: {
      ...(providerPaymentId ? { providerPaymentId } : {}),
      status,
      statusDetail,
      paymentMethodId,
      lastProviderSyncAt: now,
      ...(status === PaymentStatus.Approved ? { approvedAt: now } : {}),
      ...(active ? { activeKey: getMercadoPagoActiveKey(bookingId) } : {}),
    },
  }

  if (!active) {
    update.$unset = { activeKey: 1 }
  }

  const transaction = await PaymentTransaction.findOneAndUpdate(
    { idempotencyKey },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  return transaction
}
