import crypto from 'node:crypto'

const parseSignature = (header: string) => Object.fromEntries(
  header.split(',').map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, value.join('=')]
  }),
)

export const validateMercadoPagoWebhookSignature = ({
  signature,
  requestId,
  dataId,
  secret,
}: {
  signature: string
  requestId: string
  dataId: string
  secret: string
}) => {
  const parts = parseSignature(signature)
  const ts = parts.ts
  const received = parts.v1
  if (!ts || !received) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  const receivedBuffer = Buffer.from(received, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')

  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
}
