# 坐骑系统 V1（Mount V1）

> 依据任务卡 TM-P2-007 §18 Mount V1、§19 坐骑获取闭环、§20 坐骑与战斗、§21 坐骑与探索编制。
> 相关裁定：AU-003（坐骑非战斗单位）`[RULED]`；冲突记录 C-004（坐骑定位）。
> 剧情背景参考：`canon/plot/act_02_mounts.md`（坐骑主舞台 Act II `[PLANNED]`）。
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。

## 1. 坐骑定位（任务卡 §18.1）

坐骑：

- 不是 companion
- 不是 enemy
- 不拥有 HP
- 不拥有 turn
- 不被敌人选为目标

它是**角色属性增益 + 探索能力 + 长期收集身份**。

- 与 AU-003 一致：任何旧资料中"坐骑参战"条目在本项目一律改写为属性 / 选项语义 `[RULED]`。
- 不实现普通 PetSystem（AU-002）`[RULED]`：坐骑不是宠物，是独立收集身份。

## 2. 数据结构（任务卡 §18.2 原文）

```ts
interface AttributeBonuses {
  str?: number;
  con?: number;
  agi?: number;
  mnd?: number;
  lck?: number;
}

interface MountDefinition {
  id: string;
  name: string;
  description: string;

  attributeBonuses: AttributeBonuses;

  travelTags?: string[];
  rarity?: ItemRarity;

  acquisitionHint?: string;
}
```

- `rarity` 复用 ItemRarity 五档（common / uncommon / rare / epic / legendary，`src/game/content/items.ts`）。
- `acquisitionHint`：获取方式提示文案（如马厩、80 金）。
- 坐骑数据注册为独立 registry（`MountDefinition` 表），**与物品目录 `ITEMS` 分开**——坐骑不是背包物品，独立于 `ItemSlot` 三槽（weapon / armor / accessory）与背包 Inventory `[PROJECT-AU]`（任务卡未将坐骑定义为背包物品）。

## 3. 有效属性——唯一 helper（任务卡 §18.3）

建立唯一 helper：

```ts
getEffectiveCharacterAttributes(
  character,
  equippedMount
)
```

- 所有派生规则从 authoritative effective attributes 获取。
- **禁止 CombatPage 自己加一遍**（任务卡 §18.3 明确禁止）。
- 派生语义：基础角色属性 + 已装备坐骑的 `attributeBonuses` 得到 effective 属性；命中 / 护甲 / 暴击 / 伤害等 Combat derived stats 一律基于 effective 值。
- Combat V3 数学公式冻结不动（`src/game/content/enemies.ts` 头注、00_GAME_DIRECTION 内容裁定）；坐骑只作为 effective 属性的输入，不引入新的战斗公式。

## 4. hasTravelTag（任务卡 §21）

建立：

```ts
hasTravelTag(state, tag)
```

- 查询当前坐骑（含全局状态）是否具备某 travel tag，用于探索场景检定。
- 本阶段至少做一个**不影响主线**的 optional 场景检定。
- **不要连接 Golden Rabbit**（00_GAME_DIRECTION 内容裁定速查：Golden Rabbit 硬冻结，禁止任何系统连接）。

## 5. 获取闭环（任务卡 §19）

在天龙城增加轻量事务入口，**不增加新地图**：

```text
马厩
```

打开 MountStablePanel。

火焰驹价格：

```text
80 金
```

购买条件（全部满足）：

- 当前地点：天龙城
- 金币 >= 80
- 未拥有

购买后加入 `ownedMountIds`，**不自动装备**。

- 本阶段只允许火焰驹正式可获得（任务卡 §18.4）。
- 其余三匹只做 registry + UI hint，不提前白送（任务卡 §18.4；act_02_mounts.md：禁止把紫焰雷翼马在 Lv3 白送，任务卡 §18.4）`[PLANNED]`。

角色左栏增加：

```text
坐骑：未装备
[管理]
```

装备后：

```text
坐骑：火焰驹
力量 +1 · 敏捷 +1
[管理]
```

- `[管理]` 打开 MountPanel，承载装备 / 更换 / 卸下。
- 左栏属性展示文案 = 装备中坐骑的 `attributeBonuses`（力量 / 敏捷 / 体魄 / 精神 / 幸运 对应 STR / AGI / CON / MND / LCK）。

## 6. 装备 / 更换 / 卸下

- 坐骑有独立的 `equippedMount` 状态（当前装备坐骑 id；未装备为 null），与 `Equipment` 三槽（weapon / armor / accessory，`src/game/types/item.ts`）分离 `[PROJECT-AU]`。
- `ownedMountIds`：已拥有集合；`equippedMount`：当前装备。
- 装备：从已拥有中选一匹设为 `equippedMount`。
- 更换：直接切换 `equippedMount`。
- 卸下：`equippedMount` 置 null，回到"未装备"。
- 购买不自动装备；获得即入 `ownedMountIds`，装备与否由玩家决定。
- 属性结算：effective 属性 = 基础 + `equippedMount.attributeBonuses`（经 `getEffectiveCharacterAttributes` 唯一 helper）。

## 7. 坐骑与战斗（任务卡 §20）

装备火焰驹后角色 effective STR / AGI 改变：

- Combat derived stats 使用 effective values（经 §3 唯一 helper）。
- **战斗 UI 不出现坐骑 turn / HP**——坐骑不是 Combatant，不被选为目标。

## 8. 坐骑与探索（任务卡 §21）

- 建立 `hasTravelTag(state, tag)`（§4）。
- 本阶段至少一个不影响主线的 optional 场景检定：持有含某 travel tag 的坐骑时解锁该检定选项（或检定更有利），失败不影响主线推进。
- 探索语义为选项 / 检定，不做实时移动速度（00_GAME_DIRECTION §1 明确不做实时地图移动速度）。

## 9. 本阶段不做

- **不实现 Mount skill tree**（任务卡 §18 范围内未定义技能树）。
- 不实现坐骑独立战力 / 骑战（AU-003）。
- 其余三匹坐骑（赤兔驹 / 天云狂风马 / 紫焰雷翼马）仅 registry + UI hint，不发放（见 `mount_catalog.md`）`[PLANNED]`。
- 不连接 Golden Rabbit（§4）。

## 10. 状态汇总

| 项 | 状态 |
|---|---|
| 坐骑定位（非 Combatant） | `[RULED]` AU-003 / C-004 |
| MountDefinition / AttributeBonuses | `[PLANNED]` §18.2 |
| getEffectiveCharacterAttributes 唯一 helper | `[PLANNED]` §18.3，禁止 CombatPage 自行叠加 |
| hasTravelTag | `[PLANNED]` §21 |
| 马厩 / 80 金 / 购买条件 | `[PLANNED]` §19，不新增地图 |
| ownedMountIds / 不自动装备 | `[PLANNED]` §19 |
| 坐骑属性入 effective（战斗派生数值） | `[PLANNED]` §20，战斗 UI 无坐骑 turn/HP |
| optional travel-tag 探索检定 | `[PLANNED]` §21，不连 Golden Rabbit |
| Mount skill tree | 本阶段明确不实现 |
| 首批四匹数据 | `[PLANNED]` §18.4，详见 `mount_catalog.md` |
