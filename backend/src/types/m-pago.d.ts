declare module '@em3rc0d/m-pago' {
  export interface PaymentContext {
    tenantId: string
    userId: string
    role?: string
  }
  export interface PublicPayment {
    id: string
    tenantId: string
    payableId: string
    providerId: string | null
    status: string
    amountMinor: number
    currency: string
    paymentMethodId: string
    refundedMinor: number
    version: number
  }
  export class PaymentError extends Error {
    code: string
    status: number
    constructor(code: string, status?: number)
  }
  export class SQLitePaymentStore {
    constructor(filename: string)
    close(): void
  }
  export class MercadoPagoAdapter {
    readonly account: {
      collectorId: string
      currency: string
      exponent: number
      liveMode: boolean
      environment: 'test' | 'live'
    }
    constructor(options: {
      accessToken: string
      currency: string
      exponent?: number
      collectorId: string
      environment: 'test' | 'live'
      allowLive?: boolean
      timeoutMs?: number
    })
  }
  export class PaymentService {
    constructor(options: {
      store: SQLitePaymentStore
      provider: MercadoPagoAdapter
      resolveQuote: (context: PaymentContext, payableId: string) => Promise<any>
      authorizeOperator: (context: PaymentContext, action: string) => Promise<boolean> | boolean
      webhookSecret: string
    })
    create(context: PaymentContext, command: any): Promise<PublicPayment>
    get(context: PaymentContext, command: { payableId: string, paymentId: string }): Promise<PublicPayment>
    webhook(command: { url: string, headers: any }): Promise<{ received: boolean, matched: boolean }>
    reconcile(context: PaymentContext, paymentId: string): Promise<PublicPayment>
    dispatchEvents(context: PaymentContext, handler: (event: any) => Promise<void>, options?: { limit?: number }): Promise<any>
  }
}
