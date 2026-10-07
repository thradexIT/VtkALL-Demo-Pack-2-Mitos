import {
  InvalidRentalTransitionError,
  canTransitionRental,
} from '../src/services/rentalLifecycleService'
import { RentalLifecycleState } from '../src/models/RentalLifecycle'

describe('Rental lifecycle transitions', () => {
  it('allows the canonical rental flow', () => {
    expect(canTransitionRental(RentalLifecycleState.Reserved, RentalLifecycleState.CheckedOut)).toBe(true)
    expect(canTransitionRental(RentalLifecycleState.CheckedOut, RentalLifecycleState.Returned)).toBe(true)
    expect(canTransitionRental(RentalLifecycleState.Returned, RentalLifecycleState.Closed)).toBe(true)
  })

  it('treats a replay of the same transition as idempotent', () => {
    expect(canTransitionRental(RentalLifecycleState.CheckedOut, RentalLifecycleState.CheckedOut)).toBe(true)
    expect(canTransitionRental(RentalLifecycleState.Returned, RentalLifecycleState.Returned)).toBe(true)
    expect(canTransitionRental(RentalLifecycleState.Closed, RentalLifecycleState.Closed)).toBe(true)
  })

  it('rejects out-of-order lifecycle changes', () => {
    expect(canTransitionRental(RentalLifecycleState.Reserved, RentalLifecycleState.Returned)).toBe(false)
    expect(canTransitionRental(RentalLifecycleState.CheckedOut, RentalLifecycleState.Closed)).toBe(false)
    expect(canTransitionRental(RentalLifecycleState.Closed, RentalLifecycleState.Returned)).toBe(false)
  })

  it('exposes a dedicated transition error type', () => {
    const error = new InvalidRentalTransitionError(
      RentalLifecycleState.Reserved,
      RentalLifecycleState.Returned,
    )

    expect(error.name).toBe('InvalidRentalTransitionError')
    expect(error.message).toContain('reserved -> returned')
  })
})
