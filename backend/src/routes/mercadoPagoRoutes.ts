import express from 'express'
import routeNames from '../config/mercadoPagoRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as mercadoPagoController from '../controllers/mercadoPagoController'

const routes = express.Router()

// Public to support guest checkout. The caller must present the persisted
// reservation session id; pricing is always recalculated server-side.
routes.route(routeNames.quotePayment).get(mercadoPagoController.quotePayment)

// Public to support guest checkout. Security comes from the persisted booking,
// reservation session id, server-owned amount and provider idempotency key, not
// from client-supplied pricing data.
routes.route(routeNames.createPayment).post(mercadoPagoController.createPayment)

// Mercado Pago calls this endpoint directly; provider signature validation is
// performed inside the controller before any event is processed.
routes.route(routeNames.webhook).post(mercadoPagoController.webhook)

// Manual/provider reconciliation is an authenticated backoffice operation.
routes.route(routeNames.reconcilePayment).post(authJwt.verifyToken, mercadoPagoController.reconcilePayment)

export default routes
