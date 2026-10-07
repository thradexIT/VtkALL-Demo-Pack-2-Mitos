import axiosInstance from './axiosInstance'

export interface MercadoPagoQuote {
  bookingId: string
  amount: number
  amountMinor?: number
  currency: string
  exponent?: number
  version?: string
  rentalPrice: number
  balanceDue: number
  paymentPlan: 'reservation' | 'full' | 'online'
  reservationPolicy?: {
    amount: number
    balanceDue: number
    floorUsd: number
    floorAmount: number
    percentageRate: number
    percentageAmount: number
    usdToPaymentCurrencyRate: number
  }
}

export type MercadoPagoPaymentStatus =
  | 'creating'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'charged_back'
  | 'in_mediation'
  | 'unknown'

export interface MercadoPagoPaymentResponse {
  bookingId?: string
  status: MercadoPagoPaymentStatus
  paymentId?: string
  id?: string
  providerId?: string
  amountMinor?: number
  currency?: string
  paymentMethodId?: string
  refundedMinor?: number
  version?: number
  // Legacy fields kept for backward-compatible rendering; canonical m-pago
  // Yape uses tokenized instruments instead of exposing QR payloads here.
  qr_code_base64?: string
  qr_code?: string
  external_resource_url?: string
  idempotentReplay?: boolean
}

export interface MercadoPagoInstrument {
  token: string
  paymentMethodId: string
  installments: number
  issuerId?: string
}

export interface MercadoPagoBrickFormData {
  token?: string
  installments?: number
  payment_method_id?: string
  issuer_id?: string
  payer?: {
    email?: string
    identification?: {
      type?: string
      number?: string
    }
  }
}

export const quotePayment = (
  bookingId: string,
  reservationSessionId: string,
): Promise<MercadoPagoQuote> =>
  axiosInstance
    .get(
      `/api/mercadopago/quote/${encodeURIComponent(bookingId)}/${encodeURIComponent(reservationSessionId)}`,
    )
    .then((res) => res.data)

export const createInstrumentPayment = ({
  bookingId,
  reservationSessionId,
  instrument,
  idempotencyKey,
}: {
  bookingId: string
  reservationSessionId: string
  instrument: MercadoPagoInstrument
  idempotencyKey: string
}): Promise<MercadoPagoPaymentResponse> =>
  axiosInstance
    .post(
      '/api/create-mercadopago-payment',
      {
        bookingId,
        reservationSessionId,
        instrument,
      },
      {
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
      },
    )
    .then((res) => res.data)

export const createPayment = ({
  bookingId,
  reservationSessionId,
  formData,
  idempotencyKey,
}: {
  bookingId: string
  reservationSessionId: string
  formData: MercadoPagoBrickFormData
  payerEmail?: string
  idempotencyKey: string
}): Promise<MercadoPagoPaymentResponse> => {
  if (!formData.token || !formData.payment_method_id) {
    return Promise.reject(new Error('INVALID_PAYMENT_INSTRUMENT'))
  }

  return createInstrumentPayment({
    bookingId,
    reservationSessionId,
    idempotencyKey,
    instrument: {
      token: formData.token,
      paymentMethodId: formData.payment_method_id,
      installments: Number(formData.installments || 1),
      ...(formData.issuer_id ? { issuerId: formData.issuer_id } : {}),
    },
  })
}

export const getPayment = (
  bookingId: string,
  reservationSessionId: string,
  paymentId: string,
): Promise<MercadoPagoPaymentResponse> =>
  axiosInstance
    .get(
      `/api/mercadopago/payment/${encodeURIComponent(bookingId)}/${encodeURIComponent(reservationSessionId)}/${encodeURIComponent(paymentId)}`,
    )
    .then((res) => res.data)

export const reconcilePayment = (paymentId: string): Promise<MercadoPagoPaymentResponse> =>
  axiosInstance
    .post(
      `/api/mercadopago/reconcile/${encodeURIComponent(paymentId)}`,
      null,
      { withCredentials: true },
    )
    .then((res) => res.data)
