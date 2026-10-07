import axiosInstance from './axiosInstance'

export interface MercadoPagoQuote {
  bookingId: string
  amount: number
  currency: string
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

export interface MercadoPagoPaymentResponse {
  bookingId: string
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'failed'
  id?: string
  qr_code_base64?: string
  qr_code?: string
  external_resource_url?: string
  idempotentReplay?: boolean
}

/**
 * Minimal subset of Payment Brick form data that MitoS is allowed to consume.
 * Intentionally no catch-all index signature: browser-only fields such as
 * `amount` must not become part of the backend payment contract accidentally.
 */
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

/**
 * Submit only tokenized provider data plus the persisted reservation identity.
 * Browser-computed amount/currency are deliberately excluded: the backend owns
 * pricing and sends transaction_amount to Mercado Pago.
 */
export const createPayment = ({
  bookingId,
  reservationSessionId,
  formData,
  payerEmail,
  idempotencyKey,
}: {
  bookingId: string
  reservationSessionId: string
  formData: MercadoPagoBrickFormData
  payerEmail: string
  idempotencyKey: string
}): Promise<MercadoPagoPaymentResponse> => {
  const identification = formData.payer?.identification

  return axiosInstance
    .post(
      '/api/create-mercadopago-payment',
      {
        bookingId,
        reservationSessionId,
        token: formData.token,
        installments: formData.installments,
        paymentMethodId: formData.payment_method_id,
        issuerId: formData.issuer_id,
        payer: {
          email: payerEmail,
          ...(identification?.type && identification?.number
            ? {
                identification: {
                  docType: identification.type,
                  docNumber: identification.number,
                },
              }
            : {}),
        },
      },
      {
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
      },
    )
    .then((res) => res.data)
}

export const reconcilePayment = (paymentId: string): Promise<MercadoPagoPaymentResponse> =>
  axiosInstance
    .post(
      `/api/mercadopago/reconcile/${encodeURIComponent(paymentId)}`,
      null,
      { withCredentials: true },
    )
    .then((res) => res.data)
