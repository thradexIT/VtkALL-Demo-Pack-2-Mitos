import { isCommittedTransactionalMutation } from '../src/middlewares/transactionalEmailEvents'
import { es } from '../src/lang/es'

describe('MITOS transactional email semantics', () => {
  it('treats only the inherited explicit HTTP 200 mutation path as committed', () => {
    expect(isCommittedTransactionalMutation(200)).toBe(true)
    expect(isCommittedTransactionalMutation(201)).toBe(false)
    expect(isCommittedTransactionalMutation(202)).toBe(false)
    expect(isCommittedTransactionalMutation(204)).toBe(false)
    expect(isCommittedTransactionalMutation(400)).toBe(false)
  })

  it('keeps cancellation request copy distinct from completed cancellation', () => {
    expect(es.CANCELLATION_REQUESTED_BODY).toContain('no se considera cancelada')
    expect(es.RESERVATION_CANCELLED_BODY).toContain('ha sido cancelada')
  })
})
