#!/usr/bin/env node
/**
 * build:public —— 公网发布构建门禁（TM-P2-007-R1 BLOCKER B）。
 *
 * 与普通 `npm run build` 的区别：
 *  - 只允许「公网云存档端点」配置通过：VITE_CLOUD_SAVE_API_BASE 必须
 *      1) 非空
 *      2) 以 https:// 开头
 *      3) 不是 localhost / 127.0.0.1 / [::1] / 0.0.0.0
 *    不满足 → 打印 `PUBLIC BUILD BLOCKED` 并 exit 1。
 *  - 构建产物 secret gate：确认 dist 不含 SAVE_PEPPER 值（若构建环境提供）。
 *    SAVE_PEPPER 只在 Cloudflare Worker 端存在；前端 bundle 一律不得包含。
 *
 * 用法：VITE_CLOUD_SAVE_API_BASE=https://<worker-public-url> npm run build:public
 * 环境变量由调用方注入（普通 npm run build 不做任何门禁，行为不变）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const BANNER = 'PUBLIC BUILD BLOCKED'

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, out)
    } else if (/\.(js|mjs|cjs|css|html)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

// ---- 1. 门禁：公网端点校验 ----
const base = (process.env.VITE_CLOUD_SAVE_API_BASE ?? '').trim()
const isHttps = base.startsWith('https://')
const isLocalhost = /(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/.test(base)
const violations = []
if (!base) violations.push('VITE_CLOUD_SAVE_API_BASE 未配置（留空 = 本机模式，不能用 build:public 发布）')
if (!isHttps) violations.push(`VITE_CLOUD_SAVE_API_BASE 必须为 https:// 公网端点（当前：${base || '(空)'}）`)
if (isLocalhost) violations.push('VITE_CLOUD_SAVE_API_BASE 不能指向 localhost/本机端点')

if (violations.length > 0) {
  console.error(`[${BANNER}]`)
  for (const v of violations) console.error(`  - ${v}`)
  console.error('（普通本地开发请使用 npm run build；发布请使用：VITE_CLOUD_SAVE_API_BASE=<公网 https URL> npm run build:public）')
  process.exit(1)
}
console.log(`build:public: 公网端点校验通过（${base}）`)

// ---- 2. 委托标准生产构建（tsc -b && vite build；env 由调用方注入）----
// 单字符串传给 shell（无外部 args，无注入面），不触发 Node DEP0190
const result = spawnSync('npm run build', { stdio: 'inherit', shell: true })
if (result.status !== 0) {
  console.error(`[${BANNER}] 构建失败（exit=${result.status}）`)
  process.exit(result.status ?? 1)
}

// ---- 3. 构建产物 secret gate：dist 不含 SAVE_PEPPER 值 ----
const pepper = process.env.SAVE_PEPPER
const distDir = join(process.cwd(), 'dist')
if (!existsSync(distDir)) {
  console.error(`[${BANNER}] dist 目录不存在，无法执行 secret gate`)
  process.exit(1)
}
if (pepper && pepper.trim().length > 0) {
  const leaked = []
  for (const file of collectFiles(distDir)) {
    const content = readFileSync(file, 'utf8')
    if (content.includes(pepper.trim())) leaked.push(file)
  }
  if (leaked.length > 0) {
    console.error(`[${BANNER}] dist 中存在 SAVE_PEPPER 泄漏：${leaked.length} 个文件`)
    process.exit(1)
  }
  console.log('build:public: SAVE_PEPPER 未泄漏进 dist（SAVE_PEPPER: PRESENT，扫描通过）')
} else {
  // 构建环境未注入 SAVE_PEPPER → 无法做值扫描；改为确认产物不含字面量「SAVE_PEPPER=」
  const leaked = []
  for (const file of collectFiles(distDir)) {
    const content = readFileSync(file, 'utf8')
    if (content.includes('SAVE_PEPPER')) leaked.push(file)
  }
  if (leaked.length > 0) {
    console.error(`[${BANNER}] dist 中存在 SAVE_PEPPER 字面量：${leaked.length} 个文件`)
    process.exit(1)
  }
  console.log('build:public: SAVE_PEPPER 未泄漏进 dist（SAVE_PEPPER: ABSENT，字面量扫描通过）')
}
console.log('build:public: PASS')
