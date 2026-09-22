#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = process.env.MAIN_ADMIN_ENV || join(ROOT, 'main-admin/.env');

const require = createRequire(join(ROOT, 'main-admin/package.json'));
let mysql = null;
try {
  mysql = require('mysql2/promise');
} catch (e) {
  // lazy loaded below if needed
}

export function loadMainAdminEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Main admin .env file not found at ${ENV_PATH}`);
  }
  const content = readFileSync(ENV_PATH, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      env[key] = val;
    }
  }

  const host = process.env.DB_HOST || env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || env.DB_PORT) || 3306;
  const user = process.env.DB_USER || env.DB_USER || 'root';
  const password = process.env.DB_PASS || env.DB_PASS || '';
  const database = process.env.DB_NAME || env.DB_NAME || 'nuadmin';

  return { host, port, user, password, database, envPath: ENV_PATH };
}

export async function checkConnection(customDb = null) {
  const config = loadMainAdminEnv();
  const targetDb = customDb || config.database;
  const start = Date.now();

  try {
    if (!mysql) {
      try {
        mysql = require('mysql2/promise');
      } catch (e) {
        const directPath = join(ROOT, 'main-admin/node_modules/mysql2/promise.js');
        if (existsSync(directPath)) {
          const mod = await import(directPath);
          mysql = mod.default || mod;
        } else {
          throw e;
        }
      }
    }
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: targetDb
    });

    const [rows] = await conn.query(
      'SELECT 1 AS ping, VERSION() AS version, DATABASE() AS current_db, NOW() AS server_time'
    );
    const [dbs] = await conn.query('SHOW DATABASES');
    await conn.end();

    const latencyMs = Date.now() - start;
    const dbList = dbs.map(d => Object.values(d)[0]);

    return {
      ok: true,
      platform: process.platform,
      root: ROOT,
      envPath: config.envPath,
      host: config.host,
      port: config.port,
      user: config.user,
      database: targetDb,
      version: rows[0]?.version || 'unknown',
      serverTime: rows[0]?.server_time,
      latencyMs,
      databases: dbList,
      hasMainDb: dbList.includes(config.database)
    };
  } catch (err) {
    return {
      ok: false,
      platform: process.platform,
      root: ROOT,
      envPath: config.envPath,
      host: config.host,
      port: config.port,
      user: config.user,
      database: targetDb,
      error: err.message,
      code: err.code
    };
  }
}

// When run directly from CLI
if (process.argv[1]?.endsWith('check-db-connection.mjs')) {
  const targetDb = process.argv[2] || null;
  checkConnection(targetDb).then((res) => {
    console.log(JSON.stringify(res, null, 2));
    if (!res.ok) {
      process.exit(1);
    }
  }).catch((err) => {
    console.error('Check DB script fatal error:', err);
    process.exit(1);
  });
}
