# 《天梦大陆》封板 QA 证据报告

实现基线：`46b21a0fcc5beb9fd426f2e11eff691234d92880`

自动化状态：**PASS（517/517 RC；独立 production smoke 6/6）**
完整体验 QA 状态：**PARTIAL**；首次上手、核心幻想与招牌帧没有在本任务重新取证，均保持 `NOT_RUN`，不得据本报告宣称视觉或主观体验已通过。

## 环境与来源

| 字段 | 值 |
| --- | --- |
| source commit | `46b21a0fcc5beb9fd426f2e11eff691234d92880` |
| 本地环境 | Windows / PowerShell / Node `v24.14.0` / npm `11.9.0` |
| CI Node | 22 |
| target/tested runtime | Vite production build + Chrome/Puppeteer |
| 本卡独立执行 | `npm run build`；preview `127.0.0.1:5198`；`npm run qa:prod`；preview 清理确认 |
| E3 封板结果 | Unit 1261/1261、Cloud 67/67、Worker 18/18、RC 517/517 |

## Suite discovery 与最终结果

| suite | discovered from | runner | observed in final evidence | result |
| --- | --- | --- | --- | --- |
| Unit | `package.json#test`、`src/**/*.test.{ts,tsx}` | `npm test` | 是，E3 | **1261/1261 PASS** |
| Build | `package.json#build`、CI、`qa:rc` | `npm run build` | 是，本卡独立执行 | **PASS；68 modules** |
| Cloud contract | `package.json#qa:cloud`、CI、`qa:rc` | `npm run qa:cloud` | 是，E3 | **67/67 PASS** |
| Worker + Local D1 | `package.json#qa:worker`、`qa:rc` | `npm run qa:worker` | 是，E3 | **18/18 PASS（W1–W15 + S1–S3）** |
| Release regression | CI `Release Regression`、`package.json#qa:rc` | `npm run qa:rc` | 是，E3 | **517/517 PASS** |
| Production smoke | `package.json#qa:prod`、CI production smoke | preview + `npm run qa:prod` | 是，本卡独立执行 | **6/6 PASS** |

Legacy/diagnostic 脚本不作为独立封板计数；required 覆盖以最终 `qa:rc` 聚合结果为准。未发现已声明 required suite 缺席于最终自动化证据。

## 命令与证据

| command | exit | duration | result |
| --- | ---: | ---: | --- |
| `npm run build` | 0 | 约 1.19s | Vite 68 modules；产物生成成功 |
| `npm run preview -- --host 127.0.0.1 --port 5198` | 0（主动结束） | smoke 期间 | preview 就绪；测试后 5198 无监听 |
| `npm run qa:prod` | 0 | 约 3.55s | 6/6 PASS |
| `npm test` | 0（E3） | 未记录 | 1261/1261 PASS |
| `npm run qa:cloud` | 0（E3） | 未记录 | 67/67 PASS |
| `npm run qa:worker` | 0（E3） | 未记录 | 18/18 PASS |
| `npm run qa:rc` | 0（E3） | 未记录 | 517/517 PASS |

完整账本见 `qa/evidence/verify.log`。

## 独立验证

本卡对实现提交独立执行 production build 和 production smoke。Smoke 从真实 production preview 启动，确认标题、新游戏、继续游戏、无开发者控制台入口、且未写入存档；结束后确认 TCP 5198 无监听进程。Unit/Cloud/Worker/RC 采用 E3 返回的最终封板计数，不伪称为本卡独立复跑。

## 发现与回流表

| 编号 | 严重度 | 归属 | 发现 | 复验证据 |
| --- | --- | --- | --- | --- |
| — | — | — | 自动化封板未发现 blocker/major | Unit 1261、Build 68、Cloud 67、Worker 18、RC 517、Prod 6 均通过 |

## 首次上手裁决

**NOT_RUN**：本任务未重新采集常速冷启动第一分钟顺序截图，也未让未接触文档的干净上下文裁决者回答前提四问与两分钟理解度。因此首次上手不得判 PASS。

## 核心幻想演出裁决

**NOT_RUN**：本任务未按正常速度重新完成核心动词、三段弧和体验支柱的观察性试玩。517 条自动化断言不能替代该裁决。

## 招牌帧裁决

**NOT_RUN**：本任务未重新触发并采集干净招牌帧；现有图片不冒充本次 source commit 的视觉证据。

## 模型试玩手记（明确主观，不参与门禁）

本任务没有进行新的正常速度完整试玩，因此不对犹豫点、拖沓段落、重开意愿或“好玩”作判断。自动化结果只支持运行可靠性与已编码行为，不支持趣味结论。

## 未测试范围

- 盲测首次上手、前提传达门、两分钟理解度。
- 核心幻想/同玩法动词/三段弧的正常速度观察性裁决。
- 招牌帧、HUD 遮挡、色盲、最小字号与 reduced-motion 的本次视觉复核。
- 最重场景性能、人工长期平衡、留存与主观趣味。

## 最终裁决

**AUTOMATED RELEASE GATE: PASS** — Unit 1261/1261、Build 68 modules、Cloud 67/67、Worker 18/18、RC 517/517、Prod 6/6。
**OBSERVATIONAL / SUBJECTIVE QA: NOT_RUN** — 不扩大为完整体验 PASS。
