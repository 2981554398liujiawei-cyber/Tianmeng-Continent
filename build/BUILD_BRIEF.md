# TM-P2-010 Build Brief

## 成品目标

- 目标：在现有单人浏览器 D20 文字叙事 CRPG 中交付《天龙武备试炼》、四职业 Tier II 技能与区域历练 V2，并保持 P2-008、P2-009、P2-009-R1 行为兼容。
- 目标运行时：桌面与移动端现代 Chromium 浏览器；验证视口为 1920x1080、1600x900、1366x768、1024x768、390x844。
- 首发语言：简体中文。
- 本阶段批准基线：用户提供的 `TM-P2-010` 大卡及仓库既有设计/正史。仓库没有独立 `GAME_DESIGN.md`、`ART_DIRECTION.md`、`PRODUCT_BRIEF.md`；不得据此扩展任务卡之外的产品范围。

## 必读设计

- 用户任务卡：`TM-P2-010｜天龙武备试炼 + 职业成长 V2 + 历练生态 V2 + P2-009 最终证据封板`
- `canon/`、`design/` 与 `docs/` 中现有项目资料。

## 必须保真

- 核心循环：收到邀请 -> 报到并固化职业路线 -> 观察考（失败也推进）-> 固定 authored Trial Encounter -> 战斗胜利并回报 -> 一次性奖励 Tier II 技能、120 XP、50 金币、铜章 -> 主动选择区域历练 -> 保存/载入保持状态。
- 四职业：warrior、knight、ranger、mage；只写一个路线 flag。
- 旧存档：`martial_trial_invited || knight_trial_invited` 均有效；继续使用 Save V6、`learnedSkillIds`、Quest/world flags 与 Encounter variant 状态。
- 战斗冻结：initiative 为 D20+AGI；命中、nat1/nat20、glancing、armor、Action/Bonus、End Turn、Ready Block、三行单位卡及 ActionBar 位置不变；Trial 最多 3 敌人、允许逃跑和现有伙伴、无动态等级缩放。
- 历练：复用现有 Encounter/variant/repeat reward；逃跑或失败不发 XP/loot，重复不得发任务奖励、必需物或剧情 flag。
- 黄金兔：任务状态、stage、四个 flags、`rabbit_path x1` 与“现阶段线索已收集 · 待续”完全冻结。
- 视觉锚点：技能为纵向 Tier I -> Tier II 卡树；区域历练卡显示风险、等级、敌方构成、重复阅历和掉落；桌面 Tray 展开时 ActionBar Y 差不超过 1px；移动端无横向溢出。
- 玩家可见文本使用现有简洁奇幻叙事声口；禁止暴露 `quest_`、`clue_`、`enemy_`、`encounter_`、`location_`、`item_`、`skill_`、`companion_`、`mount_`、`event_`、`trial_` 原始 ID。
- 社交表现：纯单人游戏；Sakura 若在队仅有最多两处可选插话，不强制关系、恋爱或自动解题。
- 动态媒体与语音：本阶段无新增动态媒体或语音资产。

## 范围

必须包含：试炼任务与地点、四条职业路线、观察考 fail-forward、四个 Trial Encounter 与训练敌人技能、四个 Tier II 技能、一次性奖励、技能树 UI、至少三个区域各 2+ 历练选择、等级提示、variant preview/lock 一致性、P2-011 文字钩子、A-P fail-fast 截图、六个 P2-010 QA 入口、CI 回归任务及全量本地 gate。

明确排除：Save V7、Combat V3 数学变更、动态缩放、新 Effect Engine、技能点/重置/完整天赋树、单人试炼框架、P2-011 正式任务，以及任务卡第 59 节列出的系统与剧情扩展。

## 实现自由

在现有 React/Vite/Zustand 架构中复用 data registry + pure rules + store actions + UI rendering。业务结算不得下沉到 UI，UI 不得根据 raw skill ID 特判奖励。

## 工具链与权威验证

```yaml
toolchain:
  targetPlatform: web
  targetRuntime: modern Chromium browser
  testedRuntime: local Chromium browser
  engine: React + Vite
  engineVersion: Vite 8.2.1, React 19.2.8
  runtime: Node.js
  runtimeVersion: v24.14.0
  packageManager: npm@11.9.0
  browser: Google Chrome 151.0.7922.170
commands:
  install: npm ci
  buildOrExport: npm run build
  start: npm run dev -- --host 127.0.0.1
  verify: npm run verify:p2-010
verification:
  suites:
    - unit
    - build
    - cloud
    - worker
    - production-smoke
    - p2-008
    - p2-009
    - p2-009-r1
    - p2-010
    - release-candidate
    - p2-010-screenshots
  completeRun: qa/verification.json#completeRun
  evidenceIndex: qa/verification.json#checkpoints
```

## 完成证据

- 一条 `npm run verify:p2-010` 必须顺序调用全部 required suites，并把完整输出保存为 `qa/evidence/verify.log`。
- `qa/verification.json` 必须登记 source commit、命令、退出码、运行环境、每个 suite 的 executed/result，以及从 P2-009 完成存档到试炼、技能、历练、保存、主菜单、载入和黄金兔冻结的 state/runtime/visual checkpoints。
- A-P 截图由 fail-fast 脚本生成到工作区持久目录；每张图先断言对应真实状态。项目既有证据规范要求 PNG，本卡明确要求 A-P 名称，故继续使用 PNG。
- 最终回写实际 Chrome 版本、权威验证结果、证据路径、限制与相对本范围的增删差异。

## 最终范围对照

- 已交付任务卡要求的试炼任务、四职业路线、观察考 fail-forward、四组固定试炼阵容、一次性奖励、Tier II 技能与技能树、区域历练 V2、P2-011 文字钩子、A-P 截图、六个 P2-010 QA 入口及 CI 回归任务。
- 权威命令 `npm run verify:p2-010` 在候选 `c9e60b61ca013bc7c002c4643965e42adfa4f38a` 上退出 0；完整日志为 `qa/evidence/verify.log`，结构化索引为 `qa/verification.json`。
- 没有批准或实施范围增删；Save 仍为 V6，Combat V3 公式和黄金兔冻结线保持不变，P2-011 未启动。
- 已知非阻塞限制：Vite 报告单个 minified JavaScript chunk 为 563.38 kB；审计通过前未部署，也未做公网运行验证。
