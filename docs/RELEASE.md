# 公网发布 SOP（GitHub Pages → Cloudflare Worker → D1）

> TM-P2-007-R1 BLOCKER C：统一 PR / main / gh-pages 的 release source。
> TM-P2-007-R2 §21-28：公网发布改由 GitHub Actions `release-public.yml` 执行（本机网络受限时的外部执行环境）。

## 唯一规则

**发布源只能是 `main`（MAIN_FINAL_SHA = `origin/main` 的 HEAD）。**

- PR 分支（codex/*、claude/* 等）从不直接发布；发布前必须先 merge 到 `main`。
- `gh-pages` 的每个发布 commit 信息固定为：
  `deploy(<tag>): source <MAIN_FINAL_SHA>`，确保线上产物可审计溯源到 main 上的确切代码。
- 普通 `npm run build` 无门禁（本地开发）；`npm run build:public` 强制公网端点 + secret gate（BLOCKER B）。

## R2 发布链路（推荐：GitHub Actions）

本机若无法访问 workers.dev / Cloudflare API（中国大陆网络风险），一律走：

1. **merge 到 main**：PR 全绿后 merge，记录 `MAIN_FINAL_SHA`（§34）。
2. **手动触发 `release-public.yml`**（workflow_dispatch）：
   - 输入 `confirm_release=yes`、`worker_url`、`public_game_url`。
   - 12 步：checkout exact main → npm ci → test → build → qa:cloud → qa:worker →
     qa:p2-007-r2（静态 gate）→ Worker HTTP smoke → build:public → deploy:public
     （gh-pages `deploy(p2-007-r2): source <SHA>`）→ wait-pages 传播 → qa:live（公网 LIVE E2E）→ public-smoke。
   - `CLOUDFLARE_API_TOKEN` 缺失：报告 `MISSING` 并跳过 D1/secret 审计步骤，其余照常（§23）。
   - 不无意义 redeploy Worker：Worker 健康由 `worker-http-smoke` + `qa:live`(LIVE-10) 验证（§24）。
3. **人工验证项**（token 存在时 workflow 自动跑）：D1 `cloud_saves` 表 / `SAVE_PEPPER: PRESENT`（只报名称，不输出值）。

## 发布链路（本机 / 手动）

```bash
# 0. 前置：PR 全绿并 merge 到 main（§13 CI 双 job 通过后）
git checkout main && git pull origin main

# 1. 部署 Worker（Cloudflare；只在 SAVE_PEPPER 确认存在时执行）
#    wrangler d1 migrations apply tianmeng-cloud-save --remote
#    wrangler secret list                 # 确认 SAVE_PEPPER: PRESENT（不输出值，绝不旋转）
#    wrangler deploy

# 2. 发布前端（构建门禁 + 提交 gh-pages + 推送；DEPLOY_TAG 控制 gh-pages commit 里的 tag）
DEPLOY_TAG=p2-007-r2 VITE_CLOUD_SAVE_API_BASE=https://<worker-public-url> npm run deploy:public

# 3. 线上验证（§16.3 / §28-29）
PUBLIC_GAME_URL=https://2981554398liujiawei-cyber.github.io/Tianmeng-Continent/ node qa/wait-pages.mjs
PUBLIC_GAME_URL=https://2981554398liujiawei-cyber.github.io/Tianmeng-Continent/ npm run qa:live
PUBLIC_GAME_URL=https://2981554398liujiawei-cyber.github.io/Tianmeng-Continent/ node qa/p2-007-r2-public-smoke.mjs
```

## 门禁与安全

- `build:public`：`VITE_CLOUD_SAVE_API_BASE` 必须非空 + `https://` + 非 localhost，否则 `PUBLIC BUILD BLOCKED`。
- `deploy:public`：HEAD 必须 == `origin/main`，否则 `DEPLOY BLOCKED`；`--dry-run` 只校验+构建不推送。
- `qa:live`：只响应显式 `PUBLIC_GAME_URL`；缺失 → `LIVE QA BLOCKED`。Device A/B 用两个真正隔离的 BrowserContext。
- `qa:p2-007-r2`：R2-01~10 静态 gate（发布链路脚本质量门禁）。
- SAVE_PEPPER：已存在则禁止旋转/覆盖/重新生成；只存在于 Cloudflare Worker 端，前端 bundle 严禁包含；
  报告只能写「SAVE_PEPPER: PRESENT」，不输出值。
- CORS：Worker 只允许 `https://2981554398liujiawei-cyber.github.io`（+ localhost + 显式 CORS_ORIGINS），禁止 `*`。
- 禁止 force push `main`；`gh-pages` 用普通快进 push（分叉则中止提示）。

## 已知网络风险

- workers.dev DNS 在本机/中国大陆网络可能被污染（解析超时），Worker 公网 smoke 需在可达环境执行。
- 本机不可达时，以 GitHub Actions `release-public.yml` 作为外部执行环境（§21）。
- 大陆直连公网游戏页面验证受限时，报告 `MAINLAND DIRECT ACCESS: PASS/BLOCKED`（§36），不迁移架构。

## 参考

- Worker 部署：docs/cloud-save.md
- 前端唯一公开配置：`.env.example` → `VITE_CLOUD_SAVE_API_BASE`
- Balance 唯一权威：`npm run qa:balance`（qa/p2-007-balance.mjs + qa/P2_007_BALANCE_REPORT.md，§53）
