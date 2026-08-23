#!/usr/bin/env node
/**
 * qa/p2-007-r2-static.mjs —— TM-P2-007-R2 静态 gate（§32 R2-01~10）。
 *
 * 不依赖网络/浏览器，只读文件验证 R2 发布链路脚本的质量与存在性：
 *   R2-01  package.json 有 qa:live（node qa/p2-007-r2-live-e2e.mjs）
 *   R2-02  PUBLIC_GAME_URL 缺失 fail fast（LIVE QA BLOCKED + exit 1）
 *   R2-03  不硬编码 passphrase（crypto.randomBytes 强随机，无固定字面量口令）
 *   R2-04  build:public 缺 endpoint fail（PUBLIC BUILD BLOCKED）
 *   R2-05  build:public localhost fail
 *   R2-06  deploy:public 非 main fail（DEPLOY BLOCKED）
 *   R2-07  deploy commit message 含 source SHA（deploy(<tag>): source <sha>）
 *   R2-08  无 secret 进 dist（build secret gate 存在；dist 若存在则扫描无 SAVE_PEPPER 字面量）
 *   R2-09  qa:live 无 passphrase logging（console 不打印 PASS_ 变量/passphrase）
 *   R2-10  qa:live 使用 ≥2 个真正隔离的 BrowserContext（Device A/B）
 *
 * 运行：npm run qa:p2-007-r2（或 node qa/p2-007-r2-static.mjs）
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`)
}

const pkg = JSON.parse(read('package.json'))
const live = read('qa/p2-007-r2-live-e2e.mjs')

// ---- R2-01 ----
const qaLive = (pkg.scripts && pkg.scripts['qa:live']) || ''
check('R2-01: package.json 有 qa:live（指向 r2-live-e2e）', qaLive.includes('qa/p2-007-r2-live-e2e.mjs'), `script="${qaLive}"`)

// ---- R2-02 ----
check('R2-02a: PUBLIC_GAME_URL 缺失 → BLOCKED 文案', live.includes('LIVE QA BLOCKED: PUBLIC_GAME_URL is missing'))
check('R2-02b: PUBLIC_GAME_URL 缺失 → process.exit(1)', /process\.exit\(1\)/.test(live))

// ---- R2-03 ----
check('R2-03a: passphrase 用 crypto.randomBytes 强随机', live.includes('randomBytes'))
const hardcoded = live.match(/PASS_[A-Z0-9_]+\s*=\s*['"][^'"]{8,}['"]/)
check('R2-03b: 无固定字面量口令（PASS_* 均为随机生成）', !hardcoded, hardcoded ? `命中: ${hardcoded[0]}` : '')

// ---- R2-04 / R2-05 ----
const buildPublic = read('qa/build-public.mjs')
check('R2-04: build:public 缺 endpoint → PUBLIC BUILD BLOCKED', buildPublic.includes('PUBLIC BUILD BLOCKED') && buildPublic.includes('VITE_CLOUD_SAVE_API_BASE'))
check('R2-05: build:public localhost → BLOCKED', /(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/.test(buildPublic) && buildPublic.includes('PUBLIC BUILD BLOCKED'))

// ---- R2-06 / R2-07 ----
const deployPublic = read('qa/deploy-public.mjs')
check('R2-06: deploy:public 非 main → DEPLOY BLOCKED', deployPublic.includes('DEPLOY BLOCKED') && deployPublic.includes('origin/main'))
check('R2-07: deploy commit message 含 source SHA', /deploy\(\$\{[^}]+\}\): source \$\{headSha\}/.test(deployPublic), deployPublic.match(/deploy\([^)]*\): source[^`]*/)?.[0] || '(未匹配)')

// ---- R2-08 ----
const secretGate = buildPublic.includes('SAVE_PEPPER')
const distDir = join(ROOT, 'dist')
let distLeak = null
if (existsSync(distDir)) {
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) scan(full)
      else if (/\.(js|css|html|json|map)$/.test(entry.name)) {
        try {
          const content = readFileSync(full, 'utf8')
          if (content.includes('SAVE_PEPPER')) distLeak = distLeak || entry.name
        } catch { /* 二进制跳过 */ }
      }
    }
  }
  scan(distDir)
}
check('R2-08a: build:public 含 SAVE_PEPPER secret gate', secretGate)
check('R2-08b: dist 无 SAVE_PEPPER 字面量泄漏', existsSync(distDir) ? !distLeak : true, !existsSync(distDir) ? '(dist 未构建，跳过扫描)' : distLeak ? `泄漏: ${distLeak}` : '扫描通过')

// ---- R2-09 ----
const passLog = live.match(/console\.(log|error|warn|info)\([^)]*(PASS_[A-Z0-9_]+|passphrase)/i)
check('R2-09: qa:live 无 passphrase logging（console 不引用 PASS_*/passphrase）', !passLog, passLog ? `命中: ${passLog[0].slice(0, 80)}` : '')

// ---- R2-10 ----
const ctxCount = (live.match(/createBrowserContext/g) || []).length
check('R2-10: qa:live 使用 ≥2 个隔离 BrowserContext（Device A/B）', ctxCount >= 2, `count=${ctxCount}`)

const failed = results.filter((r) => !r.ok)
console.log(`\n===== P2-007-R2 静态 gate（R2-01~10）=====`)
console.log(`TOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}`)
if (failed.length) {
  for (const f of results.filter((r) => !r.ok)) console.log(`  FAIL: ${f.name}`)
}
process.exit(failed.length > 0 ? 1 : 0)
