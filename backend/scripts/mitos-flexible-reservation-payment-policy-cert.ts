import assert from 'node:assert/strict'
import {
  calculateReservationPayment,
  MITOS_RESERVATION_PAYMENT_FLOOR_USD,
  MITOS_RESERVATION_PAYMENT_RATE,
} from '../src/services/mitosReservationPaymentPolicy'

assert.equal(MITOS_RESERVATION_PAYMENT_FLOOR_USD, 35)
assert.equal(MITOS_RESERVATION_PAYMENT_RATE, 0.10)

const fx = 3.80
const low = calculateReservationPayment(200, fx)
assert.equal(low.floorAmount, 133)
assert.equal(low.percentageAmount, 20)
assert.equal(low.amount, 133)
assert.equal(low.balanceDue, 67)

const threshold = calculateReservationPayment(1330, fx)
assert.equal(threshold.amount, 133)
assert.equal(threshold.balanceDue, 1197)

const high = calculateReservationPayment(2000, fx)
assert.equal(high.percentageAmount, 200)
assert.equal(high.amount, 200)
assert.equal(high.balanceDue, 1800)

const capped = calculateReservationPayment(100, fx)
assert.equal(capped.amount, 100)
assert.equal(capped.balanceDue, 0)

assert.equal(calculateReservationPayment(0, fx).amount, 0)
assert.throws(() => calculateReservationPayment(100, 0), /greater than zero/)

console.log('[mitos-flexible-payment] USD-floor policy certification passed')
