# §22 STOP-for-audit — TM-P2-009-R1 (Combat V6 + Encounter Diversity V1)

## 1. Worktree / Branch / evidence head
- Worktree: vigorous-dirac-880948
- Branch: codex/p2-009-north-story
- RC product candidate: dee93ac7125864ee2659abd84908ed4c233004a2
- Evidence artifact commit: ba365e88f2b527ab3414c943c5579dbf3e695748
- 4ed8c4f ancestor of evidence head: YES (`git merge-base --is-ancestor`, exit 0)
- Pre-existing untracked diagnostic preserved and excluded: qa/tmp-diag-itemtray.mjs

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

## 4. 历史关键回归实际结果（R2 evidence gate @ ba365e8）
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
- 2026-08-25 R2 gate 在正确 worktree 完整执行，`qa:rc` exit=0；P2-004-R1 / P2-004 / Cloud / P2-008 Full Journey / Responsive / GamePage Layout / Combat / Merchant / Worker+D1 / P2-006 / P2-007 全绿
- 构建：vite chunk size warning (>500KB) — 仅提示，无功能影响
- 本轮没有 timeout、FAIL、JS exception、skip、todo、only，也没有删除或放宽断言
- 同轮额外执行：1592/1592 unit、build、R1 152/152、P2-008 全套、R2 screenshots 16/16，全部 exit=0

## 6. RC_CANDIDATE_SHA / EVIDENCE_HEAD_SHA / 截图证据
- RC_CANDIDATE_SHA = dee93ac7125864ee2659abd84908ed4c233004a2
- EVIDENCE_HEAD_SHA = ba365e88f2b527ab3414c943c5579dbf3e695748
- SHA 说明：Git commit 不能在自身内容中预先写入自身 SHA，因此脚本与 PNG 先形成上述 evidence artifact commit；本文件随后仅记录该已存在 SHA，不修改产品源码或证据文件
- 4ed8c4f 祖先验证: git merge-base --is-ancestor → exit 0 (已记录)
- 截图目录: qa/screenshots/p2-009-r1/
- 文件数: 16 PNG（正式 A–O；G 含 G1/G2）
- 标签: A_combat_1920 / B_multi_units / C_initiative_strip / D_unit_card_rows / E_skill_tray_open / F_item_tray_open / G1_actionbar_tray_closed / G2_actionbar_tray_expanded / H_detail_log / I_friendly_switch / J_enemy_skill_blackfire / K_variant_preview_unlocked / L_variant_preview_locked / M_golden_rabbit_pending / N_xp_bar_250_450 / O_combat_390
- 截图来源: evidence commit `ba365e8` 的 `qa/p2-009-r1-screenshots.mjs` 自启 Vite、使用临时 Chrome profile 与 Save V6 fixtures 生成
- 截图验证标准: 每个状态先做 DOM/状态断言；ActionBar Y 差 <=1px；按钮或状态缺失立即 throw、exit 1；目录在运行前重建，因此不会混入 stale evidence

## 7. HARD FREEZE 核验（未经修改，保存完整）
- Combat V3 命中公式: (att+roll)/2 >= defAGI → hit；roll 1=critical_miss(0)，20=critical_hit(×2)；applyArmor=max(1,ceil(raw×roll/(armor+roll)))
- Initiative: D20+AGI；rollInitiativeQueue sort init desc→AGI→friendly→order
- Action Economy V1: per-unit {action,bonus} UI-level；handleEndTurn ended=true + zero resources + advanceTurn；handleCompanionSkip = End Turn
- Enemy AI rate: aggressive 0.7 / defensive 0.4 / caster 0.85 / pack 0.55 / boss 0.8；illegal rng [0,1) → RangeError 已守护
- Golden Rabbit: quest status/in_progress/stage=0/4 flags true；getCurrentObjective 排除；sidebar “待续”
- 无新 job/pet/4+ enemies/grid；无新增 P2-010

## 8. Warning / Flaky / Skipped / NOT_RUN
- 构建：vite chunk size warning (>500KB) — 仅提示，不影响功能/测试
- 历史 timeout 记录保留在旧提交中；本轮 R2 gate 未复现，所有要求命令均 exit=0
- 无 skipped / NOT_RUN；所有断言执行
- 未授权发布/merge/部署

## 9. 独立审计等待
- 当前状态: P2-009-R2 evidence sealed；PR #8 仍 Draft/Open，等待与 P2-010 一并最终审计
- 未执行: merge / deploy / P2-010 / 额外截图替代
- 建议下步: 审计方确认 `dee93ac` product candidate + `ba365e8` evidence + R1 152 断言 + 16 formal screenshots + gate exit=0
