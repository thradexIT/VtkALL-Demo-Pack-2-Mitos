const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const MITOS_RESERVATION_PAYMENT_FLOOR_USD = 35
export const MITOS_RESERVATION_PAYMENT_RATE = 0.10

export interface MitosReservationPaymentPolicy {
  amount: number
  balanceDue: number
  floorUsd: number
  floorAmount: number
  percentageRate: number
  percentageAmount: number
  usdToPaymentCurrencyRate: number
}

/**
 * MitoS reservation payment policy.
 *
 * The business floor is denominated in USD, while Mercado Pago Peru charges
 * in the configured payment currency (currently PEN). The caller must provide
 * the authoritative USD -> payment-currency rate. That rate is snapshotted on
 * the booking by bookingPricingService so later provider reconciliation does
 * not drift when FX changes.
 */
export const calculateReservationPayment = (
  rentalPrice: number,
  usdToPaymentCurrencyRate: number,
): MitosReservationPaymentPolicy => {
  const normalizedRentalPrice = money(Number(rentalPrice))
  const normalizedFxRate = Number(usdToPaymentCurrencyRate)

  if (!(normalizedRentalPrice > 0)) {
    return {
      amount: 0,
      balanceDue: 0,
      floorUsd: MITOS_RESERVATION_PAYMENT_FLOOR_USD,
      floorAmount: 0,
      percentageRate: MITOS_RESERVATION_PAYMENT_RATE,
      percentageAmount: 0,
      usdToPaymentCurrencyRate: normalizedFxRate,
    }
  }

  if (!Number.isFinite(normalizedFxRate) || normalizedFxRate <= 0) {
    throw new Error('USD to payment currency rate must be greater than zero')
  }

  const floorAmount = money(MITOS_RESERVATION_PAYMENT_FLOOR_USD * normalizedFxRate)
  const percentageAmount = money(normalizedRentalPrice * MITOS_RESERVATION_PAYMENT_RATE)
  const amount = money(Math.min(normalizedRentalPrice, Math.max(floorAmount, percentageAmount)))

  return {
    amount,
    balanceDue: money(Math.max(normalizedRentalPrice - amount, 0)),
    floorUsd: MITOS_RESERVATION_PAYMENT_FLOOR_USD,
    floorAmount,
    percentageRate: MITOS_RESERVATION_PAYMENT_RATE,
    percentageAmount,
    usdToPaymentCurrencyRate: normalizedFxRate,
  }
}
