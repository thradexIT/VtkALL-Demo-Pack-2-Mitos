const routes = {
  create: '/api/create-booking',
  checkout: '/api/checkout',
  update: '/api/update-booking',
  updateStatus: '/api/update-booking-status',
  delete: '/api/delete-bookings',
  deleteTempBooking: '/api/delete-temp-booking/:bookingId/:sessionId',
  getBooking: '/api/booking/:id/:language',
  getBookingId: '/api/booking-id/:sessionId',
  getBookings: '/api/bookings/:page/:size/:language',
  getAdminBookingSuppliers: '/api/admin-booking-suppliers',
  hasBookings: '/api/has-bookings/:driver',
  cancelBooking: '/api/cancel-booking/:id',
  purchaseOrder: '/api/bookings/purchase-order/:id',
  checkoutReportPdf: '/api/bookings/checkout-report/:id',
  checkoutDeparture: '/api/checkout-departure/:id',
  checkinReturn: '/api/checkin-return/:id',
  saveSignatures: '/api/booking-signatures/:id',
  verifyInspection: '/api/verify-inspection/:id',
  getRentalLifecycle: '/api/rental-lifecycle/:id',
}

export default routes
