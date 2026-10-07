import express from 'express'
import routeNames from '../config/mercadoPagoRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as mercadoPagoController from '../controllers/mercadoPagoController'

const routes = express.Router()

// Guest checkout endpoints are bound to the persisted reservation session.
routes.route(routeNames.quotePayment).get(mercadoPagoController.quotePayment)
routes.route(routeNames.createPayment).post(mercadoPagoController.createPayment)
routes.route(routeNames.getPayment).get(mercadoPagoController.getPayment)

// Provider webhook authenticity/idempotency is enforced by the canonical m-pago boundary.
routes.route(routeNames.webhook).post(mercadoPagoController.webhook)

// Reconciliation mutates provider/payment truth and remains backoffice-only.
routes.route(routeNames.reconcilePayment).post(authJwt.verifyBackofficeToken, mercadoPagoController.reconcilePayment)

export default routes
