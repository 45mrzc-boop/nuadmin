#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const MCP_SERVER_PATH = join(REPO_ROOT, 'bin/genplus-mcp.mjs')
const PID_FILE = join(__dirname, '.genplus-serve.pid')
const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Spawn and maintain a stdio JSON-RPC client to genplus-mcp.mjs.
 * 
 * Note: McpClient sends direct JSON-RPC tools/call requests without initialize handshake.
 * When reusing an McpClient instance across multiple calls, callers MUST explicitly call
 * `client.close()` when done to terminate the spawned MCP child process and allow the Node
 * event loop to exit cleanly.
 */
class McpClient {
  constructor() {
    this.child = null
    this.pending = new Map()
    this.nextId = 1
    this.buf = ''
  }

  start() {
    this.child = spawn(process.execPath, [MCP_SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: REPO_ROOT,
      env: { ...process.env }
    })

    this.child.stdout.on('data', (chunk) => {
      this.buf += chunk.toString()
      let idx
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).trim()
        this.buf = this.buf.slice(idx + 1)
        if (line) {
          try {
            const json = JSON.parse(line)
            if (json.id && this.pending.has(json.id)) {
              const { resolve, reject } = this.pending.get(json.id)
              this.pending.delete(json.id)
              if (json.error) reject(new Error(json.error.message || JSON.stringify(json.error)))
              else resolve(json.result)
            }
          } catch {}
        }
      }
    })

    this.child.on('exit', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('MCP server process exited'))
      }
      this.pending.clear()
      this.child = null
    })
  }

  ensureRunning() {
    if (!this.child) this.start()
  }

  async call(method, params = {}) {
    this.ensureRunning()
    const id = this.nextId++
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(msg)
    })
  }

  async callTool(name, args = {}) {
    const res = await this.call('tools/call', { name, arguments: args })
    const text = res?.content?.[0]?.text
    if (text) {
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    }
    return res
  }

  close() {
    if (this.child) {
      try { this.child.kill() } catch {}
      this.child = null
    }
  }
}

async function callTool(toolName, args = {}) {
  const client = new McpClient()
  try {
    return await client.callTool(toolName, args)
  } finally {
    client.close()
  }
}

async function runSingleCall(toolName, args = {}) {
  const client = new McpClient()
  try {
    const result = await client.callTool(toolName, args)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    client.close()
  }
}

async function runBatchFile(filePath) {
  const fullPath = resolve(process.cwd(), filePath)
  if (!existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`)
    process.exit(1)
  }
  const calls = JSON.parse(readFileSync(fullPath, 'utf-8'))
  const client = new McpClient()
  try {
    for (const call of (Array.isArray(calls) ? calls : [calls])) {
      console.log(`[Executing] ${call.tool || call.name}...`)
      const res = await client.callTool(call.tool || call.name, call.args || call.arguments || {})
      console.log(JSON.stringify(res, null, 2))
    }
  } finally {
    client.close()
  }
}

function stopDaemon() {
  if (!existsSync(PID_FILE)) {
    console.log('No running daemon found.')
    return
  }
  try {
    const info = JSON.parse(readFileSync(PID_FILE, 'utf-8'))
    if (info.pid) {
      process.kill(info.pid, 'SIGTERM')
      console.log(`Stopped daemon (PID ${info.pid}).`)
    }
  } catch (e) {
    console.log(`Failed to stop daemon: ${e.message}`)
  } finally {
    try { unlinkSync(PID_FILE) } catch {}
  }
}

async function startDaemon(port = 0) {
  const token = randomBytes(32).toString('hex')
  const client = new McpClient()
  client.ensureRunning()

  let idleTimer = null
  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      console.log('[Daemon] Idle timeout reached (15m). Shutting down...')
      shutdown()
    }, IDLE_TIMEOUT_MS)
  }

  const server = createServer(async (req, res) => {
    resetIdleTimer()

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, pid: process.pid, uptime: process.uptime() }))
    }

    if (req.method !== 'POST' || req.url !== '/call') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Not found' }))
    }

    // Security check: x-genplus-token
    const clientToken = req.headers['x-genplus-token']
    if (!clientToken || clientToken !== token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid x-genplus-token' }))
    }

    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const json = JSON.parse(body || '{}')
        const tool = json.tool || json.name
        const args = json.args || json.arguments || {}
        if (!tool) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Missing tool name' }))
        }

        const result = await client.callTool(tool, args)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message || String(err) }))
      }
    })
  })

  function shutdown() {
    try { unlinkSync(PID_FILE) } catch {}
    client.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000).unref()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Listen strictly on 127.0.0.1
  server.listen(port, '127.0.0.1', () => {
    const boundPort = server.address().port
    const info = {
      port: boundPort,
      token,
      pid: process.pid,
      pidfile: PID_FILE,
      startedAt: new Date().toISOString()
    }
    writeFileSync(PID_FILE, JSON.stringify(info, null, 2), { mode: 0o600 })
    console.log(JSON.stringify(info, null, 2))
    resetIdleTimer()
  })
}

export {
  McpClient,
  callTool,
  runSingleCall,
  runBatchFile,
  startDaemon,
  stopDaemon
}

// CLI Arg Parsing (only when executed directly)
const isDirectCli = process.argv[1] && (
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href ||
  import.meta.url === pathToFileURL(process.argv[1]).href
)

if (isDirectCli) {
  const args = process.argv.slice(2)
  if (args.includes('--stop')) {
    stopDaemon()
  } else if (args.includes('--serve')) {
    const portIdx = args.indexOf('--port')
    const port = portIdx >= 0 && args[portIdx + 1] ? Number(args[portIdx + 1]) : 0
    startDaemon(port)
  } else if (args.includes('--file')) {
    const fileIdx = args.indexOf('--file')
    const file = args[fileIdx + 1]
    if (!file) {
      console.error('Usage: --file <path>')
      process.exit(1)
    }
    runBatchFile(file)
  } else if (args.includes('--tool')) {
    const toolIdx = args.indexOf('--tool')
    const tool = args[toolIdx + 1]
    const argsIdx = args.indexOf('--args')
    const toolArgs = argsIdx >= 0 && args[argsIdx + 1] ? JSON.parse(args[argsIdx + 1]) : {}
    runSingleCall(tool, toolArgs)
  } else {
    console.log(`GenPlus MCP Invoker & Daemon
Usage:
  node scripts/genplus-mcp-call.mjs --tool <name> [--args '<json>']
  node scripts/genplus-mcp-call.mjs --file <batch.json>
  node scripts/genplus-mcp-call.mjs --serve [--port <port>]
  node scripts/genplus-mcp-call.mjs --stop
`)
  }
}
