import pkg from '../../package.json'

export default defineEventHandler(async () => {
  let dbUp = false
  let latencyMs = 0
  const t0 = performance.now()
  try {
    await q('SELECT 1')
    dbUp = true
    latencyMs = Math.round(performance.now() - t0)
  } catch {
    latencyMs = Math.round(performance.now() - t0)
  }

  return ok({
    status: 'up',
    version: pkg.version || '2.2.2',
    uptime: Math.round(process.uptime() * 10) / 10,
    platform: process.platform,
    db: {
      up: dbUp,
      latencyMs
    },
    timestamp: new Date().toISOString()
  })
})
