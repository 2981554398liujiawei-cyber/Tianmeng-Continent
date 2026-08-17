# rules/ —— 游戏规则层

## 已实现

### D20 核心检定（TM-P0-003，`d20.ts`）

- 属性修正：`getAttributeModifier(score) = floor((score - 10) / 2)`（五项属性共用）
- 熟练加值：`getProficiencyBonus(level)`，1–4:+2 / 5–8:+3 / 9–12:+4 / 13–16:+5 / 17–20:+6
- 标准 DC：`CHECK_DC = { easy: 8, normal: 10, moderate: 12, hard: 15, severe: 18 }`
- 检定模型：`D20 + 属性修正 + 熟练加值(仅熟练) + 情境修正 vs DC`
- 天然 20 → `critical_success`，天然 1 → `critical_failure`，均无视 total
- 入口：`rollD20()`（1–20 整数）、`resolveD20Check(input, roll)`（确定性结算）、`performD20Check(input)`（真实掷骰）
- 边界：非法骰面/等级/属性/DC/情境修正一律抛 `RangeError`，不产生 NaN/Infinity
- 检定属即时规则结果，不写入 GameState / localStorage

## 规划

战斗、任务判定、NPC 关系判定、豁免/攻击/伤害等由后续任务卡按需引入。
