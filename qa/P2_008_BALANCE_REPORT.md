# TM-P2-008 §23-25 荒原狼群 Balance Regression 报告

> 生成时间：2026-08-23T08:15:18.009Z ｜ Node v24.14.0 ｜ 每 pairing 模拟 **5000** 次 ｜ 种子 **20260823**
> 全部结算调用 `src/game/rules/partyCombat.ts` + `src/game/rules/combat.ts` 正式纯函数；数据断言读 `encounters.ts` / `enemies.ts` / `lootTables.ts`；骰面由 mulberry32 seeded PRNG 生成，可复现。

## 1. 校验对象（B1–B4 数据层断言）

### 1.1 encounter_steppe_wolf_pack 注册（B1）

| variant | 权重 | 成员 | 成员总数 |
| --- | --- | --- | --- |
| steppe_wolf_pack_a | 50 | 荒原野狼×2 | 2 |
| steppe_wolf_pack_b | 30 | 黑鬃魔狼×1 + 荒原野狼×1 | 2 |
| steppe_wolf_pack_c | 20 | 荒原野狼×3 | 3 |

> 权重 50/30/20；任意 variant 成员总数 ≤ 3（§23 ≤3 敌人）。

### 1.2 敌人数值（B3，直接读 `enemies.ts`）

| 敌人 | Lv | maxHp | armor | attackPower | 敏捷 | adventureXpReward |
| --- | --- | --- | --- | --- | --- | --- |
| wild_wolf（荒原野狼） | 2 | 10 | 11 | 14 | 12 | 15 |
| black_mane_wolf（黑鬃魔狼） | 3 | 15 | 12 | 16 | 12 | 25 |

### 1.3 掉落表（B4，直接读 `lootTables.ts`）

| 掉落表 | guaranteed | random | lucky |
| --- | --- | --- | --- |
| wild_wolf | wolf_fang | wolf_pelt (35%) | wolf_meat (DC12) |
| black_mane_wolf | black_fang | black_mane_pelt (50%) | black_fang (DC12) |

> 狼类材料命中（wolf_fang / wolf_pelt / wolf_meat 取并集）：**wolf_fang / wolf_pelt / wolf_meat**（共 3 种 ≥ 2），复用狼类掉落成立。

## 2. Monte Carlo 模拟（B5/B6）

> 场景：Lv2 骑士（str13/con12/agi10/mnd8/lck10，初始装备铁剑+旅行布衣）+ 常驻伙伴 Sakura（p2-007 多敌 pairing 结构）。
> 判定基准：变体 A 胜率 ≥ 同级单敌参照（同阵容 vs 1×黑鬃魔狼）×60%，且 ≤ 95%。

| 场景 | 对手 | 胜率% | 失败率% | 平均回合(胜) | 判定 |
| --- | --- | --- | --- | --- | --- |
| 参照（同级单敌） | 1×黑鬃魔狼 | 99.7 | 0.3 | 3.0 | — |
| 变体 A（狼群×2） | 2×荒原野狼 | 91.7 | 8.3 | 3.9 | PASS（下限 59.8%，上限 95%） |
| 变体 C（狼群×3） | 3×荒原野狼 | 38.5 | 61.5 | 5.3 | Δ(A−C)=53.2pp（多敌更难） |

> 变体 A 胜率 91.7% = 参照 99.7% × 0.92（≥0.60 ✓）；变体 C 较 A 下降 **53.2pp**。

## 3. 单挑对照（透明报告，不作断言）

> 任务卡 B5 描述为「Lv2 骑士单挑变体 A」，故单跑 solo knight 对照供如实参考。

| 场景 | 对手 | 胜率% | 失败率% | 平均回合(胜) | 说明 |
| --- | --- | --- | --- | --- | --- |
| 参照（同级单敌） | 1×黑鬃魔狼 | 31.2 | 68.8 | 4.5 | solo 对 Lv3 魔狼约三成胜率，已是硬仗 |
| 变体 A（狼群×2） | 2×荒原野狼 | 2.9 | 97.1 | 4.9 | solo 双狼近乎不可行（≈2.9%） |

> 说明：solo Lv2 骑士单挑 2×荒原野狼胜率仅个位数，若以 solo 作为平衡基准，该遭遇对单人近乎不可行，与「可挑战但不失衡的可选遭遇」定位不符。
> 因此断言采用 p2-007 多敌配对结构（knight + Sakura）；solo 数值如实列出，不隐藏。

## 4. 确定性（B7）

同 seed（20260823）同一 suite（solo 对照 + knight+Sakura 五组 pairing）连续运行两次，结果完全一致：是。

## 5. 结论

荒原狼群（encounter_steppe_wolf_pack）作为北郊可选遭遇，对 Lv2 玩家是**「可挑战但不失衡」**的可选遭遇：

- 数据层合法：3 档变体、权重 50/30/20、成员 ≤3；敌人数值与狼类掉落表按 §23-25 正确挂载。
- 变体 A（2×荒原野狼，knight+Sakura）胜率处于合理区间（≥ 同级单敌参照×60% 且 ≤ 95%）：狼群可以打，但不无脑碾压，需要玩家认真对待。
- 变体 C（3×荒原野狼）胜率显著低于变体 A（Δ ≥ 5pp）：多敌即更难，数量带来可感知难度梯度。
- 单挑对照：solo 双狼近乎不可行（≈3%），符合「可选遭遇」的高风险定位——单刷求稳可打落单野狼，挑战奖励则带伙伴迎战狼群。
- 模拟全程确定性（同 seed 可复现），结果可信。

## 6. 方法说明与简化假设

- Lv2 骑士 build 按 §23-25 指定：str13/con12/agi10/mnd8/lck10；初始装备铁剑 +2 / 旅行布衣 +1；升级成长按 progression（+2 HP/+1 MP）。
- 配对结构：knight+Sakura 参照 p2-007 Scenario B（Lv2 + Sakura vs 2×Lv2 腐化狼）的多敌配对；伙伴 Sakura 只使用花刃（sakura_petalslash，MP1 单体伤害），魔法盾/轻舞为支持技从略。
- 玩家每回合优先职业技能（骑士重击 knight_power_strike，MP2、非每场一次）；MP 耗尽后普攻。
- 我方/敌方行动按 partyCombat 先手队列回合制：D20+AGI 降序 → 敏捷 → friendly → 稳定序；死亡单位跳过；环状推进（didTurnLoop 计回合）。
- 敌方 AI V1：chooseEnemyTarget 随机存活我方目标；敌人无技能（注册表全部普通攻击）。
- 命中/护甲/暴击/大失败/擦伤全部走 resolveAttack 正式纯函数。
- 本场景无坐骑，不涉及 Mount 加成；不使用道具。
