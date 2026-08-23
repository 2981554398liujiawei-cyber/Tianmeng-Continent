# 势力（Factions）

> 已实现势力标 `[CANON]`（来源：README + `src/game/content/npcs.ts` / `locations.ts`），规划势力标 `[PLANNED]`，原著细节未核实标 `[UNKNOWN]`。

## 一、已实现势力（[CANON]）

### 1.1 天龙王朝

- `[CANON]` 皇城天龙城（`tianlong_city`），天龙王朝统治核心。
- `[CANON]` 武馆（`tianlong_martial_hall`）：城中武者与守卫操练之所；骑士队长**马科**（`knight_captain_make`）驻此，负责武馆事务，警惕城内外异常，是天龙城主线的发布者。
- `[CANON]` 骑士编制：城内有巡逻骑士（《北门失联》背景），北门有巡逻骑士马蹄印。
- `[PLANNED]` 皇室成员（天凤公主 / 天玉公主）`[UNKNOWN]` 具体设定：见 `characters/` 骨架；东海/皇室线为 Act VI。
- `[PLANNED]` 皇家骑士系统 / 转职：未实现；马科非职业导师（`[CANON]` 各职业均可与其交流）。

### 1.2 青石村

- `[CANON]` 群山环抱的小村，自给自足：村长（`village_elder`，年迈沉稳）、铁匠（`blacksmith`，打铁三十年）、药师（`apothecary`，熟悉采药炼药）。
- `[CANON]` 村长是最初委托链的发布者（村外异动 → 草原狼影 → 追寻黄金兔子王），并有关系值（信任/尊敬）反馈。
- `[CANON]` 村民生计与魔化野兽的冲突是序章舞台。

### 1.3 大日岛樱花神宫（已接触，非完整地图）

- `[CANON]` Sakura（樱花优子）出身「大日岛樱花神宫」，称号「樱花女神」。
- `[CANON]` 神格受损、以寄灵神契锚定于天梦大陆生命之上才得以存在（`companions.ts` summary）。
- `[CANON]` 神域崩落：`sakura_domain_fragment`（樱华神域·破碎边界）是神域坍缩的一角。
- `[PLANNED]` 大日岛本岛、神宫完整设定、樱花神神系：Act X（Sakura 归乡 / 神格恢复 / 神权重建）规划。

## 二、规划势力（[PLANNED]，按 Act）

| 势力 | 关联角色 | 关联 Act | 原著锚点 |
|---|---|---|---|
| 水雾殿 | 莉安雅 | Act III | `[UNKNOWN]` 详情；莉安雅为飞龙圣骑士 / 水雾殿成员（任务卡 §10，原著 112–115/167/187–207） |
| 百幻桃林 | 司马幽兰 / 狐媚儿 | Act IV | `[UNKNOWN]`；狐族九尾设定 `[UNKNOWN]` |
| 秦皇古墓相关 | — | Act V | `[UNKNOWN]`；344 起秦皇古墓待回查 |
| 东海诸岛 / 皇室 | 天凤公主 / 天玉公主 | Act VI | `[UNKNOWN]` |
| 百兽 | 紫月天 | Act VII | `[UNKNOWN]`；坐骑生态 |
| 精灵峡谷 | 彩芷若 | Act VIII | `[UNKNOWN]`；精灵血脉 |
| 大日岛樱花神宫（完整） | 樱花优子 | Act X | 见 AU-001：调整为归乡/神格恢复篇 |
| 阴风殿 | 天妖夫人 | Act XI | `[UNKNOWN]` |
| 天梦仙山 | 圣殿之王 | Act XII | `[UNKNOWN]` |

## 三、势力关系备忘（[CANON]）

- `[CANON]` 天龙王朝与青石村：从属但不深入，村务自治；主角以冒险者身份受村中委托后进入皇城。
- `[CANON]` 天龙城与黑石塔：塔在城郊路线上（`black_stone_tower_floor1` 与 `tianlong_city` 直接连接），被亡灵占据，是城市安全威胁。
- `[CANON]` Sakura 与天龙城：神域裂隙出现在天龙城附近（《落樱越界》），Sakura 短暂锚定于此界；不隶属于天龙王朝。
- `[PLANNED]` 各方势力在天魔长线（Finale）中的立场与联盟：未设计，保留开放。

## 四、势力中立/敌意态度（[CANON] 现状）

- `[CANON]` 亡灵势力（黑石塔）当前为无组织的活动亡灵（骷髅/僵尸/黑法师），无首领性世界观实体；黑石塔更深区域 `[UNKNOWN]`（未建四层，任务卡明示不建）。
- `[CANON]` 魔化兽群（青石村一带）无组织化势力，嘟嘟兔为黄金兔子王的伴侣（`enemies.ts` description），黄金兔子王本体 `[PLANNED]`（任务卡第 108 节冻结不实现）。
- `[PLANNED]` 阴风殿、秦皇古墓等作为明确反派势力架构，随 Act 展开设计。
