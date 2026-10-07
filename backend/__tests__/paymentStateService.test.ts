import { mapMercadoPagoStatus } from '../src/services/paymentStateService'
import { PaymentStatus } from '../src/models/PaymentTransaction'
import {
  InvalidReservationTransitionError,
  canTransitionReservation,
} from '../src/services/reservationStateService'
import { ReservationStatus } from '../src/models/ReservationState'

describe('MitoS payment states', () => {
  it('maps Mercado Pago provider states to the frozen MitoS contract', () => {
    expect(mapMercadoPagoStatus('approved')).toBe(PaymentStatus.Approved)
    expect(mapMercadoPagoStatus('pending')).toBe(PaymentStatus.Pending)
    expect(mapMercadoPagoStatus('in_process')).toBe(PaymentStatus.Pending)
    expect(mapMercadoPagoStatus('rejected')).toBe(PaymentStatus.Rejected)
    expect(mapMercadoPagoStatus('refunded')).toBe(PaymentStatus.Refunded)
    expect(mapMercadoPagoStatus('charged_back')).toBe(PaymentStatus.Refunded)
  })

  it('does not promote unknown provider states to approved', () => {
    expect(mapMercadoPagoStatus('something_new')).toBe(PaymentStatus.Failed)
  })
})

describe('MitoS reservation states', () => {
  it('allows payment-backed reservation confirmation', () => {
    expect(canTransitionReservation(ReservationStatus.Pending, ReservationStatus.AwaitingPayment)).toBe(true)
    expect(canTransitionReservation(ReservationStatus.AwaitingPayment, ReservationStatus.Confirmed)).toBe(true)
    expect(canTransitionReservation(ReservationStatus.Confirmed, ReservationStatus.Completed)).toBe(true)
  })

  it('treats the same state as an idempotent replay', () => {
    expect(canTransitionReservation(ReservationStatus.Confirmed, ReservationStatus.Confirmed)).toBe(true)
  })

  it('rejects terminal state reversal', () => {
    expect(canTransitionReservation(ReservationStatus.Completed, ReservationStatus.Confirmed)).toBe(false)
    const error = new InvalidReservationTransitionError(
      ReservationStatus.Completed,
      ReservationStatus.Confirmed,
    )
    expect(error.message).toContain('completed -> confirmed')
  })
})
