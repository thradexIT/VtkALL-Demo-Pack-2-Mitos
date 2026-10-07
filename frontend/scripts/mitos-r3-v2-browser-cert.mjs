import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const runId = String(process.env.GITHUB_RUN_ID || `local-${Date.now()}`)
const fixturePath = String(process.env.R3_FIXTURE_PATH || '/tmp/mitos-r3-v2/browser-fixture.json')
const evidenceDir = String(process.env.R3_EVIDENCE_DIR || '/tmp/mitos-r3-v2/evidence')
const frontendBase = String(process.env.R3_FRONTEND_BASE || 'http://localhost:3002')
const cardNumberValue = String(process.env.R3_TEST_CARD_NUMBER || '')
const cardExpiryValue = String(process.env.R3_TEST_CARD_EXPIRY || '')
const cardCvvValue = String(process.env.R3_TEST_CARD_CVV || '')
const cardHolderValue = String(process.env.R3_TEST_CARD_HOLDER || 'APRO')
const payerDocumentValue = String(process.env.R3_TEST_PAYER_DOCUMENT || '')

const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
await fs.mkdir(evidenceDir, { recursive: true })

const evidence = {
  runId,
  startedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || 'cert/mitos-r3-payment-brick-browser-v2',
  commit: process.env.GITHUB_SHA || 'local',
  mode: 'real-mitos-checkout-payment-brick-browser-v2',
  fixture: {
    carName: fixture.carName,
    expectedAmount: fixture.expectedAmount,
    expectedCurrency: fixture.expectedCurrency,
  },
  steps: [],
  network: {
    checkout: null,
    quote: null,
    payment: null,
    apiResponses: [],
  },
  brick: {
    rendered: false,
    ready: false,
    cardAvailable: false,
    yapeVisible: false,
    childFrameHosts: [],
    inputMetadata: [],
  },
  screenshots: [],
  defects: [],
  result: 'running',
  completedAt: '',
  failure: '',
}

const record = (name, observed = {}, defect = '') => {
  evidence.steps.push({ name, timestamp: new Date().toISOString(), observed, ...(defect ? { defect } : {}) })
  if (defect && !evidence.defects.includes(defect)) evidence.defects.push(defect)
  console.log(`[R3-V2] ${name}${defect ? ` DEFECT=${defect}` : ''}`)
}

const screenshot = async (page, name) => {
  const file = path.join(evidenceDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  evidence.screenshots.push(path.basename(file))
}

const safeHost = (url) => {
  try { return new URL(url).host } catch { return '' }
}

const descriptorText = (frame, descriptor) => [
  frame.name(),
  safeHost(frame.url()),
  descriptor.name,
  descriptor.id,
  descriptor.placeholder,
  descriptor.ariaLabel,
  descriptor.autocomplete,
].filter(Boolean).join(' ').toLowerCase()

const getInputMetadata = async (frame, scope = null) => {
  const locator = scope ? scope.locator('input') : frame.locator('input')
  const metadata = await locator.evaluateAll((nodes) => nodes.map((node, index) => ({
    index,
    type: node.getAttribute('type') || '',
    name: node.getAttribute('name') || '',
    id: node.getAttribute('id') || '',
    placeholder: node.getAttribute('placeholder') || '',
    ariaLabel: node.getAttribute('aria-label') || '',
    autocomplete: node.getAttribute('autocomplete') || '',
  })))
  return { locator, metadata }
}

const isFrameElementVisible = async (frame) => {
  if (!frame.parentFrame()) return true
  const element = await frame.frameElement().catch(() => null)
  if (!element) return false
  return element.isVisible().catch(() => false)
}

const fillAcrossFrames = async (page, hints, value, timeoutMs = 10_000) => {
  if (!value) return null
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const candidates = []

    for (const frame of page.frames()) {
      const frameHost = safeHost(frame.url())
      const frameVisible = await isFrameElementVisible(frame)
      const { locator, metadata } = await getInputMetadata(frame)

      for (const descriptor of metadata) {
        const haystack = descriptorText(frame, descriptor)
        if (!hints.some((hint) => haystack.includes(hint))) continue

        const input = locator.nth(descriptor.index)
        const inputVisible = await input.isVisible().catch(() => false)
        const descriptive = Boolean(descriptor.ariaLabel || descriptor.placeholder)
        const secureField = frameHost === 'secure-fields.mercadopago.com'
        const score = (inputVisible ? 100 : 0)
          + (frameVisible ? 50 : 0)
          + (descriptive ? 20 : 0)
          + (secureField ? 10 : 0)

        candidates.push({
          frame,
          frameHost,
          frameVisible,
          locator,
          descriptor,
          inputVisible,
          descriptive,
          secureField,
          score,
        })
      }
    }

    candidates.sort((a, b) => b.score - a.score)

    for (const candidate of candidates) {
      const input = candidate.locator.nth(candidate.descriptor.index)
      try {
        if (candidate.inputVisible) {
          await input.fill(value)
        } else if (candidate.secureField && candidate.frameVisible && candidate.descriptive) {
          // Mercado Pago Secure Fields can report the inner input as hidden even while
          // the owning iframe is the visible, selected payment field. Only force-fill
          // that visible iframe and only when its descriptor identifies the UI field.
          await input.fill(value, { force: true })
        } else {
          continue
        }

        return {
          frameHost: candidate.frameHost,
          frameName: candidate.frame.name(),
          frameVisible: candidate.frameVisible,
          inputVisible: candidate.inputVisible,
          forcedSecureField: !candidate.inputVisible,
          descriptor: {
            type: candidate.descriptor.type,
            name: candidate.descriptor.name,
            id: candidate.descriptor.id,
            placeholder: candidate.descriptor.placeholder,
            ariaLabel: candidate.descriptor.ariaLabel,
            autocomplete: candidate.descriptor.autocomplete,
          },
        }
      } catch {
        // Dynamic Secure Fields may remount while the card method is activating.
        // Retry against the fresh frame/input set until the bounded deadline.
      }
    }

    await page.waitForTimeout(250)
  }

  return null
}

const fillWithinRoot = async (root, hints, value) => {
  if (!value) return null
  const inputs = root.locator('input')
  const metadata = await inputs.evaluateAll((nodes) => nodes.map((node, index) => ({
    index,
    type: node.getAttribute('type') || '',
    name: node.getAttribute('name') || '',
    id: node.getAttribute('id') || '',
    placeholder: node.getAttribute('placeholder') || '',
    ariaLabel: node.getAttribute('aria-label') || '',
    autocomplete: node.getAttribute('autocomplete') || '',
  })))

  for (const descriptor of metadata) {
    const haystack = [descriptor.name, descriptor.id, descriptor.placeholder, descriptor.ariaLabel, descriptor.autocomplete]
      .filter(Boolean).join(' ').toLowerCase()
    if (hints.some((hint) => haystack.includes(hint))) {
      const input = inputs.nth(descriptor.index)
      if (await input.isVisible().catch(() => false)) {
        await input.fill(value)
        return {
          descriptor: {
            type: descriptor.type,
            name: descriptor.name,
            id: descriptor.id,
            placeholder: descriptor.placeholder,
            ariaLabel: descriptor.ariaLabel,
            autocomplete: descriptor.autocomplete,
          },
        }
      }
    }
  }
  return null
}

const pageOrFrameTextVisible = async (page, pattern) => {
  for (const frame of page.frames()) {
    const locator = frame.getByText(pattern).first()
    if (await locator.isVisible().catch(() => false)) return true
  }
  return false
}

const clickCreditCardOptionIfVisible = async (page, root) => {
  const patterns = [
    /tarjeta de crédito/i,
    /tarjeta de credito/i,
    /credit card/i,
    /crédito/i,
    /credito/i,
  ]

  for (const pattern of patterns) {
    const radio = root.getByRole('radio', { name: pattern }).first()
    if (await radio.isVisible().catch(() => false)) {
      await radio.check()
      await page.waitForTimeout(1_200)
      return await radio.isChecked().catch(() => true)
    }
  }

  for (const frame of page.frames()) {
    for (const pattern of patterns) {
      const radio = frame.getByRole('radio', { name: pattern }).first()
      if (await radio.isVisible().catch(() => false)) {
        await radio.check()
        await page.waitForTimeout(1_200)
        return await radio.isChecked().catch(() => true)
      }
    }
  }

  for (const pattern of patterns) {
    const inRoot = root.getByText(pattern).first()
    if (await inRoot.isVisible().catch(() => false)) {
      await inRoot.click()
      await page.waitForTimeout(1_200)
      return true
    }
  }

  return false
}

const clickPayButton = async (page, root) => {
  const hints = [/^pagar/i, /^pay$/i, /continuar/i, /confirmar/i]
  for (const hint of hints) {
    const button = root.getByRole('button', { name: hint }).last()
    if (await button.isVisible().catch(() => false)) {
      await button.click()
      return true
    }
  }
  for (const frame of page.frames()) {
    for (const hint of hints) {
      const button = frame.getByRole('button', { name: hint }).last()
      if (await button.isVisible().catch(() => false)) {
        await button.click()
        return true
      }
    }
  }
  return false
}

const sanitizeInputs = async (page) => {
  const output = []
  for (const frame of page.frames()) {
    const frameVisible = await isFrameElementVisible(frame)
    const { metadata } = await getInputMetadata(frame)
    for (const input of metadata) {
      output.push({
        frameHost: safeHost(frame.url()),
        frameName: frame.name(),
        frameVisible,
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        ariaLabel: input.ariaLabel,
        autocomplete: input.autocomplete,
      })
    }
  }
  return output.slice(0, 80)
}

if (!cardNumberValue || !cardExpiryValue || !cardCvvValue) {
  throw new Error('R3 v2 requires ephemeral/published Mercado Pago TEST card inputs through environment variables')
}

let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()

  page.on('response', async (response) => {
    const url = response.url()
    try {
      if (url.includes('/api/')) {
        const parsed = new URL(url)
        evidence.network.apiResponses.push({
          method: response.request().method(),
          path: parsed.pathname,
          status: response.status(),
        })
      }
      if (url.includes('/api/checkout') && response.request().method() === 'POST') {
        const body = await response.json()
        evidence.network.checkout = { status: response.status(), bookingId: body?.bookingId || '' }
      } else if (url.includes('/api/mercadopago/quote/')) {
        const body = await response.json()
        evidence.network.quote = { status: response.status(), amount: body?.amount, currency: body?.currency }
      } else if (url.includes('/api/create-mercadopago-payment')) {
        const body = await response.json()
        evidence.network.payment = {
          status: response.status(),
          providerPaymentId: body?.id ? String(body.id) : '',
          paymentStatus: body?.status || '',
          bookingId: body?.bookingId || '',
          idempotentReplay: body?.idempotentReplay === true,
          errorCode: body?.error || body?.code || '',
          errorMessage: body?.message || '',
        }
      }
    } catch {
      // Evidence deliberately ignores third-party bodies and non-JSON payloads.
    }
  })

  await page.goto(frontendBase, { waitUntil: 'domcontentloaded' })
  await page.evaluate((routeFixture) => {
    window.history.replaceState({
      usr: {
        carId: routeFixture.carId,
        pickupLocationId: routeFixture.pickupLocationId,
        dropOffLocationId: routeFixture.dropOffLocationId,
        from: new Date(routeFixture.from),
        to: new Date(routeFixture.to),
      },
      key: 'r3-v2-browser',
      idx: 0,
    }, '', '/checkout')
  }, fixture)
  await page.reload({ waitUntil: 'domcontentloaded' })

  await page.locator('.checkout-form').waitFor({ state: 'visible', timeout: 30_000 })
  const dobVisible = await page.getByText(/fecha de nacimiento|date of birth|date de naissance/i).isVisible().catch(() => false)
  if (dobVisible) {
    record('DOB unexpectedly visible in Checkout', {}, 'R3-V2-DOB-STILL-VISIBLE')
    throw new Error('R3 v2 Checkout still renders a date-of-birth field')
  }
  record('real MitoS Checkout rendered without DOB', {
    pathname: new URL(page.url()).pathname,
    carName: fixture.carName,
    dobVisible: false,
  })
  await screenshot(page, '01-checkout-loaded')

  const driverForm = page.locator('.driver-details-form').first()
  const driverInputs = driverForm.locator('input')
  const driverInputCount = await driverInputs.count()
  if (driverInputCount < 3) throw new Error(`R3 v2 expected at least three driver inputs; observed ${driverInputCount}`)

  const email = 'test@testuser.com'
  await driverInputs.nth(0).fill('MITOS R3 Browser Test')
  await driverInputs.nth(1).fill(email)
  await driverInputs.nth(1).press('Tab')
  await page.waitForTimeout(600)
  await driverInputs.nth(2).fill('+51987654321')

  const tos = page.locator('input[type="checkbox"][name="tos"]')
  await tos.check()
  const payInFull = page.locator('input[type="radio"][value="payInFull"]')
  if (await payInFull.count()) await payInFull.check()

  record('guest reservation form completed', {
    requiredDriverFields: 3,
    tos: await tos.isChecked(),
    paymentChoice: await payInFull.isChecked().catch(() => false) ? 'payInFull' : 'default-online',
    dobCollected: false,
  })

  const checkoutButton = page.getByRole('button', { name: 'Checkout' })
  await checkoutButton.click()

  const brickShell = page.locator('.mitos-payment-brick-shell')
  await brickShell.waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => !document.querySelector('.mitos-payment-loading'), null, { timeout: 30_000 })

  evidence.brick.rendered = true
  evidence.brick.ready = true
  evidence.brick.childFrameHosts = [...new Set(page.frames()
    .filter((frame) => frame !== page.mainFrame())
    .map((frame) => safeHost(frame.url()))
    .filter(Boolean))]

  evidence.brick.yapeVisible = await pageOrFrameTextVisible(page, /yape/i)
  record('Mercado Pago Payment Brick ready', {
    quote: evidence.network.quote,
    childFrameHosts: evidence.brick.childFrameHosts,
    yapeVisible: evidence.brick.yapeVisible,
  })
  await screenshot(page, '02-payment-brick-rendered')

  const creditCardSelected = await clickCreditCardOptionIfVisible(page, brickShell)
  record('credit-card method selected in Payment Brick', { selected: creditCardSelected })

  const cardNumber = await fillAcrossFrames(page, ['cardnumber', 'card_number', 'card-number', 'card number', 'numero de tarjeta', 'número de tarjeta', 'cc-number'], cardNumberValue)
  const expiration = await fillAcrossFrames(page, ['expirationdate', 'expiration', 'expiry', 'vencimiento', 'cc-exp'], cardExpiryValue)
  const securityCode = await fillAcrossFrames(page, ['securitycode', 'security', 'cvv', 'cvc', 'codigo de seguridad', 'código de seguridad', 'cc-csc'], cardCvvValue)
  const holderHints = ['holder_name', 'holder name', 'holdername', 'cardholder', 'titular']
  const holder = await fillWithinRoot(brickShell, holderHints, cardHolderValue)
    || await fillAcrossFrames(page, holderHints, cardHolderValue)
  const identification = payerDocumentValue
    ? await fillWithinRoot(brickShell, ['identification', 'document', 'dni'], payerDocumentValue)
      || await fillAcrossFrames(page, ['identification', 'document', 'dni'], payerDocumentValue)
    : null
  await fillWithinRoot(brickShell, ['email', 'correo'], email)
    || await fillAcrossFrames(page, ['email', 'correo'], email)

  evidence.brick.inputMetadata = await sanitizeInputs(page)
  evidence.brick.cardAvailable = Boolean(cardNumber && expiration && securityCode && holder)

  if (!evidence.brick.cardAvailable) {
    record('required card fields were not all reachable', {
      creditCardSelected,
      cardNumberField: Boolean(cardNumber),
      expirationField: Boolean(expiration),
      securityCodeField: Boolean(securityCode),
      cardholderField: Boolean(holder),
      identificationField: Boolean(identification),
    }, 'R3-V2-CARD-FIELDS-NOT-REACHABLE')
    throw new Error('R3 v2 could not reach all required card fields in Payment Brick')
  }

  const selects = brickShell.locator('select')
  for (let i = 0; i < await selects.count(); i += 1) {
    const select = selects.nth(i)
    if (await select.isVisible().catch(() => false)) {
      const options = await select.locator('option').count()
      if (options > 1) await select.selectOption({ index: 1 }).catch(() => undefined)
    }
  }

  record('Mercado Pago TEST card entered through Payment Brick', {
    cardNumberField: true,
    expirationField: true,
    securityCodeField: true,
    cardholderField: true,
    identificationField: Boolean(identification),
    rawCardDataStoredInEvidence: false,
  })

  const paymentResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/create-mercadopago-payment')
      && response.request().method() === 'POST',
    { timeout: 60_000 },
  )
  const clicked = await clickPayButton(page, brickShell)
  if (!clicked) throw new Error('R3 v2 could not locate Payment Brick submit button')

  const paymentResponse = await paymentResponsePromise
  if (!paymentResponse.ok()) {
    const providerFailure = await paymentResponse.json().catch(() => ({}))
    throw new Error(
      `R3 v2 payment API returned HTTP ${paymentResponse.status()}: ${providerFailure?.message || providerFailure?.error || 'unknown provider rejection'}`,
    )
  }

  await page.locator('.checkout-status').waitFor({ state: 'visible', timeout: 60_000 })
  await screenshot(page, '03-payment-success')

  const { checkout, quote, payment } = evidence.network
  if (!checkout?.bookingId) evidence.defects.push('R3-V2-BOOKING-ID-MISSING')
  if (!quote || Number(quote.amount) !== Number(fixture.expectedAmount) || String(quote.currency) !== fixture.expectedCurrency) {
    evidence.defects.push('R3-V2-SERVER-QUOTE-MISMATCH')
  }
  if (!payment || payment.paymentStatus !== 'approved' || !payment.providerPaymentId) {
    evidence.defects.push('R3-V2-PAYMENT-NOT-APPROVED')
  }
  if (payment?.bookingId && checkout?.bookingId && payment.bookingId !== checkout.bookingId) {
    evidence.defects.push('R3-V2-BOOKING-BINDING-MISMATCH')
  }

  record('browser payment completed and success UI rendered', {
    checkout,
    quote,
    payment,
    checkoutStatusVisible: true,
    yapeVisible: evidence.brick.yapeVisible,
  })

  evidence.result = evidence.defects.length === 0 ? 'passed' : 'failed'
  if (evidence.defects.length) {
    evidence.failure = `R3 v2 defects: ${evidence.defects.join(', ')}`
    process.exitCode = 1
  }
} catch (error) {
  evidence.result = 'failed'
  evidence.failure = error instanceof Error ? error.stack || error.message : String(error)
  console.error('[R3-V2] BROWSER HARNESS FAILURE', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  evidence.completedAt = new Date().toISOString()
  if (browser) await browser.close().catch(() => undefined)
  await fs.writeFile(path.join(evidenceDir, 'mitos-r3-v2-browser-runtime.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(`[R3-V2] RESULT=${evidence.result} defects=${evidence.defects.join(',') || 'none'}`)
}
