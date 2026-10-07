import crypto from 'node:crypto'
import { validateMercadoPagoWebhookSignature } from '../src/controllers/mercadoPagoController'

describe('Mercado Pago webhook signature', () => {
  const secret = 'test-webhook-secret'
  const requestId = 'request-123'
  const dataId = '987654321'
  const ts = '1720000000'
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const signature = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  it('accepts a valid HMAC signature', () => {
    expect(validateMercadoPagoWebhookSignature({
      signature: `ts=${ts},v1=${signature}`,
      requestId,
      dataId,
      secret,
    })).toBe(true)
  })

  it('rejects a tampered signature', () => {
    expect(validateMercadoPagoWebhookSignature({
      signature: `ts=${ts},v1=${'0'.repeat(64)}`,
      requestId,
      dataId,
      secret,
    })).toBe(false)
  })

  it('rejects incomplete signature metadata', () => {
    expect(validateMercadoPagoWebhookSignature({
      signature: `v1=${signature}`,
      requestId,
      dataId,
      secret,
    })).toBe(false)
  })
})
