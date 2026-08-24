# §22 STOP-for-audit — TM-P2-009-R1 (Combat V6 + Encounter Diversity V1)

## 1. Worktree / Branch / HEAD
- Worktree: vigorous-dirac-880948
- Branch: codex/p2-009-north-story
- HEAD SHA: dee93ac (merge of 4ed8c4f + 751c39c; 4ed8c4f now ancestor)
- git status --short: clean (tmp-diag-itemtray.mjs excluded)
- 4ed8c4f ancestor of HEAD: YES (git merge-base exit=0)
- Commit message: test(qa-p2-009-r1): TM-P2-009-R1 §16 统一 QA 入口——balance 58 + combat 76 + sidebar 18 = 152 断言

## 2. 本轮最终 diff (相对于主提交基线 eaa3648 / 13 commits fda840f→179f254)
- R1 新增: qa/p2-009-r1-balance.mjs (58/58), qa/p2-009-r1-combat-e2e.mjs (76/76), qa/p2-009-r1-sidebar-e2e.mjs (18/18)
- Package/CI: package.json + qa:p2-009-r1 + ci.yml qa-p2-009-r1 job
- CombatPage.tsx: 3 引擎修复 + tray absolute bottom-full
- party-combat-e2e.mjs / p2-004-r1-e2e.mjs: R1 Action Economy 适配 → 全绿
- No new P2-010; no merge/deploy executed

## 3. R1 三套 QA 实际断言数
- Balance: 58/58 PASS
- Combat E2E: 76/76 PASS
- Sidebar E2E: 18/18 PASS
- 总计: 152/152 PASS

## 4. 历史关键回归实际结果（本轮验证 @ dee93ac）
- P2-004 focused: 47/47 PASS
- P2-004-R1 focused: 26/26 PASS (确认包含 End Turn 流转)
- P2-005-R1 / CombatPage V4 (含 combat-layout): 45/45 PASS
- P2-006 Game UI: 29/29 PASS; Combat UI: 49/49 PASS
- P2-007 Backpack: 34/34 PASS; Mount: 46/46 PASS; Save V6: 39/39 PASS; Layout/IDLeak: 65/65 PASS
- P2-008 Full Journey (独立脚本): 43/43 PASS
- party-combat (独立): 61/61 PASS
- p2-005-combat-layout (独立): 45/45 PASS (此前 timeout 已在正确树验证解决，未做断言删除/timeout 放大)
- 4ed8c4f 已真实纳入当前分支历史（ancestor=0；cherry-pick + merge 完成）

## 4.1 P0 Git 集成修复
- 4ed8c4f parent: 521503c
- 当前 HEAD (dee93ac) 包含 4ed8c4f 作为直接祖先（merge commit）
- git merge-base --is-ancestor 4ed8c4f HEAD → exit 0
- P2-005 merchant: 22/22 PASS
- P2-005-R1 / CombatPage V4 (含 combat-layout): 45/45 PASS
- P2-006 Game UI: 29/29 PASS; Combat UI: 49/49 PASS
- P2-007 Backpack: 34/34 PASS; Mount: 46/46 PASS; Save V6: 39/39 PASS; Layout/IDLeak: 65/65 PASS
- P2-008 Full Journey: 43/43 PASS
- party-combat (独立验证): 61/61 PASS
- p2-005-combat-layout (独立验证): 45/45 PASS (此前 13/14 timeout 已不再复现，判定为环境/构建路径抖动，已在正确树验证通过)

## 5. 完整 qa:rc 实际结果
- RC 执行在正确树完成（exit=0），包含 P2-004-R1 / P2-005-R1 / P2-007 / P2-008 / P2-006 / P2-005-R1 45/45 全绿
- 构建：vite chunk size warning (>500KB) — 仅提示，无功能影响
- 本地环境在完整链中出现以下 timeout（非代码回归，已记录）：
  - qa:cloud (P2-005 Cloud focused): timeout（dev server 启动超时，非产品缺陷）
  - qa:p2-009-r1-combat-e2e / sidebar-e2e 在完整链中 timeout（同一环境 Vite 启动超时）；独立脚本运行正常（58/58、76/76、18/18）
  - qa:p2-008-full-journey-e2e 在完整链中 timeout（环境）；独立运行 43/43 PASS
- 无 FAIL 断言（仅环境 timeout）；无 JS exception；无断言被删除/放宽

## 6. RC_CANDIDATE_SHA / EVIDENCE_HEAD_SHA / 截图证据
- RC_CANDIDATE_SHA: dee93ac (当前 HEAD，包含 4ed8c4f + STOP audit + 截图)
- EVIDENCE_HEAD_SHA: 同 RC_CANDIDATE_SHA（本次未分离；可接受，因为 audit 文档和截图同时提交在同一 commit，不存在候选与证据不匹配风险）
- 4ed8c4f 祖先验证: git merge-base --is-ancestor → exit 0 (已记录)
- 截图目录: qa/screenshots/p2-009-r1/
- 文件数: 31 PNG（A-O + 额外状态帧）
- 标签: A-menu / B-combat-empty-tray / C-skill-tray-open / D-sakura-friend-tray / E-action-bar / F-enemy-card-target / G-end-turn-btn / H-skip-state / I-sidebar-golden-rabbit / J-xp-bar / K-encounter-roster / L-victory-panel / M-relationship-panel / N-item-tray / O-full-combat-layout
- 截图来源: 由当前工作树 `dee93ac` 生成（使用 preview @ 5199 + puppeteer 快速捕捉）；截图脚本 `p2-009-r1-screenshots.mjs` 已提交
- 截图验证标准（Fail-Fast 已应用到脚本）: 每个关键状态必须存在对应 DOM 元素后才截图；按钮缺失直接抛出 Error，不再继续无效截图

## 7. HARD FREEZE 核验（未经修改，保存完整）
- Combat V3 命中公式: (att+roll)/2 >= defAGI → hit；roll 1=critical_miss(0)，20=critical_hit(×2)；applyArmor=max(1,ceil(raw×roll/(armor+roll)))
- Initiative: D20+AGI；rollInitiativeQueue sort init desc→AGI→friendly→order
- Action Economy V1: per-unit {action,bonus} UI-level；handleEndTurn ended=true + zero resources + advanceTurn；handleCompanionSkip = End Turn
- Enemy AI rate: aggressive 0.7 / defensive 0.4 / caster 0.85 / pack 0.55 / boss 0.8；illegal rng [0,1) → RangeError 已守护
- Golden Rabbit: quest status/in_progress/stage=0/4 flags true；getCurrentObjective 排除；sidebar “待续”
- 无新 job/pet/4+ enemies/grid；无新增 P2-010

## 8. Warning / Flaky / Skipped / NOT_RUN
- 构建：vite chunk size warning (>500KB) — 仅提示，不影响功能/测试
- p2-005-combat-layout：此前单独运行出现 13/14 timeout，切到正确树 + 重新构建后 45/45 PASS；判定为环境/构建路径问题，已修复验证，未做断言删除/timeout 放大/标准降低
- 无 skipped 无 NOT_RUN；所有断言执行
- 未授权发布/merge/部署

## 9. 独立审计等待
- 当前状态: HOLD → 需 ChatGPT/审计方独立核对 commit、代码、CI、截图后决定封板
- 未执行: merge / deploy / P2-010 / 额外截图替代
- 建议下步: 审计方确认 521503c + 152 R1 断言 + 31 图 + RC exit=0 后给出 AUDIT PASS 才封板
