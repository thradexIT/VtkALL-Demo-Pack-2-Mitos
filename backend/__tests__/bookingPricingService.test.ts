import {
  calculateReservationPayment,
  MITOS_RESERVATION_PAYMENT_FLOOR_USD,
  MITOS_RESERVATION_PAYMENT_RATE,
} from '../src/services/mitosReservationPaymentPolicy'

describe('MitoS reservation payment policy', () => {
  const usdToPen = 3.80

  it('uses a USD 35 floor converted to the payment currency', () => {
    expect(MITOS_RESERVATION_PAYMENT_FLOOR_USD).toBe(35)
    expect(MITOS_RESERVATION_PAYMENT_RATE).toBe(0.10)
    const result = calculateReservationPayment(200, usdToPen)
    expect(result.floorAmount).toBe(133)
    expect(result.percentageAmount).toBe(20)
    expect(result.amount).toBe(133)
    expect(result.balanceDue).toBe(67)
  })

  it('uses 10% once the percentage exceeds the converted USD floor', () => {
    const result = calculateReservationPayment(2000, usdToPen)
    expect(result.floorAmount).toBe(133)
    expect(result.percentageAmount).toBe(200)
    expect(result.amount).toBe(200)
    expect(result.balanceDue).toBe(1800)
  })

  it('never charges more than the rental total', () => {
    const result = calculateReservationPayment(100, usdToPen)
    expect(result.amount).toBe(100)
    expect(result.balanceDue).toBe(0)
  })

  it('fails closed for an invalid FX rate', () => {
    expect(() => calculateReservationPayment(200, 0)).toThrow('USD to payment currency rate must be greater than zero')
  })
})
