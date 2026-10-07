import axios from 'axios'
import * as env from '../config/env.config'
import * as logger from '../utils/logger'
import FxRate from '../models/FxRate'

const DOLAR_PE_ENDPOINT = env.__env__(
  'BC_FX_PROVIDER_URL',
  false,
  'https://dolar.pe/api/public/series',
)
const CACHE_TTL_SECONDS = Number.parseInt(
  env.__env__('BC_FX_CACHE_TTL_SECONDS', false, '21600'),
  10,
)

const PAIR = 'USD-PEN'
const PROVIDER = 'dolar.pe'

interface DolarPeSeries {
  labels?: string[]
  data?: number[]
}

interface DolarPeResponse {
  series?: Record<string, DolarPeSeries>
}

const validRate = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

const getPersistedRate = async () => FxRate.findOne({ pair: PAIR }).lean()

const getFreshPersistedRate = async () => {
  const cached = await getPersistedRate()
  if (!cached || !validRate(cached.rate)) return null

  const ttlMs = Math.max(CACHE_TTL_SECONDS, 60) * 1000
  if (Date.now() - new Date(cached.fetchedAt).getTime() > ttlMs) return null

  return cached
}

const fetchDolarPeRate = async () => {
  const response = await axios.get<DolarPeResponse>(DOLAR_PE_ENDPOINT, {
    params: { pair: PAIR },
    timeout: 5000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MitoS-Rent-A-Car/1.0 FX',
    },
  })

  const series = response.data?.series?.[PAIR]
  const data = Array.isArray(series?.data) ? series.data : []
  const labels = Array.isArray(series?.labels) ? series.labels : []

  for (let index = data.length - 1; index >= 0; index -= 1) {
    const rate = Number(data[index])
    if (validRate(rate)) {
      return {
        rate,
        providerDate: labels[index] || undefined,
      }
    }
  }

  throw new Error('Dolar.pe returned no valid USD-PEN rate')
}

const persistRate = async (rate: number, providerDate?: string) => FxRate.findOneAndUpdate(
  { pair: PAIR },
  {
    $set: {
      pair: PAIR,
      base: 'USD',
      quote: 'PEN',
      rate,
      provider: PROVIDER,
      providerDate,
      fetchedAt: new Date(),
    },
  },
  { upsert: true, new: true, setDefaultsOnInsert: true },
).lean()

/**
 * Returns the authoritative USD -> PEN rate used by MitoS reservation pricing.
 *
 * Policy:
 * 1. Reuse a persisted rate while it is inside the cache TTL.
 * 2. Refresh from Dolar.pe when stale/missing.
 * 3. If the provider fails, reuse the last persisted valid rate.
 * 4. An explicit environment fallback is accepted only as a final emergency
 *    path (mainly DEV); production can omit it to fail closed when no rate has
 *    ever been persisted.
 */
export const getUsdToPenRate = async () => {
  const fresh = await getFreshPersistedRate()
  if (fresh) {
    return {
      rate: Number(fresh.rate),
      source: 'cache' as const,
      fetchedAt: fresh.fetchedAt,
      providerDate: fresh.providerDate,
    }
  }

  try {
    const remote = await fetchDolarPeRate()
    const persisted = await persistRate(remote.rate, remote.providerDate)

    logger.info(
      '[FX] ' + PAIR + ' refreshed from ' + PROVIDER + ': ' + remote.rate
      + (remote.providerDate ? ' (' + remote.providerDate + ')' : ''),
    )

    return {
      rate: remote.rate,
      source: 'provider' as const,
      fetchedAt: persisted?.fetchedAt || new Date(),
      providerDate: remote.providerDate,
    }
  } catch (err) {
    logger.error('[FX] ' + PAIR + ' provider refresh failed', err)

    const stale = await getPersistedRate()
    if (stale && validRate(stale.rate)) {
      logger.info('[FX] ' + PAIR + ' using persisted stale fallback: ' + stale.rate)
      return {
        rate: Number(stale.rate),
        source: 'stale-cache' as const,
        fetchedAt: stale.fetchedAt,
        providerDate: stale.providerDate,
      }
    }

    const emergencyFallback = Number(env.__env__('BC_MITOS_USD_TO_PAYMENT_CURRENCY_RATE', false))
    if (validRate(emergencyFallback)) {
      logger.info('[FX] ' + PAIR + ' using explicit environment emergency fallback')
      return {
        rate: emergencyFallback,
        source: 'env-fallback' as const,
        fetchedAt: new Date(),
        providerDate: undefined,
      }
    }

    throw new Error('USD-PEN exchange rate unavailable: provider failed and no persisted rate exists')
  }
}
