# TM-P2-009 §13 驿站狼群 Balance Regression 报告

> 生成时间：2026-08-23T13:56:04.669Z ｜ Node v24.14.0 ｜ 每 pairing 模拟 **5000** 次 ｜ 种子 **20260823**
> 全部结算调用 `src/game/rules/partyCombat.ts` + `src/game/rules/combat.ts` 正式纯函数；数据断言读 `encounters.ts` / `enemies.ts` / `lootTables.ts`；骰面由 mulberry32 seeded PRNG 生成，可复现。

## 1. 校验对象（B1–B4 数据层断言）

### 1.1 encounter_waystation_wolf_pack 注册（B1）

| 字段 | 值 |
| --- | --- |
| variant | waystation_wolf_pack_fixed（weight 1） |
| 成员 | 荒原野狼×2 + 魔化狼×1（共 3 敌，≤3 ✓） |
| canEscape | true |
| encounterDefeatFlag | waystation_wolf_pack_neutralized |

### 1.2 敌人数值（B3，直接读 `enemies.ts`）

| 敌人 | Lv | maxHp | armor | attackPower | 敏捷 | adventureXpReward |
| --- | --- | --- | --- | --- | --- | --- |
| wild_wolf（荒原野狼） | 2 | 10 | 11 | 14 | 12 | 15 |
| corrupted_wolf（魔化狼） | 2 | 12 | 12 | 14 | 12 | 15 |

### 1.3 掉落表（B4，直接读 `lootTables.ts`）

| 掉落表 | guaranteed | random | lucky |
| --- | --- | --- | --- |
| wild_wolf | wolf_fang | wolf_pelt (35%) | wolf_meat (DC12) |
| corrupted_wolf | wolf_meat | wolf_meat (40%) | — |

> 狼类材料命中（wolf_fang / wolf_pelt / wolf_meat 取并集）：**wolf_fang / wolf_pelt / wolf_meat**（共 3 种 ≥ 2），狼类掉落复用成立。

## 2. Monte Carlo 模拟（B5/B6）

> 场景：Lv2 骑士（str13/con12/agi10/mnd8/lck10，初始装备铁剑+旅行布衣）+ 常驻伙伴 Sakura（p2-007 多敌 pairing 结构）。
> 判定基准：驿站狼群（3 敌）胜率 ∈ (0, 95%]；且显著低于荒原狼群 A（2×荒原野狼，Δ ≥ 5pp）。

| 场景 | 对手 | 胜率% | 失败率% | 平均回合(胜) | 判定 |
| --- | --- | --- | --- | --- | --- |
| 参照（同级单敌） | 1×黑鬃魔狼 | 99.7 | 0.3 | 3.0 | — |
| 荒原狼群 A | 2×荒原野狼 | 92.2 | 7.8 | 3.9 | 参照（P2-008 已验收） |
| 驿站狼群 | 2×荒原野狼+1×魔化狼 | 29.9 | 70.1 | 5.4 | PASS（>0% 且 ≤95%） |

> 驿站狼群胜率 29.9%；较荒原狼群 A（92.2%）下降 **62.3pp**（多敌更难 ✓）。

## 3. 确定性（B7）

同 seed（20260823）同一 suite（三组 pairing）连续运行两次，结果完全一致：是。

## 4. 结论

驿站狼群（encounter_waystation_wolf_pack）作为《断旗余声》Stage C 战斗解，对 Lv2 玩家是**「可挑战但不失衡」**的可选遭遇：

- 数据层合法：单一 fixed variant（waystation_wolf_pack_fixed）、成员 ≤3、canEscape=true、defeatFlag 正确挂载。
- 固定阵容 2×荒原野狼 + 1×魔化狼（Lv2 两档），敌人数值与狼类掉落表按 §13 正确挂载。
- 骑士+Sakura 配对胜率处于 (0, 95%] 区间：可以打，但不无脑碾压。
- 驿站狼群（3 敌）胜率显著低于荒原狼群 A（2×野狼，Δ ≥ 5pp）：加入魔化狼后更难，数量带来可感知难度梯度。
- 模拟全程确定性（同 seed 可复现），结果可信。

## 5. 方法说明与简化假设

- Lv2 骑士 build 按 §13 指定：str13/con12/agi10/mnd8/lck10；初始装备铁剑 +2 / 旅行布衣 +1；升级成长按 progression（+2 HP/+1 MP）。
- 配对结构：knight+Sakura 参照 p2-007 Scenario B（Lv2 + Sakura vs 2×Lv2 腐化狼）的多敌配对；伙伴 Sakura 只使用花刃（sakura_petalslash，MP1 单体伤害），魔法盾/轻舞为支持技从略。
- 玩家每回合优先职业技能（骑士重击 knight_power_strike，MP2、非每场一次）；MP 耗尽后普攻。
- 我方/敌方行动按 partyCombat 先手队列回合制：D20+AGI 降序 → 敏捷 → friendly → 稳定序；死亡单位跳过；环状推进（didTurnLoop 计回合）。
- 敌方 AI V1：chooseEnemyTarget 随机存活我方目标；敌人无技能（注册表全部普通攻击）。
- 命中/护甲/暴击/大失败/擦伤全部走 resolveAttack 正式纯函数。
- 本场景无坐骑，不涉及 Mount 加成；不使用道具。
