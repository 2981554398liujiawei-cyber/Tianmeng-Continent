# MASTER_OUTLINE — 剧情总纲

> 依据任务卡 TM-P2-007 第 11–12 节：**重新编制真正适合游戏的剧情总纲**，不是小说逐章摘要。
> 结构：`Act → Story Arc → Quest Chain → Encounter → Character Event → Choice → Reward / World Change`。
> 标签：`[CANON]`=已实现；`[PROJECT-AU]`=项目改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。
> 已实现内容（Golden Rabbit 黄金兔子线 / North Gate 北门失联 / Sakura early encounter）作为项目 AU 插入合理位置并标注。

## 0. 总纲原则

1. 剧情是为游戏服务的：每个 Act 必须有可玩 Quest Chain、至少一个 Encounter、一个 Choice 与明确 World Change。
2. 美女 NPC 出场/加入**不得走同一模板**（任务卡 §15–16）：每人的核心体验、Approval 偏好、Personal Quest、Romance Arc 必须不同（详见 `characters/` 各档案）。
3. 原著要素按目标驱动回查（`source/novel_chapter_index.md`）后回填；回查前不编造。
4. 任务设计多解原则（任务卡 §97）：Combat / Skill / Attribute / Luck / Companion / Item / Dialogue 至少 2 条合理路径，重要任务最好 3 条。

## 1. 总览表

| 阶段 | 名称 | Story Arc（一句话） | 关键角色 | 关键地点 | 状态 |
|---|---|---|---|---|---|
| 序章 | 青石村 → 天龙城 | 从新手村异动到踏入皇城的第一步 | 村长/铁匠/药师/嘟嘟兔 | 青石村/草原/矿洞/兔王巢穴 | `[CANON]` |
| Act I | 天龙立足 / 皇家骑士伏笔 | 在天龙城立足并埋下皇家骑士线 | 马科/王财 | 天龙城/武馆/黑石塔 | `[CANON]`（黑石塔段）+ `[PLANNED]`（骑士伏笔收束） |
| Act II | 天马 / 星马湖 / 坐骑成长 | 获得并培养第一匹坐骑 | `[UNKNOWN]` 驯马相关 NPC | 星马湖 | `[PLANNED]` |
| Act III | 水雾殿 / 莉安雅 | 旧战争记忆与骑士责任的考验 | 莉安雅 | 水雾殿 | `[PLANNED]` |
| Act IV | 百幻桃林 / 司马幽兰 / 狐媚儿 | 药与幻，两段截然不同的桃林际遇 | 司马幽兰/狐媚儿 | 百幻桃林 | `[PLANNED]` |
| Act V | 秦皇古墓 / 天梦神殿 | 古墓深处的王权与神权秘密 | `[UNKNOWN]` | 秦皇古墓/天梦神殿 | `[PLANNED]` |
| Act VI | 东海 / 皇室 / 岛屿 | 王室血脉与东海诸岛的暗流 | 天凤公主/天玉公主 | 东海/岛屿 | `[PLANNED]` |
| Act VII | 百兽 / 紫月天 / 坐骑生态 | 驯兽与坐骑生态的广阔世界 | 紫月天 | 百兽地域 | `[PLANNED]` |
| Act VIII | 精灵峡谷 / 彩芷若 | 精灵血脉的传承与选择 | 彩芷若 | 精灵峡谷 | `[PLANNED]` |
| Act IX | 猴儿林 / 武斗大会 | 以武会友的台前幕后 | `[UNKNOWN]` | 猴儿林 | `[PLANNED]` |
| Act X | 樱花优子归乡 / 大日岛 | 神格恢复与神权重建（AU-001） | 樱花优子 | 大日岛/樱花神宫 | `[PLANNED]`（Sakura 前期相遇 `[CANON]`） |
| Act XI | 阴风殿 / 天妖夫人 | 阴风殿的权谋与诱惑 | 天妖夫人 | 阴风殿 | `[PLANNED]` |
| Act XII | 天梦仙山 / 圣殿之王 | 直面圣殿之王，揭开世界真相 | `[UNKNOWN]` | 天梦仙山 | `[PLANNED]` |
| Finale | 天魔长线 | 上古魔劫的终局抉择 | `[UNKNOWN]` | — | `[PLANNED]` |

## 2. 序章：青石村 → 天龙城（[CANON] 已实现）

- **Story Arc**：村外野兽异动，冒险者查明并清除隐患，追寻藏宝图线索，随后离开小村踏入天龙王朝皇城。
- **Quest Chain（已实现 `[CANON]`）**：
  1. 《村外异动》→ 击败魔化兔 → 回村提交（+20 金，解锁兔王巢穴）。
  2. 《矿洞清理》→ 击败魔化鼠 → 提交（+15 金）。
  3. 《草原狼影》→ 击败魔化狼 → 提交（+25 金，Lv.2 里程碑）。
  4. 击败嘟嘟兔（Boss）→ 获得《兔子的路径》。
  5. 《追寻黄金兔子王》：展开地图 → 铁匠/药师打听 → 村内调查复命 → 巢穴复查 → **冻结**（`[PROJECT-AU]` 长期线）。
  6. 支线《采药受阻》《矿洞余患》。
  7. 离开青石村 → 天龙城（不可逆）。
- **Encounter**：魔化兔 / 魔化鼠 / 魔化狼 / 嘟嘟兔（Boss）。
- **Character Event**：村长信任/尊敬关系反馈（`[CANON]`）；嘟嘟兔一次性清场（`[CANON]`）。
- **Choice**：村长回应二选一（reassure / resolve）→ 信任或尊敬 +1（`[CANON]`）。
- **Reward / World Change**：金币成长、Lv.2、兔王巢穴解锁、离村跨区域（`[CANON]`）。

## 3. Act I：天龙立足 / 皇家骑士伏笔

- **Story Arc**：在天龙城武馆立足，受托调查黑石塔，为皇家骑士线埋下伏笔。
- **Quest Chain（已实现 `[CANON]`）**：
  1. 《商人王财的麻烦》：马科 → 王财 → 黑石塔一层 → 三层 → 骷髅女妖 → 夔峒项链 → 交还王财 → 向马科复命 → **第一阶段完成**。
  2. 《北门失联》（Phase 2 已实现 `[CANON]`）：北门巡逻骑士失联 → 黑鬃魔狼 → 旧哨塔（`[CANON]` 北门旧哨塔场景）。
  3. 《落樱越界》（Phase 2 已实现 `[CANON]`）：神域裂隙 → Sakura 首遇（见 Act X 前置）。
- **Encounter**：骷髅士兵→骷髅队长 / 僵尸→黑法师→骷髅战士 / 骷髅女妖 / 黑鬃魔狼 / 残灾之影（`[CANON]`）。
- **Character Event**：马科三阶段对话（in_progress/completable/completed，`[CANON]`）；王财交还项链后态度变化（`[CANON]`）。
- **Choice**：`[PLANNED]` 北门线的后续分支；`[CANON]` Sakura 契约过程中的选择（见 Sakura 档案 15 加入方式）。
- **Reward / World Change**：黑石塔三层地图、北门区域、Sakura 神域碎片区域（`[CANON]`）。
- **皇家骑士伏笔**：`[PLANNED]` 马科的骑士线（皇家骑士团、天凤/天玉公主相关）在 Act VI 收束；本 Act 只埋线索。

## 4. Act II：天马 / 星马湖 / 坐骑成长（[PLANNED]）

- **Story Arc**：获得第一匹坐骑，掌握坐骑系统，在星马湖一带建立坐骑生态认知。
- **Quest Chain 草案**：寻找走失天马 → 星马湖试炼 → 获得早期坐骑（青鬃马或低阶火焰驹前置，任务卡 §46 建议）→ 坐骑成长试炼。
- **Encounter**：`[UNKNOWN]` 野怪/Boss（待回查）。
- **Character Event**：`[UNKNOWN]` 驯马 NPC 初遇。
- **Choice**：坐骑去留/驯化方式选择。
- **Reward / World Change**：MountState 首次拥有坐骑（`mounts/mount_design.md`）；开放旅行 Tag 场景选项。
- **注意**：本阶段只做「一个早期 Mount acquisition vertical slice」（任务卡 §122），Act II 全量内容后续实现。

## 5. Act III：水雾殿 / 莉安雅（[PLANNED]）

- **Story Arc**：旧战争记忆与骑士责任——与飞龙圣骑士莉安雅并肩，直面旧日阴影。
- **Quest Chain 草案**：水雾殿异变 → 与莉安雅相遇（非「遇难→救」模板，见档案）→ 六头双翼蛇事件 → 寒冰雪龙/龙马琴/飞龙烈焰枪线索 → 纯阴水泉抉择。
- **Encounter**：`[UNKNOWN]` 六头双翼蛇等（原著要素：六头双翼蛇 `[CANON-原著]`，来源 112–115/167/187–207）。
- **Character Event**：莉安雅初遇/加入（`[UNKNOWN]` 加入细节 `[PLANNED]`）。
- **Choice**：责任与承诺的两难选择。
- **Reward / World Change**：莉安雅入队（Companion）、水雾殿地图。

## 6. Act IV：百幻桃林 / 司马幽兰 / 狐媚儿（[PLANNED]）

- **Story Arc**：桃林中两段截然不同的际遇——药的温柔与幻的危险。
- **Quest Chain 草案**：桃林药患（司马幽兰）→ 狐族谈判（狐媚儿）→ 两条线交叉。
- **Encounter**：`[UNKNOWN]`。
- **Character Event**：司马幽兰（药学/救人/植物/知识）、狐媚儿（狐族/幻术/谎言/谈判/九尾）各自独立初遇与加入。
- **Choice**：医术 vs 幻术、仁慈 vs 利益的多解任务。
- **Reward / World Change**：司马幽兰、狐媚儿入队（Companion）。

## 7. Act V：秦皇古墓 / 天梦神殿（[PLANNED]）

- **Story Arc**：深入秦皇古墓，揭开天梦神殿的王权与神权秘密。
- **Quest Chain 草案**：古墓入口 → 层层破解 → 天梦神殿 → 圣殿之王关联真相。
- **Encounter**：`[UNKNOWN]`（原著 344 起秦皇古墓段待回查）。
- **Reward / World Change**：古墓区域开放，世界真相关键情报。

## 8. Act VI：东海 / 皇室 / 岛屿（[PLANNED]）

- **Story Arc**：王室血脉与东海诸岛暗流，天凤/天玉公主登场，皇家骑士伏笔收束。
- **Quest Chain 草案**：皇室委托 → 东海航线 → 岛屿秘辛。
- **Character Event**：天凤公主 / 天玉公主（骨架，`[UNKNOWN]` 细节）。
- **Reward / World Change**：东海区域、皇室关系线。

## 9. Act VII：百兽 / 紫月天 / 坐骑生态（[PLANNED]）

- **Story Arc**：驯兽师紫月天带出百兽与坐骑生态的广阔世界。
- **Quest Chain 草案**：百兽图谱 → 稀有坐骑线索 → 紫月天个人线。
- **Character Event**：紫月天（骨架）。
- **Reward / World Change**：坐骑图鉴扩展（`mounts/mount_catalog.md` 关联）。

## 10. Act VIII：精灵峡谷 / 彩芷若（[PLANNED]）

- **Story Arc**：精灵血脉的传承与选择，彩芷若的主场。
- **Quest Chain 草案**：峡谷异变 → 精灵族内情 → 彩芷若个人线。
- **Character Event**：彩芷若（档案中其余标 `[PLANNED]`/`[UNKNOWN]`）。

## 11. Act IX：猴儿林 / 武斗大会（[PLANNED]）

- **Story Arc**：以武会友的台前幕后，武斗大会考验实力与人心。
- **Quest Chain 草案**：猴儿林前奏 → 大会资格 → 淘汰赛/决赛。
- **Reward / World Change**：竞技声望、装备、隐藏事件。

## 12. Act X：樱花优子归乡 / 大日岛（[PROJECT-AU] + [PLANNED]）

- **Story Arc**：AU-001——樱花优子归乡，神格恢复与神权重建篇（不是第二次「获取樱花女神」）。
- **前置（已实现 `[CANON]`）**：《落樱越界》在 Lv8–14 首次相遇，Lv15 前保障建立可同行神契（AU-001）。
- **Quest Chain 草案**：神域裂隙恶化 → 归乡大日岛 → 神格恢复仪式 → 神权重建 → 樱花神宫重建。
- **Character Event**：Sakura 的个人线巅峰；红颜录 stage 推进（`[CANON]` 红颜录已实现）。
- **Choice**：`[PLANNED]` 神权重建的方向（守护 vs 权威等）。
- **Reward / World Change**：大日岛地图、Sakura 神格恢复（封印技能解封：樱花天神舞/分身/隐身/完整封印术，见 `companions.ts` 封印技能 `[CANON]`）。

## 13. Act XI：阴风殿 / 天妖夫人（[PLANNED]）

- **Story Arc**：阴风殿的权谋与诱惑，天妖夫人危险而迷人的棋局。
- **Quest Chain 草案**：阴风殿入口 → 殿内阴谋 → 天妖夫人博弈。
- **Character Event**：天妖夫人（档案中其余标 `[PLANNED]`/`[UNKNOWN]`）。

## 14. Act XII：天梦仙山 / 圣殿之王（[PLANNED]）

- **Story Arc**：直面圣殿之王，揭开天梦大陆世界真相。
- **Quest Chain 草案**：仙山登顶 → 圣殿之王对决 → 世界真相揭示。
- **Reward / World Change**：终局前最后一区、真相解锁。

## 15. Finale：天魔长线（[PLANNED]）

- **Story Arc**：上古魔劫的终局抉择，汇聚全剧伏笔。
- **Quest Chain 草案**：天魔苏醒 → 各势力集结（群体单位/波次/剧情表现，按 AU-004）→ 最终抉择。
- **Choice**：终局核心道德选择。
- **Reward / World Change**：世界结局分支（对应各角色 Endings，见角色档案字段 24）。

## 16. 已实现内容 AU 插入位置汇总

| 已实现内容 | 状态 | 插入位置 |
|---|---|---|
| 青石村全套（序章） | `[CANON]` | 序章 |
| Golden Rabbit 黄金兔子线 | `[CANON]` 已上线 + `[PROJECT-AU]` 长期冻结 | 序章尾 → 长期线（禁止新目的地，任务卡 §108） |
| North Gate 北门失联 | `[CANON]` | Act I（Phase 2） |
| Sakura early encounter（落樱越界） | `[CANON]` + `[PROJECT-AU]` | Act I 后段 / Act X 前置 |

## 17. 阶段交付边界（任务卡 §121–122）

- 本阶段**只允许**两个剧情 vertical slice：一个早期 Mount 获取 + 一个多解现有支线。
- Act II–Finale 内容全部为 `[PLANNED]` 设计文档，**不得本阶段实现**。
- 水雾殿/莉安雅/百幻桃林/狐媚儿/司马幽兰/精灵峡谷/天妖夫人/大日岛地图/武斗大会/天梦终局均列为未来 Canon 准备。
