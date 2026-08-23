# P2-006 收口 · 完整 RC 单次串跑记录

对齐 TM-P2-007 任务卡第 2.1 节：**必须实际 `npm run qa:rc` 从头到尾一次完整运行退出码 0**，并记录以下数字。

## RC 单次串跑（2026-08-22）

```
RC START
2026-08-22 05:29:23 (+0800)   （日志文件创建时刻 = qa:rc 启动）
===== RC shared Vite ready: http://localhost:5199/ =====
===== RC suite start: P2-004-R1 =====          （28/28）
===== RC suite start: P2-004 =====             （47/47）
===== RC suite start: Cloud =====              （67/67）
===== RC suite start: Full Journey =====       （267/267）
===== RC suite start: Responsive =====         （20/20）
===== RC suite start: GamePage/Layout =====    （23/23）
===== RC suite start: Combat =====             （43/43）
===== RC suite start: Merchant =====           （22/22）
===== RC suite start: Worker + Local D1 =====  （18/18）
===== RC suite start: P2-006 Game UI =====     （29/29）
===== RC suite start: P2-006 Combat UI =====   （38/38）
===== RC suite start: P2-006 Balance =====     （exit=0，报告已生成）
===== RC shared Vite stopped =====
RC END
2026-08-22 05:46:31 (+0800)   （日志文件最后修改时刻 = qa:rc 完成）

TOTAL: 602
PASS: 602
FAIL: 0
duration: 17 分 08 秒（05:29:23 → 05:46:31，含 build + 12 个 suite 串跑）
exit code: 0
```

## 各 suite 明细

| suite | 脚本 | 结果 | 备注 |
| --- | --- | ---: | --- |
| P2-004-R1 | `qa/p2-004-r1-e2e.mjs` | 28/28 | shared Vite |
| P2-004 | `qa/p2-004-e2e.mjs` | 47/47 | shared Vite |
| Cloud | `qa/p2-005-cloud-e2e.mjs` | 67/67 | |
| Full Journey | `qa/p2-005-full-journey-e2e.mjs` | 267/267 | Phase 1 196 + R1 57 + R1 尾段 14 |
| Responsive | `qa/responsive-e2e.mjs` | 20/20 | shared Vite |
| GamePage/Layout | `qa/p2-005-layout-e2e.mjs` | 23/23 | |
| Combat | `qa/p2-005-combat-layout-e2e.mjs` | 43/43 | |
| Merchant | `qa/p2-005-merchant-e2e.mjs` | 22/22 | |
| Worker + Local D1 | `qa/p2-005-worker-e2e.mjs` | 18/18 | W1–W15 15/15 + Local D1 3/3 |
| P2-006 Game UI | `qa/p2-006-game-ui-e2e.mjs` | 29/29 | |
| P2-006 Combat UI | `qa/p2-006-combat-ui-e2e.mjs` | 38/38 | 含 CUI-R1 StrictMode 回归 |
| P2-006 Balance | `qa/p2-006-balance.mjs --phase after` | exit=0 | 生成 `qa/P2_006_BALANCE_REPORT_AFTER.md` |

**TOTAL/PASS/FAIL 校验**：28+47+67+267+20+23+43+22+18+29+38 = **602**；`grep -c "^PASS"` = 602，`grep -c "^FAIL"` = 0。Balance suite 为模拟器报告（无 PASS 行），计入 exit code 不计数。

## 运行方式与退出码捕获

```bash
npm run qa:rc > qa/rc-p2-006-close.log 2>&1; RC=$?
# RC_REAL_EXIT=0
```

> 注意：不能 `npm run qa:rc | tee log; echo $?` —— bash 管道退出码取最后一个命令（tee）的 0，会掩盖 npm 真实退出码；须重定向到文件后读取 `$?`。

## Full Journey 267 断言组成说明

- **Phase 1：196 项**（含 P2-005-R1 硬断言「既有 Phase 1 断言不少于 195 项（实际 196）」）
- **R1：57 项**（含 R1 存档冻结、黄金兔子王、北门失联剧情等）
- **R1 尾段：14 项**（Phase 2 至 Journey 结束）

两次运行的 PASS 总数差异（266 vs 267）经 diff 定位为 Full Journey 休整路径的真实分支差异：第一次「休整后 HP 满（无需休整）」（195），第二次「休整按钮可用」+「休整后 HP/MP 满」（196）。属真实 RNG 下的正常脚本分支，非缺陷 —— P2-005-R1 硬断言「不少于 195 项（实际 196）」满足下限，RC 全绿不受影响。

## 视觉证据

A–O 截图见 `qa/screenshots/p2-006/`（A–J 1920×1080、K–L 1366×768、M–O 390×844；其中 E 为 quest-column 元素特写 340×981，聚焦「已完成任务折叠」收起态），由 `qa/p2-006-screenshots.mjs` 采集，21/21 PASS。

截图独立性复验（md5sum）：15 张 PNG md5 全部互不相同（重复 0 组）——A≠B≠E、G≠I 等相邻状态均能区分。
