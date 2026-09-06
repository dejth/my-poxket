#!/usr/bin/env bash
# Disposable standalone runtime and database restore rehearsal.
set -euo pipefail
task_archive="$(cd "$(dirname "${1:-dist/my-poxket.tar.gz}")" && pwd)/$(basename "${1:-dist/my-poxket.tar.gz}")"
task_tmp=$(mktemp -d)
task_id="poxket-deploy-$(date +%s)-$$"
cleanup() {
  docker rm -fv "$task_id-api" "$task_id-db" >/dev/null 2>&1 || true
  docker network rm "$task_id" >/dev/null 2>&1 || true
  rm -rf "$task_tmp"
}
trap cleanup EXIT
tar -xzf "$task_archive" -C "$task_tmp"
(cd "$task_tmp" && shasum -a 256 -c SHA256SUMS >/dev/null)
docker network create "$task_id" >/dev/null
docker run -d --name "$task_id-db" --network "$task_id" --network-alias database \
  -e MARIADB_ROOT_PASSWORD=fictional-root-password -e MARIADB_DATABASE=deployment_test \
  mariadb:11.8.6 >/dev/null
for task_try in {1..60}; do
  if docker exec "$task_id-db" healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$task_id-db" healthcheck.sh --connect --innodb_initialized >/dev/null
docker run -d --name "$task_id-api" --network "$task_id" \
  -v "$task_tmp:/app" -w /app \
  -e NODE_ENV=production -e API_HOST=127.0.0.1 -e API_PORT=3000 \
  -e WEB_ORIGIN=https://fictional.example \
  -e DATABASE_URL=mysql://root:fictional-root-password@database:3306/deployment_test \
  node:24-bookworm-slim sleep infinity >/dev/null
docker exec "$task_id-api" npm run db:migrate
docker exec "$task_id-api" npm run db:migrate
docker exec -e BOOTSTRAP_USERNAME=fictional-owner -e BOOTSTRAP_PASSWORD=fictional-password-1234 \
  "$task_id-api" npm run auth:bootstrap >/dev/null
if docker exec -e BOOTSTRAP_USERNAME=fictional-owner -e BOOTSTRAP_PASSWORD=fictional-password-1234 \
  "$task_id-api" npm run auth:bootstrap >/dev/null 2>&1; then
  echo 'Bootstrap accepted an existing owner' >&2; exit 1
fi
docker exec "$task_id-api" npm run categories:init
docker exec "$task_id-api" npm run categories:init
docker exec -d "$task_id-api" sh -c 'node start.cjs > /tmp/api.log 2>&1'

docker exec -i "$task_id-api" node --input-type=module - <<'NODE'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:3000'
for (let retry = 0; retry < 60; retry++) {
  try { if ((await fetch(`${base}/api/health`)).ok) break } catch {}
  await new Promise(resolve => setTimeout(resolve, 500))
}
assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok')
for (const route of ['/', '/transactions', '/users', '/recurring-expenses']) {
  const response = await fetch(base + route, { headers: { accept: 'text/html' } })
  assert.equal(response.status, 200, route)
  assert.match(await response.text(), /<div id="root">/)
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
}
for (const route of ['/api/missing', '/assets/missing.js', '/package.json', '/.env', '/apps/api/dist/server.js']) {
  const response = await fetch(base + route, { headers: { accept: 'text/html' } })
  assert.equal(response.status, 404, route)
  assert.doesNotMatch(await response.text(), /<div id="root">/)
}
assert.equal((await fetch(`${base}/api/transactions`)).status, 401)
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'fictional-owner', password: 'fictional-password-1234' }),
})
assert.equal(login.status, 200)
const setCookie = login.headers.get('set-cookie')
assert.match(setCookie, /HttpOnly/)
assert.match(setCookie, /Secure/)
assert.match(setCookie, /SameSite=Strict/)
const { csrfToken } = await login.json()
const headers = { cookie: setCookie.split(';')[0], 'content-type': 'application/json', origin: 'https://fictional.example' }
const categories = await (await fetch(`${base}/api/categories`, { headers })).json()
assert.equal(categories.items.length, 21)
const input = { amount: '123.45', categoryId: categories.items.find(c => c.direction === 'expense').id,
  description: 'Fictional deployment restore check', direction: 'expense', paymentMethod: 'cash', transactionDate: '2026-09-06' }
assert.equal((await fetch(`${base}/api/transactions`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 403)
headers['x-csrf-token'] = csrfToken
const write = await fetch(`${base}/api/transactions`, { method: 'POST', headers, body: JSON.stringify(input) })
assert.equal(write.status, 201)
const transaction = await write.json()
assert.equal((await fetch(`${base}/api/transactions/${transaction.id}`, { headers })).status, 200)
assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: {
  cookie: headers.cookie, 'x-csrf-token': csrfToken,
} })).status, 204)
assert.equal((await fetch(`${base}/api/transactions`, { headers })).status, 401)
console.info('PASS: packaged startup, standalone SPA/API separation, headers, auth, CSRF, safe write, logout.')
NODE

# Backup/restore into a NEW database, preserving the source and all its data.
docker exec -e MYSQL_PWD=fictional-root-password "$task_id-db" \
  mariadb-dump -uroot --single-transaction --routines --events --triggers --skip-comments \
  deployment_test > "$task_tmp/backup.sql"
test -s "$task_tmp/backup.sql"
docker exec -e MYSQL_PWD=fictional-root-password "$task_id-db" \
  mariadb -uroot -e 'CREATE DATABASE deployment_restored;'
docker exec -i -e MYSQL_PWD=fictional-root-password "$task_id-db" \
  mariadb -uroot deployment_restored < "$task_tmp/backup.sql"
docker exec -e MYSQL_PWD=fictional-root-password "$task_id-db" \
  mariadb-dump -uroot --single-transaction --routines --events --triggers --skip-comments \
  deployment_restored > "$task_tmp/restored.sql"
cmp "$task_tmp/backup.sql" "$task_tmp/restored.sql"
docker exec -i -e DATABASE_URL=mysql://root:fictional-root-password@database:3306/deployment_restored \
  "$task_id-api" node --input-type=module - <<'NODE'
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
const db = await mysql.createConnection(process.env.DATABASE_URL)
try {
  const [migrations] = await db.query('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const journal = JSON.parse(readFileSync('apps/api/drizzle/meta/_journal.json'))
  assert.equal(migrations.length, journal.entries.length)
  for (const [index, entry] of journal.entries.entries()) {
    assert.equal(Number(migrations[index].created_at), entry.when)
    assert.equal(migrations[index].hash, createHash('sha256').update(readFileSync(`apps/api/drizzle/${entry.tag}.sql`)).digest('hex'))
  }
  const [rows] = await db.query('SELECT amount_minor, description FROM transactions')
  assert.equal(rows.length, 1)
  assert.equal(String(rows[0].amount_minor), '12345')
  assert.equal(rows[0].description, 'Fictional deployment restore check')
} finally { await db.end() }
const { createApp } = await import('./apps/api/dist/app.js')
const { loadApiConfig } = await import('./apps/api/dist/config.js')
const app = await createApp(loadApiConfig())
try {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {
    username: 'fictional-owner', password: 'fictional-password-1234',
  } })
  assert.equal(login.statusCode, 200)
  const cookie = login.headers['set-cookie'].split(';')[0]
  const response = await app.inject({ url: '/api/transactions', headers: { cookie } })
  assert.equal(response.statusCode, 200)
  assert.match(response.body, /Fictional deployment restore check/)
} finally { await app.close() }
console.info('PASS: backup/restore exact dump match, journal hashes, money, login and read on restored database.')
NODE
printf 'PASS: deployment dry run. Production hosting and live HTTPS still require owner verification.\n'
