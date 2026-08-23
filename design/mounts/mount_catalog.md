# 坐骑目录——首批四匹（Mount Catalog V1）

> 依据任务卡 TM-P2-007 §18.4 首批坐骑数据编制。属性加成与 travelTags 数值严格照 §18.4 填写，不得修改。
> 剧情背景参考：`canon/plot/act_02_mounts.md`（坐骑主舞台 Act II `[PLANNED]`）。
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。

## 0. 目录说明

- 本阶段只允许**火焰驹**正式可获得（任务卡 §18.4）。
- 赤兔驹 / 天云狂风马 / 紫焰雷翼马仅做 registry + UI hint，**本阶段不提前白送** `[PLANNED]`。
- 坐骑数据为独立 registry（MountDefinition），非背包物品，独立于 `ItemSlot` 三槽与 Inventory（见 `mount_system.md` §2）。
- 稀有度为**建议值**（任务卡只定义了 `rarity?: ItemRarity` 字段与五档，未逐匹规定）`[UNKNOWN]` 具体数值由内容核定。
- 完整坐骑生态（星马湖、驯化、成长）见 `canon/plot/act_02_mounts.md` `[PLANNED]`。

## 1. 火焰驹

- **id**：`flame_steed`
- **名称**：火焰驹
- **描述**：鬃尾如烈火翻涌的骏马，奔跑时蹄下带起火星。`[UNKNOWN]` 具体文案待内容回填。
- **属性加成**（§18.4 原文）：

```text
STR +1
AGI +1
travelTags:
- fast_travel
```

- **travelTags**：`fast_travel`
- **获取方式**：天龙城马厩购买，**80 金**（当前地点天龙城 / 金币 >= 80 / 未拥有；购买后加入 `ownedMountIds`，不自动装备）`[PLANNED]`（§19）。
- **稀有度建议**：`uncommon`（80 金入门坐骑，低于赤兔驹等稀有坐骑）
- **状态标签**：`[PLANNED]` —— 本阶段唯一正式可获得坐骑（对应 task 卡 §18.4"本阶段只允许火焰驹正式可获得"）。

## 2. 赤兔驹

- **id**：`red_haired_steed`
- **名称**：赤兔驹
- **描述**：毛色赤红如血的名驹，以迅捷著称。`[UNKNOWN]` 具体文案待内容回填。
- **属性加成**（§18.4 原文）：

```text
AGI +2
travelTags:
- fast_travel
- pursuit
```

- **travelTags**：`fast_travel`、`pursuit`
- **获取方式**：仅 registry + UI hint，本阶段不发放 `[PLANNED]`。
- **稀有度建议**：`rare`
- **状态标签**：`[PLANNED]` 不发放（目录条目化，本阶段不做获取闭环）。

## 3. 天云狂风马

- **id**：`skywind_mount`
- **名称**：天云狂风马
- **描述**：踏云而行的风系天马，来去如风。`[UNKNOWN]` 具体文案待内容回填。
- **属性加成**（§18.4 原文）：

```text
AGI +2
MND +1
travelTags:
- fast_travel
- flight
```

- **travelTags**：`fast_travel`、`flight`
- **获取方式**：仅 registry + UI hint，本阶段不发放 `[PLANNED]`。
- **稀有度建议**：`rare`
- **状态标签**：`[PLANNED]` 不发放（目录条目化，本阶段不做获取闭环）。

## 4. 紫焰雷翼马

- **id**：`thunder_wing_mount`
- **名称**：紫焰雷翼马
- **描述**：翼披紫焰、随行带电的传说天马。`[UNKNOWN]` 具体文案待内容回填。
- **属性加成**（§18.4 原文）：

```text
STR +1
AGI +2
LCK +1
travelTags:
- fast_travel
- flight
- thunder_path
```

- **travelTags**：`fast_travel`、`flight`、`thunder_path`
- **获取方式**：仅 registry + UI hint，本阶段不发放 `[PLANNED]`。禁止在 Lv3 白送（act_02_mounts.md 引任务卡 §18.4）。
- **稀有度建议**：`epic`（属性最全、tag 最多，建议最高档）
- **状态标签**：`[PLANNED]` 不发放（目录条目化，本阶段不做获取闭环）。

## 5. 汇总表

| id | 名称 | STR | CON | AGI | MND | LCK | travelTags | 本阶段获取 | 稀有度建议 | 状态 |
|---|---|---|---|---|---|---|---|---|---|---|
| `flame_steed` | 火焰驹 | +1 | — | +1 | — | — | fast_travel | 天龙城马厩 80 金 | uncommon | `[PLANNED]`（唯一可获得） |
| `red_haired_steed` | 赤兔驹 | — | — | +2 | — | — | fast_travel, pursuit | 不发放 | rare | `[PLANNED]` |
| `skywind_mount` | 天云狂风马 | — | — | +2 | +1 | — | fast_travel, flight | 不发放 | rare | `[PLANNED]` |
| `thunder_wing_mount` | 紫焰雷翼马 | +1 | — | +2 | — | +1 | fast_travel, flight, thunder_path | 不发放（禁止 Lv3 白送） | epic | `[PLANNED]` |

## 6. 禁止项

- 不把赤兔驹 / 天云狂风马 / 紫焰雷翼马在本阶段白送（任务卡 §18.4；act_02_mounts.md）。
- 不连接 Golden Rabbit（`mount_system.md` §4；00_GAME_DIRECTION 内容裁定）。
- 不实现坐骑独立战力 / Mount skill tree（`mount_system.md` §9）。
