export default defineEventHandler(() => {
  return ok({
    status: 'up',
    uptime: process.uptime(),
    platform: process.platform,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
})
