# TM-P2-007 §53 Balance Regression 报告（Party Combat V5 3v3）

> 生成时间：2026-08-23T03:17:54.631Z ｜ Node v24.14.0 ｜ 每 pairing 模拟 **5000** 次 ｜ 种子 **20260701**
> 全部结算调用 `src/game/rules/partyCombat.ts` + `src/game/rules/combat.ts` 正式纯函数；骰面由 mulberry32 seeded PRNG 生成，可复现。

## 0. 显著异常判定标准

只对「等量遭遇」（我方人数 = 敌人数）严格判定；人数不等场景低/高胜率均为数量预期，不判定。

| 场景 | 判定 | 含义 |
| --- | --- | --- |
| 同级单挑 | 胜率 < 55% | FLAG_WEAK：同级 1v1 打不过（P2-006 阈值沿用） |
| 同级团队遭遇 | 胜率 < 45% | FLAG_WEAK：同级等量团队遭遇打不过（五五开为设计预期，second dummy 为占位弱伙伴） |
| 同级等量 | 胜率 > 95% | FLAG_TRIVIAL：同级等量无压力 |
| 跨级等量（玩家 < 敌人，差 ≥ 2） | 胜率 > 90% | FLAG_OVERPOWER：低等级碾压高等级（平衡倒挂） |
| 高级等量 | 胜率 < 60% | FLAG_BAD：高级反而被同级反杀 |

## 1. Scenario A：Lv2 LUCK-heavy solo vs Lv5 骷髅战士×1（跨级 3）

| 职业 | 无坐骑胜率% | 火焰驹胜率% | Δpp | 异常 |
| --- | --- | --- | --- | --- |
| warrior | 6.5 | 10.5 | 4.1 | — |
| knight | 11.2 | 16.7 | 5.5 | — |
| ranger | 2.6 | 3.9 | 1.4 | — |
| mage | 7.9 | 10.9 | 3.0 | — |

## 2. Scenario B：Lv2 LUCK-heavy + Sakura vs 2×Lv2 腐化狼（2v2 同级）

| 职业 | 无坐骑胜率% | 火焰驹胜率% | Δpp | 异常 |
| --- | --- | --- | --- | --- |
| warrior | 75.1 | 76.3 | 1.2 | — |
| knight | 76.5 | 79.6 | 3.1 | — |
| ranger | 72.2 | 75.6 | 3.4 | — |
| mage | 75.7 | 76.9 | 1.1 | — |

## 3. Scenario C：3 friendly vs 3 enemy（Lv3 combat + Sakura + dummy vs 3×Lv3 骷髅士兵）

| 职业 | 胜率% | 失败率% | 平均回合(胜) | 异常 |
| --- | --- | --- | --- | --- |
| warrior | 52.1 | 47.9 | 5.2 | — |
| knight | 54.6 | 45.4 | 5.3 | — |
| ranger | 62.7 | 37.3 | 5.5 | — |
| mage | 48.1 | 51.9 | 5.4 | — |

> 关键验证点：3v3 同级团队遭遇应在合理区间（约 45%–75%）。

## 4. Scenario D：Fire Steed vs No Mount 收益可感知性（Lv3 combat build）

| 职业 | 对手 | 无坐骑胜率% | 火焰驹胜率% | Δpp |
| --- | --- | --- | --- | --- |
| warrior | Player vs 1敌 | 69.7 | 74.9 | 5.2 |
| warrior | Player+Sakura vs 2敌 | 78.2 | 81.8 | 3.6 |
| knight | Player vs 1敌 | 76.9 | 82.2 | 5.3 |
| knight | Player+Sakura vs 2敌 | 81.8 | 84.6 | 2.8 |
| ranger | Player vs 1敌 | 84.9 | 84.4 | -0.5 |
| ranger | Player+Sakura vs 2敌 | 85.4 | 86.6 | 1.2 |
| mage | Player vs 1敌 | 62.7 | 69.2 | 6.4 |
| mage | Player+Sakura vs 2敌 | 76.2 | 79.4 | 3.2 |

> 火焰驹平均收益 Δ3.4pp（有区分度场景最小 Δ3.2pp）→ 可感知且不造成倒挂。饱和场景（无坐骑胜率 <20% 或 >80%）Δ≈0 为统计预期，不计入判定。

## 5. 显著异常汇总

未发现显著异常。

## 6. 方法说明与简化假设

- Lv2 LUCK-heavy / Lv3 combat build、初始装备（铁剑 +2 / 旅行布衣 +1）；升级成长按 progression（+2 HP/+1 MP）。
- 玩家每回合优先职业技能（MP 足够且未被每场一次限制）；伙伴 Sakura 只使用花刃（sakura_petalslash，MP1 单体伤害）；测试伙伴普攻。
- 我方/敌方行动按 partyCombat 先手队列回合制：D20+AGI 降序 → 敏捷 → friendly → 稳定序；死亡单位跳过；环状推进（didTurnLoop 计回合）。
- 敌方 AI V1：chooseEnemyTarget 随机存活我方目标。
- 命中/护甲/暴击/大失败/擦伤全部走 resolveAttack 正式纯函数。
- Sakura 魔法盾 / 樱花轻舞、战士压制猛击取消反击为支持技/单敌效应，3v3 确定性模拟从略；敌人无技能。
- 坐骑加成按 P2-007 §20：先叠加有效五维再派生战斗数值（与 CombatPage / PlayerSidebar 一致）。
- 3v3 的 second dummy companion 为任务卡 §53 占位伙伴（基础属性、无技能），不代表最终第二伙伴数值。
