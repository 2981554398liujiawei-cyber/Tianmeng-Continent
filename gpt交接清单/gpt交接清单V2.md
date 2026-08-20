《天梦大陆》开发交接清单

一、项目定位

项目：《天梦大陆 / Tianmeng Continent》



GitHub：

https://github.com/2981554398liujiawei-cyber/Tianmeng-Continent

开发方式：

用户提出玩法/体验反馈
→ ChatGPT 设计规则并下发单张任务卡
→ DeepSeek / DSH / Codex 实现
→ 用户提交 GitHub
→ ChatGPT 必须亲自审计源码
→ 通过后 SEALED
→ 再下发下一张任务卡

ChatGPT 的职责是：



游戏架构设计

玩法设计

任务卡制定

GitHub 源码审计

回归/边界检查

控制过度设计



不能只相信开发者汇报，必须实际检查 GitHub HEAD、parent、baseline→HEAD diff、代码和测试。

二、项目定位与技术栈

单机浏览器 D20 奇幻 CRPG / 文字驱动 RPG。



主要玩法：



文字剧情

NPC 对话

分支选择

节点探索

D20 判定

回合制战斗

任务

装备/背包

NPC 关系

世界状态

本地存档



技术：

React
TypeScript
Vite
Tailwind
Zustand
Vitest
Puppeteer E2E

原则：



不做 MMORPG

不做多人

不做实时动作游戏

不要过度设计

核心游戏不能依赖 AI 才能运行

优先尽快增加真实可玩内容

三、当前封板状态

Phase 1

PHASE 1 SEALED ✅

Phase 1 最终封板 HEAD：

e0de5b09054f267bf051b6fdaf7451519985393b

Phase 2 第一阶段

已完成：



玩家自由创建角色

姓名不再默认“石头城”

职业不再默认骑士

属性初始全 8，14 点自由分配

职业推荐配点

桌面三栏布局

平板两栏

手机单栏

战斗 V2

天龙城北门

《北门失联》

黑鬃魔狼



TM-P2-001 最终已封板：

TM-P2-001 SEALED ✅
TM-P2-001-R1 SEALED ✅

当前正式 baseline / main HEAD：

4dfeca5a87932c2c6a15e3c50e876b041c20a2f1

注意：

cc9d766
→ 861cca7
→ 4dfeca5

其中：



861cca7 实际属于 TM-P2-001-R1，但开发者错误写成 p2-002

4dfeca5 只是 GitHub Pages base: './' 修复



下一张正式任务仍叫 TM-P2-002。

四、当前剧情状态

黄金兔子王长期线

任务：

quest_golden_rabbit_search

必须保持：

status = in_progress
stage = 0

flags：

asked_blacksmith = true
asked_apothecary = true
village_inquiry_reported = true
rabbit_lair_rechecked = true

背包：

rabbit_path ×1

黄金兔子线目前冻结

禁止擅自：



把黑石塔连接黄金兔子线

把天龙城北门设为兔王目的地

让马科/王财认出兔子地图

消耗 rabbit_path

新增黄金兔子王敌人

揭晓兔王所在地



等后续明确任务卡再解冻。

五、当前 Phase 2 剧情

任务：

quest_north_gate_missing_patrol
《北门失联》

发布者：

马科
knight_captain_make

前提：

quest_wangcai_trouble === completed

流程：

武馆马科
→ 接任务
→ 天龙城北门
→ 查看巡逻队痕迹
→ 黑鬃魔狼
→ 找到断裂骑士团铜牌
→ 回武馆告诉马科
→ 完成任务

奖励：

30 gold

北门剧情目前只确认：

失踪巡逻队继续向北。

还没有开放北方新地图，也没有解决失踪小队。

六、用户最新试玩反馈

这是当前最重要的下一阶段设计依据。

1. 战斗数据显示不清楚

用户看到：

魔化兔的攻击：
D20 20 + 攻击加值 2 = 22

误以为“魔化兔攻击力 22”，但实际：

attackBonus = 2
damage = 2

当前暴击 150%，所以：

ceil(2 × 1.5) = 3

因此只掉 3 HP。



用户希望战斗面板明确显示真正基础属性，例如：

雅各布
Lv.1 · 战士

生命       15 / 18
灵力        4 / 6

护甲等级       9
攻击力         8

后续最好补：

敏捷
力量
体质
冥想
幸运
当前武器

敌人也应显示：

攻击力
护甲
敏捷
HP

七、战斗系统下一版：Combat V3

用户认为当前：

D20 + 攻击加值 vs 防御

概念不合理。



当前源码确实：

getPlayerDefense(agi)
= 10 + AGI modifier

也就是说敏捷实际被当成了防御。



用户要求重新定义：

敏捷

负责：



命中

擦伤

先手

命中规则

建议已确定：

天然 1
→ critical_miss
→ MISS
→ 0 伤害

天然 20
→ critical_hit
→ 暴击
→ 原始伤害 ×2

普通骰：

攻击方敏捷 + D20 >= 防守方敏捷
→ 命中

攻击方敏捷 + D20 < 防守方敏捷
→ 擦伤
→ 50% 原始伤害

旧的：

Defense - 4

擦伤区间应删除。

八、护甲/防御新定义

护甲不再决定能否命中。



护甲只负责减伤。



建议玩家基础护甲：

10 + CON 属性修正 + 装备护甲加成

敏捷不能再参与护甲。



用户提出公式：

护甲 = 10
D20 = 15

注意术语：

减伤率
= armor / (armor + roll)

承伤率
= roll / (armor + roll)

例：

10 / (10 + 15)
= 40% 减伤

承伤 60%

最终：

finalDamage
= ceil(rawDamage × roll / (armor + roll))

非 MISS 至少 1 点伤害。



顺序：

普通：
攻击力
→ 护甲

擦伤：
攻击力 × 50%
→ 护甲

暴击：
攻击力 × 2
→ 护甲

九、先手系统

目前战斗默认玩家先手。



需要改为：

玩家：D20 + AGI
敌人：D20 + AGI

高者先手。



平局：

AGI 高者先
仍相同 → 玩家先

敌人如果赢先手，必须真的先攻击一次。

十、幸运属性

目前 LCK 虽存在：

str
con
agi
mnd
lck

但正式游戏基本没有读取幸运。



所以现在幸运几乎属于“白加属性”。



用户希望幸运影响：



怪物掉落

掉落数量

掉落稀有度

宝箱品质

宝箱数量

部分社交

特殊随机事件

部分场景判定



设计原则：



幸运不能取代所有其他属性。



例如：

力量 → 破门
敏捷 → 翻越/躲避
冥想 → 魔法/精神
幸运 → 偶然发现、随机机缘、高品质奖励

下一步先预留 Luck 规则入口，不必马上给 Phase 1 旧剧情硬塞随机事件。

十一、技能系统现状

当前没有真正通用技能系统。



现有技能直接硬编码在 CombatPage：

法师：法术攻击
骑士：骑士重击
游侠：迅捷突袭
战士：压制猛击

尤其：

战士压制猛击

当前伤害跟普通攻击完全一样。



区别只有：

正常命中 / 暴击
→ 敌人本次不反击

所以用户感觉：

花灵力和普通攻击伤害一样。

这是源码真实行为。

十二、未来技能系统要求

后续必须真正建立：

SkillDefinition
Skill Registry
玩家已学习技能
技能消耗
技能目标
伤害类型
技能效果
状态效果
技能标签
技能升级

不能继续每个技能：

handleXXXSkill()

硬塞 CombatPage。



技能不只是战斗技能。



用户明确要求技能可以影响场景。



例如：

石门
→ 力量技能
→ 爆炸技能
→ 土系技能

河流
→ 冰系技能冻结
→ 飞行技能
→ 搭桥类能力

建议技能带 tag：

fire
ice
lightning
force
earth
healing
control
movement
nature
illusion
summon

场景节点读取 tag，而不是写死具体技能 ID。

十三、宠物/伙伴系统

当前：

GameState {
  player
  inventory
  equipment
  quests
  world
}

没有：

pets
companions
party

所以目前没有宠物系统。



用户希望以后包括：



宠物获得

宠物养成

宠物互动

喂食

亲密度

战斗

升级

技能

探索互动



建议底层不要只叫 PetSystem。



做：

Companion / 伙伴系统

未来统一支持：



动物宠物

魔兽

召唤物

精灵

人形伙伴

剧情队友



第一版：

最多 1 个出战伙伴

避免直接做复杂队伍系统。



最好在技能系统之后开发，让宠物复用 SkillDefinition。

十四、存档现状

当前只有一个存档。



源码：

SAVE_KEY = tianmeng_continent_save
SAVE_VERSION = 1

使用：

localStorage

所以存档与浏览器 Origin 绑定。



例如：

localhost:5173

和：

localhost:5199

属于不同存档空间。



这也是用户经常更新后感觉存档没了的重要原因。

十五、下一步存档设计

用户明确要求：

五个存档位

Slot 1
Slot 2
Slot 3
Slot 4
Slot 5

每槽显示：



角色姓名

职业

等级

当前地点

保存时间



主菜单：

继续游戏
→ 最近一次有效存档

读取存档
→ 五槽位

游戏内：

保存游戏
→ 五槽位
→ 已占用则确认覆盖

还应支持：

删除单槽

十六、必须做存档迁移

不能以后：

SAVE_VERSION 改了
→ 旧存档全部报废

需要：

migrateSave(...)

建立逐版本迁移链。



现有旧单槽：

tianmeng_continent_save

如果新 Slot 1 为空：

检测有效旧档
→ 自动迁移 Slot 1

旧档迁移成功前不得删除旧 key。



单个坏槽不能影响其他四槽。

十七、存档导入/导出

下一阶段还应增加：

导出存档
导入存档

最好五槽一次导出 JSON。



用途：



换端口

换浏览器

换电脑

GitHub Pages / localhost 切换

清浏览器数据前备份



导入必须先完整校验。



非法 JSON：

不得覆盖现有存档

十八、已经下发的下一张任务卡

TM-P2-002

名称：

TM-P2-002
战斗 V3 + 战斗信息面板 + 五槽位存档 V2

Baseline：

4dfeca5a87932c2c6a15e3c50e876b041c20a2f1

建议 commit：

feat: rebuild combat stats and add multi-slot save migration

核心范围：

A. Combat V3

敏捷负责命中

敏捷负责先手

护甲只负责减伤

暴击重新 200%

天然 1 MISS

普通失败变擦伤

护甲公式按 D20 动态计算

玩家/敌人都用同一语义

B. 战斗面板

显示：

HP
MP
攻击力
护甲
敏捷
五项基础属性
武器

敌人也显示：

HP
攻击力
护甲
敏捷

C. 五槽位存档

5 Slots

覆盖确认

删除

最近存档 Continue

每槽独立

损坏隔离

D. 迁移

旧 V1 单档
→ 新 Slot 1

建立长期迁移机制。

E. 导入/导出

JSON 备份恢复。

十九、TM-P2-002 暂时禁止

本卡不要同时开发：



黄金兔子王新剧情

北方新地图

宠物系统

完整技能系统

技能树

伙伴队伍

完整 LootSystem

XP 系统



原因：



先把战斗规则和存档基础打稳。

二十、后续推荐顺序

TM-P2-002
战斗 V3
+ 战斗信息面板
+ 五槽位存档
+ 存档迁移
        ↓
TM-P2-003
正式技能系统
+ 幸运
+ Loot
+ 宝箱
+ 场景技能交互
        ↓
TM-P2-004
伙伴 / 宠物系统 MVP
        ↓
继续 Phase 2 北方剧情

二十一、GitHub 审计规则

开发者提交后，ChatGPT 必须检查：

1. main 当前真实 HEAD
2. HEAD parent
3. baseline → HEAD 是否线性
4. changed files 完整列表
5. 是否夹带范围外修改
6. 实际业务代码
7. 单测源码
8. E2E 源码
9. 是否存在假断言
10. Store / UI / App guard 是否一致
11. 非法操作是否保证 GameState 不变
12. 是否修改 SAVE_VERSION/schema
13. 如修改存档格式，迁移是否真实可用
14. CI 如有 run ID，亲自查

不要因为开发者说：

926/926 PASS
E2E PASS
CI success

就直接通过。

二十二、项目开发总原则

最重要几条：

不要过度设计。
不要只修 UI，不解决规则本身。
不要为了测试通过写假断言。
不要让新系统破坏旧存档。
不要擅自解冻黄金兔子剧情。
不要一次塞三四个大型系统。
一张任务卡一个清晰阶段。

下一会话直接从：

“继续 TM-P2-002，等 DSH 提交后按 baseline 4dfeca5... 做 GitHub 源码审计。”

开始即可。