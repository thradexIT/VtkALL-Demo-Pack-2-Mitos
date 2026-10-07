import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import Car from '../src/models/Car'
import Location from '../src/models/Location'
import User from '../src/models/User'

const dbUri = String(process.env.BC_DB_URI || '')
const supplierEmail = String(process.env.MITOS_DEMO_SUPPLIER_EMAIL || '')
const fixturePath = String(process.env.R3_FIXTURE_PATH || '/tmp/mitos-r3-v2/browser-fixture.json')

if (!dbUri || !supplierEmail) {
  throw new Error('R3 v2 browser fixture requires BC_DB_URI and MITOS_DEMO_SUPPLIER_EMAIL')
}

try {
  await mongoose.connect(dbUri)

  const supplier = await User.findOne({ email: supplierEmail }).lean()
  if (!supplier) throw new Error('R3 v2 seeded supplier was not found')

  const car = await Car.findOne({
    supplier: supplier._id,
    name: 'Toyota Raize',
    available: true,
  }).lean()
  if (!car) throw new Error('R3 v2 seeded Toyota Raize was not found')

  const location = await Location.findOne({ supplier: supplier._id }).lean()
  if (!location) throw new Error('R3 v2 seeded location was not found')

  const from = new Date(Date.now() + 40 * 86_400_000)
  from.setHours(10, 0, 0, 0)
  const to = new Date(from.getTime() + 2 * 86_400_000)

  const fixture = {
    carId: String(car._id),
    carName: car.name,
    pickupLocationId: String(location._id),
    dropOffLocationId: String(location._id),
    from: from.getTime(),
    to: to.getTime(),
    expectedCurrency: 'PEN',
    expectedAmount: 90,
  }

  await fs.mkdir(path.dirname(fixturePath), { recursive: true })
  await fs.writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  console.log(`[R3-V2] browser fixture descriptor written: ${fixturePath}`)
} finally {
  await mongoose.disconnect().catch(() => undefined)
}
