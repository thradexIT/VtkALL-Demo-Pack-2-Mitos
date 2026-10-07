export default {
  createPayment: '/api/create-mercadopago-payment',
  quotePayment: '/api/mercadopago/quote/:bookingId/:sessionId',
  webhook: '/api/mercadopago/webhook',
  reconcilePayment: '/api/mercadopago/reconcile/:paymentId',
}
