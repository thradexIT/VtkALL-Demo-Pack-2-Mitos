declare module '@em3rc0d/m-pago/yape' {
  export interface YapeInstrument {
    token: string
    paymentMethodId: 'yape'
    installments: 1
  }

  export function createYapeInstrument(options: {
    publicKey: string
    phoneNumber: string
    otp: string
    MercadoPago?: unknown
  }): Promise<YapeInstrument>
}
