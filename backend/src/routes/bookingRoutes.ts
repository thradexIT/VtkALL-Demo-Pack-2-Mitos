import express from 'express'
import multer from 'multer'
import routeNames from '../config/bookingRoutes.config'
import authJwt from '../middlewares/authJwt'
import { reuseCheckoutSession } from '../middlewares/idempotentCheckout'
import {
  cancellationRequestedEmail,
  reservationCancelledOnBulkUpdate,
  reservationCancelledOnUpdate,
  reservationReceivedEmail,
} from '../middlewares/transactionalEmailEvents'
import * as bookingController from '../controllers/bookingController'
import * as rentalLifecycleController from '../controllers/rentalLifecycleController'
import * as adminBookingSupplierController from '../controllers/adminBookingSupplierController'

const routes = express.Router()

routes.route(routeNames.create).post(authJwt.verifyToken, bookingController.create)
routes.route(routeNames.checkout).post(
  reservationReceivedEmail,
  reuseCheckoutSession,
  bookingController.checkout,
)
routes.route(routeNames.update).put(
  authJwt.verifyToken,
  reservationCancelledOnUpdate,
  bookingController.update,
)
routes.route(routeNames.updateStatus).post(
  authJwt.verifyToken,
  reservationCancelledOnBulkUpdate,
  bookingController.updateStatus,
)
routes.route(routeNames.delete).post(authJwt.verifyToken, bookingController.deleteBookings)
routes.route(routeNames.deleteTempBooking).delete(bookingController.deleteTempBooking)
routes.route(routeNames.getBooking).get(bookingController.getBooking)
routes.route(routeNames.getBookingId).get(bookingController.getBookingId)
routes.route(routeNames.getBookings).post(authJwt.verifyToken, bookingController.getBookings)
routes.route(routeNames.getAdminBookingSuppliers).get(authJwt.verifyToken, adminBookingSupplierController.getAdminBookingSuppliers)
routes.route(routeNames.hasBookings).get(authJwt.verifyToken, bookingController.hasBookings)
routes.route(routeNames.cancelBooking).post(
  authJwt.verifyToken,
  cancellationRequestedEmail,
  bookingController.cancelBooking,
)
routes.route(routeNames.purchaseOrder).get(bookingController.downloadPurchaseOrder)
routes.route(routeNames.checkoutReportPdf).get(bookingController.downloadCheckoutReport)
routes.route(routeNames.checkoutDeparture).post(
  [authJwt.verifyToken, multer({ storage: multer.memoryStorage() }).any()],
  rentalLifecycleController.checkoutDeparture,
)
routes.route(routeNames.checkinReturn).post(
  [authJwt.verifyToken, multer({ storage: multer.memoryStorage() }).any()],
  rentalLifecycleController.checkinReturn,
)
routes.route(routeNames.saveSignatures).patch(authJwt.verifyToken, bookingController.saveSignatures)
routes.route(routeNames.verifyInspection).post(authJwt.verifyToken, rentalLifecycleController.verifyInspection)
routes.route(routeNames.getRentalLifecycle).get(authJwt.verifyToken, rentalLifecycleController.getRentalLifecycle)

export default routes
