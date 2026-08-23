#!/usr/bin/env node
/**
 * qa/wait-pages.mjs —— GitHub Pages 部署传播轮询（TM-P2-007-R2 §28）。
 *
 * 验证「公网页面已包含本次构建产物」：轮询 PUBLIC_GAME_URL 直到其 index.html
 * 引用的 JS/CSS asset 文件名与本地 dist 完全一致（LOCAL_DIST_JS_ASSET == PUBLIC_JS_ASSET）。
 * 最长轮询 PUBLISH_TIMEOUT_MS（默认 10 分钟），避免无限挂起。
 *
 * 用法：
 *   PUBLIC_GAME_URL=https://... node qa/wait-pages.mjs            # dist 默认 ./dist
 *   PUBLIC_GAME_URL=https://... DIST_DIR=out node qa/wait-pages.mjs
 *
 * 退出码：0=公网已含本地产物；1=超时/资产不匹配/参数缺失。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PUBLIC_GAME_URL = (process.env.PUBLIC_GAME_URL || '').trim()
if (!PUBLIC_GAME_URL) {
  console.error('WAIT-PAGES BLOCKED: PUBLIC_GAME_URL is missing')
  process.exit(1)
}
const DIST_DIR = (process.env.DIST_DIR || 'dist').trim()
const TIMEOUT_MS = Number(process.env.PUBLISH_TIMEOUT_MS || 600_000) // 10 分钟

/** 从 index.html 文本提取 JS/CSS asset 文件名（basename，忽略 base path 差异） */
function assetNamesFromHtml(html) {
  const js = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1].split('/').pop()).filter(Boolean)
  const css = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1].split('/').pop()).filter(Boolean)
  return { js, css, all: [...js, ...css] }
}

const localIndex = join(DIST_DIR, 'index.html')
if (!existsSync(localIndex)) {
  console.error(`WAIT-PAGES BLOCKED: 本地产物不存在 ${localIndex}`)
  process.exit(1)
}
const local = assetNamesFromHtml(readFileSync(localIndex, 'utf8'))
if (local.js.length === 0) {
  console.error('WAIT-PAGES BLOCKED: 本地 dist/index.html 无 JS asset')
  process.exit(1)
}
const localKey = local.all.join(',')
console.log(`[wait-pages] 本地产物 asset: ${localKey}`)

const start = Date.now()
let lastHtml = null
let lastStatus = 0
for (;;) {
  const elapsed = Date.now() - start
  if (elapsed > TIMEOUT_MS) {
    console.error(`WAIT-PAGES FAIL: 等待 ${Math.round(TIMEOUT_MS / 1000)}s 后公网仍未包含本地产物`)
    console.error(`  本地 asset=${localKey}`)
    console.error(`  公网 asset=${lastHtml ? assetNamesFromHtml(lastHtml).all.join(',') || '(空)' : '(页面不可达)'} status=${lastStatus}`)
    process.exit(1)
  }
  try {
    const res = await fetch(PUBLIC_GAME_URL)
    lastStatus = res.status
    if (res.ok) {
      const html = await res.text()
      lastHtml = html
      const pub = assetNamesFromHtml(html)
      const pubKey = pub.all.join(',')
      const hasAllLocal = local.all.every((a) => pub.all.includes(a))
      console.log(`[wait-pages] ${Math.round(elapsed / 1000)}s: 公网 status=${res.status} asset=${pubKey || '(空)'}`)
      if (hasAllLocal && pub.js.length > 0) {
        console.log(`[wait-pages] 传播完成：公网 asset 已含本地产物（${Math.round(elapsed / 1000)}s）`)
        console.log(`[wait-pages] LOCAL_DIST_JS_ASSET=${localKey}`)
        console.log(`[wait-pages] PUBLIC_JS_ASSET=${pubKey}`)
        process.exit(0)
      }
    }
  } catch {
    console.log(`[wait-pages] ${Math.round(elapsed / 1000)}s: 公网不可达，重试中`)
  }
  await new Promise((r) => setTimeout(r, 5_000))
}
