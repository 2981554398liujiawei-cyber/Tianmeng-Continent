#!/usr/bin/env node
/**
 * deploy-public.mjs —— 公网发布（TM-P2-007-R1 BLOCKER C）。
 *
 * 统一 release source 的唯一规则：
 *   发布源只能是 main（MAIN_FINAL_SHA = origin/main 的 HEAD），PR 分支从不直接发布。
 *   gh-pages 提交信息固定为：deploy(<tag>): source <MAIN_FINAL_SHA>（可审计溯源）。
 *
 * 链路：
 *   1. 校验 当前 HEAD == origin/main HEAD（不是 → [DEPLOY BLOCKED]，发布源不统一）
 *   2. 校验 VITE_CLOUD_SAVE_API_BASE 是公网 https 端点（复用 build:public 门禁）
 *   3. npm run build:public（含 SAVE_PEPPER 泄漏 gate）
 *   4. 把 dist 提交到 gh-pages 分支（临时 worktree），commit message 含 source=<MAIN_FINAL_SHA>
 *   5. 推送 origin gh-pages
 *
 * 用法：
 *   VITE_CLOUD_SAVE_API_BASE=https://<worker-public-url> npm run deploy:public
 *   VITE_CLOUD_SAVE_API_BASE=https://<worker-public-url> npm run deploy:public -- --dry-run   # 只校验+构建，不提交不推送
 *
 * 安全：绝不 force push main；gh-pages 用普通快进 push（冲突则中止并提示）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, cpSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BANNER = 'DEPLOY BLOCKED'
const dryRun = process.argv.includes('--dry-run')
const root = process.cwd()

function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', ...opts })
  if (r.status !== 0) {
    const msg = (r.stderr ?? r.stdout ?? '').trim()
    throw new Error(`git ${args.join(' ')} 失败：${msg}`)
  }
  return r.stdout.trim()
}

function fail(lines) {
  console.error(`[${BANNER}]`)
  for (const l of lines) console.error(`  - ${l}`)
  process.exit(1)
}

// ---- 1. release source 唯一性：HEAD 必须 == origin/main HEAD ----
let originMainSha, headSha
try {
  originMainSha = git(['rev-parse', 'origin/main'])
  headSha = git(['rev-parse', 'HEAD'])
} catch (err) {
  fail([`无法解析 git 引用：${err.message}`])
}
if (headSha !== originMainSha) {
  fail([
    `发布源不统一：HEAD=${headSha.slice(0, 12)} ≠ origin/main=${originMainSha.slice(0, 12)}。`,
    '发布必须从 main 构建；请先 merge 到 main 并在 main 上执行本脚本。',
  ])
}
console.log(`deploy-public: release source 统一 ✓（HEAD == origin/main ${headSha.slice(0, 12)}）`)

// ---- 2. 公网端点门禁（与 build:public 一致）----
const apiBase = (process.env.VITE_CLOUD_SAVE_API_BASE ?? '').trim()
const isHttps = apiBase.startsWith('https://')
const isLocalhost = /(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/.test(apiBase)
if (!apiBase || !isHttps || isLocalhost) {
  fail([
    `VITE_CLOUD_SAVE_API_BASE 必须是公网 https 端点（当前：${apiBase || '(空)'}）。`,
    `用法：VITE_CLOUD_SAVE_API_BASE=https://<worker-public-url> npm run deploy:public${dryRun ? ' -- --dry-run' : ''}`,
  ])
}
console.log(`deploy-public: 公网端点校验通过（${apiBase}）`)

// ---- 3. build:public（含 SAVE_PEPPER 泄漏 gate）----
const build = spawnSync('npm run build:public', { shell: true, stdio: 'inherit' })
if (build.status !== 0) {
  fail([`build:public 失败（exit=${build.status}），中止发布。`])
}

// ---- 4. 更新 gh-pages 分支（临时 worktree）----
const distDir = resolve(root, 'dist')
if (!existsSync(distDir)) fail(['dist 目录不存在。'])

const tag = process.env.DEPLOY_TAG ?? 'p2-007-r1'
const commitMessage = `deploy(${tag}): source ${headSha}`

if (dryRun) {
  console.log('deploy-public: --dry-run，跳过 gh-pages 提交与推送。')
  console.log(`deploy-public: 计划提交信息 → ${commitMessage}`)
  console.log('deploy-public: DRY-RUN PASS')
  process.exit(0)
}

// 校验 gh-pages 分支存在（git 已 fetch origin）
try {
  git(['rev-parse', 'gh-pages'])
} catch {
  fail(['缺少本地 gh-pages 分支。请先：git fetch origin gh-pages && git branch --track gh-pages origin/gh-pages'])
}

const tmpDir = mkdtempSync(join(tmpdir(), 'tianmeng-ghpages-'))
try {
  git(['worktree', 'add', '--detach', tmpDir, 'gh-pages'])
  // 清空 gh-pages 工作树并填入新 dist
  const existing = readdirSync(tmpDir).filter((n) => n !== '.git')
  for (const n of existing) rmSync(join(tmpDir, n), { recursive: true, force: true })
  cpSync(distDir, tmpDir, { recursive: true })
  // 确保 .nojekyll（GitHub Pages 不跑 Jekyll）
  writeIfMissing(join(tmpDir, '.nojekyll'), '')

  git(['-C', tmpDir, 'add', '-A'])
  const status = spawnSync('git', ['-C', tmpDir, 'status', '--porcelain'], { encoding: 'utf8' })
  const changed = status.stdout.trim().split('\n').filter(Boolean)
  if (changed.length === 0) {
    const previousSource = git(['-C', tmpDir, 'log', '-1', '--format=%s'])
    if (previousSource === commitMessage) {
      console.log('deploy-public: gh-pages 无变更，且已溯源至当前 main。')
    } else {
      // Bundle 可以相同，但每个最终 main SHA 都必须有可审计的 gh-pages 溯源提交。
      git(['-C', tmpDir, 'commit', '--allow-empty', '-m', commitMessage])
      console.log(`deploy-public: gh-pages 溯源提交（bundle 未变） → ${commitMessage}`)
    }
  } else {
    git(['-C', tmpDir, 'commit', '-m', commitMessage])
    console.log(`deploy-public: gh-pages commit → ${commitMessage}`)
  }
  // 推送 gh-pages（普通快进；冲突则中止不覆盖）
  const push = spawnSync('git', ['-C', tmpDir, 'push', 'origin', `HEAD:gh-pages`], { encoding: 'utf8' })
  if (push.status !== 0) {
    fail([`推送到 origin/gh-pages 失败：${(push.stderr ?? '').trim()}\n请检查是否与远端 gh-pages 分叉，手动处理后重试。`])
  }
  console.log(`deploy-public: 已推送 gh-pages（source=${headSha.slice(0, 12)}）`)
  console.log('deploy-public: PASS')
} finally {
  try {
    git(['worktree', 'remove', '--force', tmpDir])
  } catch {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

function writeIfMissing(file, content) {
  if (!existsSync(file)) writeFileSync(file, content, 'utf8')
}
