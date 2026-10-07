export default {
  createPayment: '/api/create-mercadopago-payment',
  quotePayment: '/api/mercadopago/quote/:bookingId/:sessionId',
  getPayment: '/api/mercadopago/payment/:bookingId/:sessionId/:paymentId',
  webhook: '/api/mercadopago/webhook',
  reconcilePayment: '/api/mercadopago/reconcile/:paymentId',
}
