#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if (process.versions.node.split(".")[0] !== "24") throw Error("Node 24 required")'
test "$(npm --version | cut -d. -f1)" -ge 11
task_build=$(mktemp -d)
trap 'rm -rf "$task_build"' EXIT
mkdir -p "$task_build/source"
# Include current source, including new files, but never load local env files.
tar --exclude='.env*' --exclude='*.tsbuildinfo' -cf "$task_build/input.tar" \
  package.json package-lock.json tsconfig.base.json \
  apps/api/package.json apps/api/tsconfig*.json apps/api/src \
  apps/web/package.json apps/web/tsconfig*.json apps/web/index.html \
  apps/web/vite.config.ts apps/web/vitest.config.ts apps/web/src \
  packages/domain/package.json packages/domain/tsconfig*.json packages/domain/src
tar -xf "$task_build/input.tar" -C "$task_build/source"
(
  cd "$task_build/source"
  env -i PATH="$PATH" HOME="$HOME" npm ci --cache "$task_build/cache" --include=dev --no-audit --no-fund
  env -i PATH="$PATH" HOME="$HOME" npm run build:apps
)
task_output="$task_build/standalone"
mkdir -p "$task_output/apps/api/drizzle/meta" "$task_output/apps/web" "$task_output/packages/domain/dist"
cp package.json package-lock.json "$task_output/"
for task_workspace in apps/api apps/web packages/domain; do
  cp "$task_workspace/package.json" "$task_output/$task_workspace/"
done
cp -R "$task_build/source/apps/api/dist" "$task_output/apps/api/"
cp "$task_build/source/packages/domain/dist/"*.js "$task_output/packages/domain/dist/"
cp apps/api/drizzle/*.sql "$task_output/apps/api/drizzle/"
cp apps/api/drizzle/meta/_journal.json "$task_output/apps/api/drizzle/meta/"
cp -R "$task_build/source/apps/web/dist" "$task_output/public"
cat > "$task_output/start.cjs" <<'NODE'
// CommonJS entry point for hosts that load startup files with require().
import('./apps/api/dist/server.js').catch(() => {
  console.error('Application startup failed. Check private runtime configuration.')
  process.exitCode = 1
})
NODE
git rev-parse HEAD > "$task_output/REVISION" 2>/dev/null || echo unknown > "$task_output/REVISION"
if test -n "$(git status --porcelain 2>/dev/null)"; then
  echo 'working-tree build; not a released revision' >> "$task_output/REVISION"
fi
(
  cd "$task_output"
  node - <<'NODE'
const fs = require('node:fs')
const manifest = JSON.parse(fs.readFileSync('package.json'))
manifest.scripts = {
  start: 'node start.cjs',
  'db:migrate': 'node apps/api/dist/commands/migrate.js',
  'auth:bootstrap': 'node apps/api/dist/commands/bootstrap-owner.js',
  'categories:init': 'node apps/api/dist/commands/initialize-categories.js',
}
fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\n')
NODE
  # Locked runtime dependencies include the native library's shipped prebuilds.
  # Never copy node_modules from the developer checkout or run install hooks.
  env -i PATH="$PATH" HOME="$HOME" npm ci --cache "$task_build/cache" --omit=dev --ignore-scripts \
    --workspace @my-poxket/api --workspace @my-poxket/domain --no-audit --no-fund
  node - <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const entries = []
const root = fs.realpathSync('.')
function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      if (!fs.realpathSync(name).startsWith(root + path.sep)) throw Error(`External symlink: ${name}`)
      continue
    }
    if (entry.isDirectory()) { inspect(name); continue }
    if (!entry.isFile()) throw Error(`Unexpected entry: ${name}`)
    if (!name.startsWith('node_modules/')) {
      const allowed = /^(package(-lock)?\.json|REVISION|start\.cjs|public\/(index\.html|assets\/[\w.-]+\.(js|css|woff2))|apps\/(api|web)\/package\.json|apps\/api\/dist\/[\w/.-]+\.js|apps\/api\/drizzle\/(\d{4}_[\w]+\.sql|meta\/_journal\.json)|packages\/domain\/(package\.json|dist\/[\w-]+\.js))$/
      if (!allowed.test(name) || /\.(test|spec)\./.test(name)) throw Error(`Unexpected file: ${name}`)
    }
    entries.push(`${createHash('sha256').update(fs.readFileSync(name)).digest('hex')}  ${name}`)
  }
}
inspect('.')
fs.writeFileSync('SHA256SUMS', entries.sort().join('\n') + '\n')
const journal = JSON.parse(fs.readFileSync('apps/api/drizzle/meta/_journal.json'))
fs.writeFileSync('MIGRATIONS.txt', journal.entries.map(e => `${e.tag}.sql`).join('\n') + '\n')
NODE
)
mkdir -p dist
rm -rf dist/standalone
mv "$task_output" dist/standalone
tar -czf dist/my-poxket.tar.gz -C dist/standalone .
echo 'Build ready: dist/standalone and dist/my-poxket.tar.gz'
