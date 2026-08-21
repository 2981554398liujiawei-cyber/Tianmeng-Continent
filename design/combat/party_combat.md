# Party Combat V5 — 多人战斗设计

> 依据任务卡 TM-P2-007 §9–17（Party Combat V5 与 3v3 UI）编制，配合现有规则代码（`src/game/rules/combat.ts` / `escape.ts` / `combatXp.ts`）确认已上线事实（`[CANON]`）。
>
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目对原著的改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。
>
> 权威优先级：任务卡 §9–17 为最高权威；现有公式（命中 / 护甲 / 逃跑）原样引用，**不得改写数学**。与 `02_SYSTEM_BOUNDARIES.md` 冲突时以边界文件为准。

---

## 1. 我方组成

任务卡 §9.1：最多

```text
Player
Companion 1
Companion 2
```

- friendly combatants：1–3；enemy combatants：1–3（任务卡 §2.2）。
- `[CANON]` 现状：仅一名伙伴「樱花优子」（`sakura_yuko`，`src/game/content/companions.ts`）；战斗可带 1 名 active companion。

---

## 2. Combatant 统一抽象

任务卡 §9.2 原文：

```ts
type CombatSide = 'friendly' | 'enemy';

interface Combatant {
  instanceId: string;
  side: CombatSide;
  sourceType: 'player' | 'companion' | 'enemy';
  sourceId: string;

  name: string;

  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;

  attack: number;
  armor: number;
  agility: number;

  isAlive: boolean;
}
```

- **不要把 GameState 整个复制进去**（任务卡 §9.2）。
- 战场层只保留战斗所需的扁平字段；派生属性（玩家 attack / armor）在入场时按现有正式计算路径落定（`combat.ts` `[CANON]`：`getPlayerAttackPower` / `getPlayerArmor` / `getPlayerAgility`）。

---

## 3. Initiative Queue

任务卡 §9.3：每个 combatant

```text
initiative = D20 + AGI
```

排序规则（任务卡 §9.3，四步）：

1. initiative 高者先
2. initiative 相同 → AGI 高者先
3. 仍相同 → friendly 优先
4. 同 side → 原始稳定顺序

- **Initiative 只在战斗开始 roll 一次**（任务卡 §9.3）。
- `[CANON]` 先手语义参照：`resolveInitiative`（`combat.ts`，D20+AGI 高者先、平局 AGI 高者先、仍相同玩家先）——V5 把「玩家 vs 敌人」扩展为「全员队列」，规则 3 的 friendly 优先与现有「玩家先」同向。
- Queue 构建须纯函数化（骰面由调用方提供），保证确定性可测。

---

## 4. Round

任务卡 §9.4：

- 所有存活单位行动一次后 Round +1。
- 死亡单位跳过。

---

## 5. Friendly Turn

任务卡 §10：

- 轮到 friendly 时，底部固定 Action Bar 显示当前行动者，例如：

```text
雅各布的回合
```

或：

```text
樱花优子的回合
```

- **玩家控制所有 friendly**（任务卡 §10）。
- **禁止把伙伴完全改成 AI 自动行动**（任务卡 §10）。

---

## 6. Target Selection

任务卡 §11：

- 敌对攻击 / 技能：点击后**先选存活敌人**，再执行。
- 友方盾 / 治疗：选择**存活 friendly target**。
- 自身技能：**无需 picker**。
- 必须有 `取消`；**取消不耗行动**。

- 敌方攻击 / 技能的目标选择由 Enemy AI V1 完成（见 §7），不对玩家开放 enemy 侧 picker。

---

## 7. Enemy AI V1

任务卡 §12，保持简单：

1. 收集 living friendly targets
2. injected RNG 随机选择一个
3. 执行当前正式 enemy action

函数纯化（任务卡 §12）：

```ts
chooseEnemyTarget(livingTargets, rng)
```

**不做**（任务卡 §12）：

```text
threat table
taunt system
healer priority
spell planner
behavior tree
```

- RNG 必须注入（纯函数），保证战斗流程可测试、可复现。

---

## 8. 胜负判定

任务卡 §13：

```text
Victory：all enemy isAlive === false
Defeat：all friendly isAlive === false
```

- 只要还有一个 friendly 活着，战斗继续（任务卡 §13）。
- 胜利 / 战败仅在整场 Encounter 层面判定（非逐个敌人结算）。

---

## 9. 多人逃跑

沿用现有公式（任务卡 §14；`escape.ts` `[CANON]`）：

```text
escapeScore =
(highestFriendlyAgility + D20) / 3
```

对比：

```text
highestEnemyAgility
```

成功：

```text
escapeScore >= highestEnemyAgility
```

- 只在 Player Character 自己的 turn 显示 `[尝试逃跑]`（任务卡 §14；伙伴回合不提供逃跑入口）。
- 失败：消耗 Player 当前 turn，Initiative Queue 正常继续（任务卡 §14）。
- 成功（任务卡 §14 原文）：

```text
combat ends
no XP
no loot
no gold
no defeated flags
no kill quest progression
```

- 即使已经杀掉 1/3 enemy，只要最终逃跑，本次 Encounter 不结算奖励（任务卡 §14）。
- `[CANON]` 已实现取最高敏捷的纯函数：`getHighestPartyAgility` / `getHighestEnemyAgility`（`escape.ts`）；多人场景复用并扩展到全部 friendly / 全部 enemy。

---

## 10. Combat XP

任务卡 §15：

多人战斗总 XP：

```text
sum(all defeated enemy adventureXpReward)
```

- 但只在整个 Encounter 胜利后发放（任务卡 §15）。
- **不能每杀一个立即写 GameState**（任务卡 §15）。
- `[CANON]` 重复遭遇语义保留：`getEnemyFirstKillXp`（`combatXp.ts`）——同种敌人仅首次正式击败给 `adventureXpReward`，重复遭遇 0 XP；多人场景按「每个 EnemyInstance 对应敌人类型」分别判定首次击败。

---

## 11. Combat Loot

任务卡 §16：

- 每个 EnemyInstance 在战斗内产生 `pendingLoot`。
- GameState 只在整体 Victory 事务中写入。
- Escape / Defeat：discard pending loot（任务卡 §16）。

- 掉落结算（guaranteed / random / lucky）随 Loot V2 数据层定义；战斗层只负责「胜利统一写入」的事务语义。
- 任务关键物不被 RNG 卡死（任务卡 §5.3；`02_SYSTEM_BOUNDARIES.md` §12）。

---

## 12. Battle UI 3v3

任务卡 §17 桌面推荐布局（原文）：

```text
┌────────────────────────────────────────────────────┐
│                      战斗                          │
├──────────────────────────────────┬─────────────────┤
│ 我方                             │ 敌方            │
│ [玩家] [伙伴] [伙伴]             │ [敌1][敌2][敌3] │
├──────────────────────────────────┼─────────────────┤
│          简洁战斗播报             │ 详细日志        │
├──────────────────────────────────┴─────────────────┤
│              固定底部行动栏                      │
└────────────────────────────────────────────────────┘
```

单位卡只显示（任务卡 §17）：

```text
名称
Lv
HP
MP（有才显示）
攻击
护甲
敏捷
```

- 当前行动单位明显高亮（任务卡 §17）。
- 死亡单位灰掉或标记 defeated，不要造成布局剧烈跳动（任务卡 §17）。
- 战斗页仍不常驻显示五维 raw grid（任务卡 §17）。
- 多敌显示使用显示名（如「骷髅战士① / 骷髅战士②」），生产 UI 不得显示内部实例 ID（任务卡 §8）。

---

## 13. Combat V3 数学冻结回顾（原样引用）

多人战斗**只扩展队列，不重写数学**（任务卡 §2.3）：

```text
普通命中：
(attacker AGI + D20) / 2 >= defender AGI

天然 1：
大失败

天然 20：
现有暴击语义

擦伤：
现有语义

护甲承伤：
现有公式

攻击伤害：
现有正式计算路径
```

- `[CANON]` 实现锚点：`resolveHit` / `applyArmor` / `resolveAttack`（`src/game/rules/combat.ts`）。
- 单位卡上的 attack / armor / agility 即上述公式的输入，展示与结算同源。

---

## 14. 边界与禁止（本设计适用）

- 不做 threat table / taunt / healer priority / spell planner / behavior tree（任务卡 §12）。
- 不做行动力 / Bonus Action / Reaction 全套 5e 化；仍是项目自己的轻量回合制（任务卡 §2.2；`02_SYSTEM_BOUNDARIES.md` §2）。
- 不做动态等级缩放（任务卡 §2.4）。
- 不做巨型 CombatEngine class hierarchy / AI planner（任务卡 §57）。

## 15. 关联文档

- Encounter V2：`combat/encounter_design.md`
- 系统硬边界：`02_SYSTEM_BOUNDARIES.md`
- 规则代码：`src/game/rules/combat.ts`、`escape.ts`、`combatXp.ts`、`encounter.ts`
- 内容注册表：`src/game/content/enemies.ts`、`companions.ts`、`locations.ts`
