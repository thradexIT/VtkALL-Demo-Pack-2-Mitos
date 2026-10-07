import fs from 'node:fs/promises'

const targets = [
  'scripts/mitos-r2b-provider-cert.ts',
  '../.github/workflows/mitos-r2b-sandbox.yml',
  '../docs/mitos/evidence/MITOS_R2B_MERCADO_PAGO_REAL_SANDBOX_PLAN_2026-08-31.md',
]

// Construct high-signal credential patterns here rather than embedding them in
// the workflow being scanned, avoiding scanner self-matches.
const patterns = [
  new RegExp('APP_' + 'USR-' + '[0-9A-Za-z_-]{20,}', 'g'),
  new RegExp('TEST' + '-' + '[0-9A-Za-z_-]{20,}', 'g'),
  new RegExp('access[_ -]?token[=:][\\s]*[A-Za-z0-9_-]{20,}', 'gi'),
]

const findings: Array<{ file: string; pattern: number }> = []

for (const file of targets) {
  const content = await fs.readFile(file, 'utf8')
  patterns.forEach((pattern, index) => {
    pattern.lastIndex = 0
    if (pattern.test(content)) findings.push({ file, pattern: index + 1 })
  })
}

if (findings.length) {
  console.error('Potential Mercado Pago credential literal detected in R2B certification files')
  for (const finding of findings) {
    console.error(`- ${finding.file} (pattern ${finding.pattern})`)
  }
  process.exit(1)
}

console.log('R2B credential-literal scan passed')
