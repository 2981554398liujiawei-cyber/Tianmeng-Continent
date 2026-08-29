# 成品目标

网页 RPG《天梦大陆》增量章节《神泉之水》：在既有 Vite/React runtime 中完成探索、追踪、采集、战前准备、单场双阶段 Boss、特殊装备与世界反馈。任务卡是本轮已批准设计来源；仓库中没有 GAME_DESIGN.md 或 ART_DIRECTION.md。目标视口与性能预算：N/A（任务卡未指定，按现有响应式 QA 运行）。

# 必须保真

- Save V6 与 Combat V7 保持兼容；Boss phase 仅本场运行时。
- 黄金兔主线的状态、flags、rabbit_path 与库存不发生链接或改写。
- 采集为 authored one-time nodes；神泉水 guaranteed，非战斗消耗品。

# 范围

包含神泉任务/王五、北坡与山谷、Gathering V1、恰拉拉 Boss Phase V1、金刚巨盾门槛、P2-012 QA/CI。排除采集等级、刷新、挂机、持久化 Boss phase、部署与合并。

# 工具链与权威验证

toolchain:
  targetPlatform: web
  targetRuntime: Vite production build
  testedRuntime: local Chrome
  engine: React + Vite
  packageManager: npm
commands:
  install: npm ci
  buildOrExport: npm run build
  start: npm run dev -- --host 127.0.0.1
  verify: npm run qa:p2-012
verification:
  suites: [p2-012]
  completeRun: qa/verification.json#completeRun
  evidenceIndex: qa/verification.json#checkpoints

# 最终范围对照

待候选验证后回填。
