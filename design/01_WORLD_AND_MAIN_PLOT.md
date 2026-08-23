# 01 — 世界与主线总纲（World & Main Plot）

> 依据任务卡 TM-P2-007 §25「世界与主线总纲」编制，配合 canon 层剧情资料整理（`canon/plot/MASTER_OUTLINE.md`、各 `act_*.md`、`canon/world/` 系列）与已上线代码（`src/game/content/`）整理。
>
> **权威优先级**：任务卡 §25 为最高权威；canon 草稿仅为整理素材。canon 与任务卡不一致时，以任务卡为准，并在对应小节注明差异。
>
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目对原著的改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。
>
> 本文档只固化剧情大纲与各 Act 的结构（核心 / 关键角色 / 关键地点 / 状态标签），不扩写具体剧本、对白或数值。

---

## 0. 总纲原则

1. 剧情为游戏服务：每个 Act 必须有可玩 Quest Chain、至少一个 Encounter、一个 Choice 与明确的 World Change（`[PLANNED]` 层通用设计准则，canon MASTER_OUTLINE 总纲）。
2. 美女 NPC 出场 / 加入**不得走同一模板**：每人的核心体验、Approval 偏好、Personal Quest、Romance Arc 必须不同（任务卡 §26 统一模板；00_GAME_DIRECTION 原则 2）。
3. 任务设计多解原则：Combat / Skill / Attribute / Luck / Companion / Item / Dialogue 至少 2 条合理路径，重要任务最好 3 条（任务卡 §23 原则 2；CONTENT_CHANGES #8）。
4. 原著要素须目标驱动回查后再回填；回查前不编造，无法核实标 `[UNKNOWN]`。
5. 本阶段**只允许**两个剧情 vertical slice：一个早期 Mount 获取 + 一个多解现有支线（任务卡 §1 六块基础 + §56 推荐开发顺序界定本阶段范围）；Act II–Finale 全部为 `[PLANNED]` 设计文档，本阶段不得实现（任务卡 §1 六块基础 + §56 推荐开发顺序界定本阶段范围）。

---

## 1. 序章：青石村

- **核心**（任务卡 §25 原文）：村外异动 / 矿洞 / 草原狼影 / 黄金兔子长期线开端 / 两条村内支线 / 前往天龙城。
- **Quest Chain（已实现 `[CANON]`）**：
  1. 《村外异动》→ 击败魔化兔 → 回村提交（+20 金，解锁兔王巢穴）。
  2. 《矿洞清理》→ 击败魔化鼠 → 提交（+15 金）。
  3. 《草原狼影》→ 击败魔化狼 → 提交（+25 金，Lv.2 里程碑）。
  4. 击败嘟嘟兔（Boss）→ 获得《兔子的路径》×1。
  5. 《追寻黄金兔子王》：长期线开端，**继续冻结**（详见下方冻结说明）。
  6. 两条村内支线：《采药受阻》（+10 金）、《矿洞余患》（+10 金）。
  7. 离开青石村 → 天龙城（不可逆，`departQingshiVillageToTianlongCity`）。
- **关键角色**：村长（`village_elder`）、铁匠（`blacksmith`）、药师（`apothecary`）、嘟嘟兔（`dudu_rabbit`，一次性 Boss，黄金兔子王的伴侣）——均为 `[CANON]`。
- **关键地点**：青石村（`qingshi_village`）、村外草原（`village_grassland`）、废弃矿洞（`abandoned_mine`）、兔王巢穴（`rabbit_lair`，需 `rabbit_lair_unlocked`）——均为 `[CANON]`。
- **状态标签**：整体 `[CANON]`（TM-P0-001 ~ P1-022）；黄金兔子线 = `[CANON]` 已上线 + `[PROJECT-AU]` 长期冻结。

### 1.1 Golden Rabbit 硬冻结说明

`[CANON]` 已上线 + `[PROJECT-AU]` 长期冻结。最终必须保持（任务卡 §39）：

```text
quest_golden_rabbit_search
status = in_progress
stage  = 0
```

- 四个既有调查 flags 保持 `true`：`asked_blacksmith` / `asked_apothecary` / `village_inquiry_reported` / `rabbit_lair_rechecked`。
- 背包保持 `rabbit_path ×1`。
- 禁止：新增目的地、消耗 `rabbit_path`、出现 Golden Rabbit King、North Gate 联动、Mount 联动、Pet 联动、Sakura 联动、新增 clue（任务卡 §39）。

---

## 2. Act 1：天龙立足

- **核心**（任务卡 §25 原文）：天龙城 / 武馆 / 马科 / 王财 / 黑石塔 / 北门失联 / 商业·装备·城市服务初步打开。
- **Quest Chain**：
  - `[CANON]`《商人王财的麻烦》：马科 → 王财 → 黑石塔一层 → 三层 → 骷髅女妖 → 夔峒项链 → 交还王财 → 向马科复命 → **第一阶段完成**。
  - `[CANON]`《北门失联》（Phase 2）：北门巡逻骑士失联 → 黑鬃魔狼 → 北门旧哨塔。
  - `[CANON]`《落樱越界》（Phase 2）：神域裂隙 → Sakura 首遇（Act 10 前置，AU-001）。
- **关键角色**：马科（`knight_captain_make`，骑士队长，三阶段对话）、王财（`merchant_wangcai`，夔峒项链失主）、樱花优子（首遇）——均为 `[CANON]`。
- **关键地点**：天龙城（`tianlong_city`）、武馆（`tianlong_martial_hall`）、黑石塔一层 / 二层 / 三层（`black_stone_tower_floor1/2/3`）、天龙城北门（`tianlong_north_gate`）、樱华神域·破碎边界（`sakura_domain_fragment`，特殊事件地点）——均为 `[CANON]`。
- **状态标签**：黑石塔 / 北门 / Sakura 段 `[CANON]`（TM-P1-023~031、TM-P2-001、TM-P2-004）；皇家骑士伏笔收束 `[PLANNED]`（Act 6）。
- **皇家骑士伏笔**：`[PLANNED]` 马科的骑士线（皇家骑士团、天凤 / 天玉公主相关）在 Act 6 收束；本 Act 只埋线索（canon MASTER_OUTLINE Act I）。

---

## 3. Act 2：坐骑与骑士成长

- **核心**（任务卡 §25 原文）：马厩 / 骑术 / 天马·高阶坐骑传闻 / 坐骑是属性与探索能力来源 / 为莉安雅线铺垫。
- **Quest Chain 草案**（`[PLANNED]`，canon act_02）：寻找走失天马 → 星马湖试炼 → 获得早期坐骑（青鬃马或普通火焰驹前置低阶版本，具体名称 `[UNKNOWN]` 待回查）→ 坐骑成长试炼。
- **关键角色**：`[UNKNOWN]` 驯马相关 NPC（待回查）；天马系生物（`[UNKNOWN]` 细节）。
- **关键地点**：星马湖（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`；本阶段只做「一个早期 Mount acquisition vertical slice」（任务卡 §1/§56；本阶段只做火焰驹获取，见任务卡 §19）。
- **坐骑定位（跨 Act 硬边界）**：坐骑不是 Combatant、不获得独立回合、不独立攻击；只提供基础属性加成 / 派生属性影响 / 探索 Tag / 旅行能力 / 特殊场景选项（AU-003；详见 `02_SYSTEM_BOUNDARIES.md`）。travel tags（`fast_travel` / `pursuit` / `flight` / `thunder_path`）用于解锁探索权限、特殊选项、追逐检定 bonus、旅行事件 bonus（任务卡 §18.4 travelTags、§21 坐骑与探索；**不做实时移动速度**）。
- **本阶段边界**：禁止在 Lv3 白送紫焰雷翼马（任务卡 §18.4「本阶段只允许火焰驹正式可获得」）。

---

## 4. Act 3：莉安雅 / 水雾遗迹

- **核心**（任务卡 §25 原文）：古代骑士战争 / 失忆 / 誓言 / 魔族旧敌 / 骑士身份意义。
- **Quest Chain 草案**（`[PLANNED]`，canon act_03）：水雾殿异变调查 → 与莉安雅相遇（**非**「遇难→救→+100→加入→恋爱」模板，任务卡 §26；00_GAME_DIRECTION 原则 2）→ 六头双翼蛇事件 → 龙马琴 / 飞龙烈焰枪 / 寒冰雪龙 / 纯阴水泉线索链（原著要素 `[CANON-原著]`，来源 112–115 / 167 / 187–207）→ 莉安雅 Personal Quest / 加入（`[UNKNOWN]` 细节，`[PLANNED]`）。
- **关键角色**：莉安雅——飞龙圣骑士（`[CANON-原著]` 称号，`[PLANNED]` 入队，后台为 `Companion`）。
- **关键地点**：水雾殿（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`；任务卡 §1/§56 本阶段范围 明示本阶段不实现水雾殿正式主线 / 莉安雅正式获取。

---

## 5. Act 4：百幻桃林 / 司马幽兰 / 狐媚儿

- **核心**（任务卡 §25 原文）：药材 / 桃花精魂 / 狐族危机 / 幻术 / 救援与利益冲突 / 聪明选择和正直选择不总一致。
- **Quest Chain 草案**（`[PLANNED]`，canon act_04）：桃林药患调查（司马幽兰线：药学 / 救人 / 植物 / 知识）→ 狐族谈判（狐媚儿线：狐族 / 幻术 / 谎言 / 谈判 / 九尾）→ 两线交叉的多解任务（Combat / Skill / Dialogue 至少 2–3 条路径）。
- **关键角色**：司马幽兰（`[PLANNED]`，Approval = 救治 / 不滥杀 / 尊重知识 / 保护伤者）；狐媚儿（`[PLANNED]`，Approval = 机敏 / 敢赌 / 漂亮的欺骗 / 反制敌人 / 保护狐族利益——不是简单善恶）。
- **关键地点**：百幻桃林（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`；任务卡 §1/§56 本阶段范围 明示本阶段不实现百幻桃林 / 狐媚儿 / 司马幽兰。
- **一致性要求**：两人初遇 / 加入模板必须互不相同，也与莉安雅、Sakura 不同（任务卡 §26；00_GAME_DIRECTION 原则 2）。

---

## 6. Act 5：秦皇古墓 / 神殿试炼

- **核心**（任务卡 §25 原文）：长期遗迹探索 / 高阶装备 / 骑士成长 / 神殿体系 / 大陆旧史。
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Act V）：古墓入口 → 层层破解 → 天梦神殿 → 圣殿之王关联真相。
- **关键角色**：`[UNKNOWN]`（原著 344 起秦皇古墓段待回查）。
- **关键地点**：秦皇古墓 / 天梦神殿（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`。
- **术语差异注**：任务卡 §25 标题为「神殿试炼」，canon MASTER_OUTLINE 标题为「天梦神殿」；两者均指向神殿体系，以任务卡为核心词、canon 作地点名补充。

---

## 7. Act 6：东海 / 皇室

- **核心**（任务卡 §25 原文）：海域 / 皇室政治 / 天凤公主 / 天玉公主 / 城邦·国家利益。
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Act VI）：皇室委托 → 东海航线 → 岛屿秘辛；皇家骑士伏笔（马科线）在此收束。
- **关键角色**：天凤公主、天玉公主（骨架，`[UNKNOWN]` 细节，`[PLANNED]`）。
- **关键地点**：东海 / 岛屿（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`。

---

## 8. Act 7：百兽与坐骑生态

- **核心**（任务卡 §25 原文）：紫月天 / 稀有坐骑 / 魔兽生态 / 驯兽知识转化为坐骑·野兽·生态玩法。
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Act VII）：百兽图谱 → 稀有坐骑线索 → 紫月天个人线。
- **关键角色**：紫月天（骨架，`[PLANNED]`）。
- **关键地点**：百兽地域（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`。
- **关联**：坐骑图鉴扩展（`design/mounts/` 关联）；坐骑仍为非战斗单位（AU-003）。

---

## 9. Act 8：精灵峡谷 / 彩芷若

- **核心**（任务卡 §25 原文）：精灵势力 / 五行 / 生命之源 / 女王责任 / 族群重建。
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Act VIII）：峡谷异变 → 精灵族内情 → 彩芷若个人线。
- **关键角色**：彩芷若（骨架，`[PLANNED]`）。
- **关键地点**：精灵峡谷（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`。

---

## 10. Act 9：猴儿林 / 大型赛事

- **核心**（任务卡 §25 原文）：高阶探索 / 竞争 / 荣誉 / 玩家战力展示 / 世界级势力关注。
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Act IX）：猴儿林前奏 → 大会资格 → 淘汰赛 / 决赛。
- **关键角色**：`[UNKNOWN]`（赛事相关 NPC 待回查）。
- **关键地点**：猴儿林（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`。
- **硬边界**：本项目是单机，**不实现 MMO 排行榜模拟器**（任务卡 §25）。

---

## 11. Act 10：樱花优子归乡

- **前置（已上线 `[CANON]` + `[PROJECT-AU]`）**：樱花优子前期已通过《落樱越界》（Lv8–14 首次相遇，Lv15 前保障建立可同行神契）成为可同行伙伴（AU-001）。封印技能（樱花天神舞 / 分身 / 隐身 / 完整封印术）当前为 `[CANON]` sealed 展示（`companions.ts` `SAKURA_SEALED_SKILLS`）。
- **核心**（任务卡 §25 原文）：本 Act 改为「归乡」而非「首次获得角色」——返回樱花神谷 / 神宫旧部 / 神器回收 / 九尾妖狐 / 八歧封印 / 神域政治 / 恢复完整神位 / 她自己决定继续同行的形式。
- **Quest Chain 草案**（`[PLANNED]`）：神域裂隙恶化 → 归乡 → 神格恢复仪式 → 神权重建 → 樱花神宫重建。
- **关键角色**：樱花优子（`[CANON]` 已入队伙伴）；九尾妖狐、八歧封印（`[PLANNED]`）。
- **关键地点**：樱花神谷（任务卡 §25 用词）；出身锚点为「大日岛樱花神宫」（`companions.ts` summary `[CANON]`）。
- **状态标签**：`[PROJECT-AU]`（归乡 / 恢复神位定位调整）+ `[PLANNED]`（本 Act 内容）+ `[CANON]`（Sakura 前期已入队）。
- **Choice（`[PLANNED]`）**：神权重建的方向（守护 vs 权威 等），由她最终决定继续同行的形式。
- **术语差异注**：任务卡 §25 写「返回樱花神谷」，canon / 代码写「归乡大日岛（大日岛樱花神宫出身）」；两者指同一神域背景，以任务卡用词为主、代码出身锚点为补充。

---

## 12. Act 11：天妖夫人 / 阴风殿

- **核心**（任务卡 §25 原文）：幸运 / 因果 / 妖族 / 封印 / 成熟高阶伙伴 / 对 LUCK build 的世界级解释。
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Act XI）：阴风殿入口 → 殿内阴谋 → 天妖夫人博弈。
- **关键角色**：天妖夫人（成熟高阶伙伴，骨架 `[PLANNED]`）。
- **关键地点**：阴风殿（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`。
- **设定要点**：天妖夫人线为 LUCK（幸运）属性 build 提供世界观层面的解释与收束。

---

## 13. Act 12：天梦仙山 / 终局准备

- **核心**（任务卡 §25 原文）：更高阶身份 / 神性势力 / 各族关系 / 天魔长线集中收束。
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Act XII）：仙山登顶 → 圣殿之王对决 → 世界真相揭示。
- **关键角色**：圣殿之王（canon 提及，`[UNKNOWN]` 细节，`[PLANNED]`）。
- **关键地点**：天梦仙山（`[PLANNED]`）。
- **状态标签**：`[PLANNED]`。

---

## 14. 终局

- 本阶段**不写唯一结局**，只保留伏笔（任务卡 §25 原文）：
  - 天魔（远古魔劫长线）
  - 世界秩序
  - 神性势力
  - 各族利益
  - 女性伙伴独立目标
- **Quest Chain 草案**（`[PLANNED]`，canon MASTER_OUTLINE Finale）：天魔苏醒 → 各势力集结（群体单位 / 波次 / 剧情表现，按 AU-004）→ 最终抉择。
- **硬边界**：本阶段**禁止加入**新女主 / 新大陆 / 新终极职业 / 新世界结局 / 新宠物体系（任务卡 §24）。

---

## 15. 已实现内容 AU 插入位置汇总

| 已实现内容 | 状态 | 插入位置 |
|---|---|---|
| 青石村全套（序章） | `[CANON]` | 序章 |
| Golden Rabbit 黄金兔子线 | `[CANON]` 已上线 + `[PROJECT-AU]` 长期冻结 | 序章尾 → 长期线（禁止任何系统连接，任务卡 §39） |
| North Gate 北门失联 | `[CANON]` | Act 1（Phase 2） |
| Sakura early encounter（落樱越界） | `[CANON]` + `[PROJECT-AU]` | Act 1 后段 / Act 10 前置 |

---

## 16. 阶段交付边界（任务卡 §1 总目标 + §56 开发顺序）

- 本阶段只允许两个剧情 vertical slice：一个早期 Mount 获取 + 一个多解现有支线。
- Act 2–Finale 内容全部为 `[PLANNED]` 设计文档，**本阶段不得实现**。
- 水雾殿 / 莉安雅 / 百幻桃林 / 狐媚儿 / 司马幽兰 / 精灵峡谷 / 天妖夫人 / 大日岛正式地图 / 武斗大会 / 天梦终局均列为未来 Canon 准备。

## 17. 关联文档

- 系统硬边界：`02_SYSTEM_BOUNDARIES.md`
- 世界观细节：`canon/world/world_overview.md`、`geography.md`、`history.md`、`factions.md`、`professions.md`
- 剧情细化：`canon/plot/MASTER_OUTLINE.md`、各 `act_*.md`
- 裁定与冲突：`canon/00_DECISIONS.md`、`canon/CANON_CONFLICTS.md`
