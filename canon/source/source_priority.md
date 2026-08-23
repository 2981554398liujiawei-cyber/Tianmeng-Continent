# Source Priority — 来源优先级与使用规则

> 本文件依据任务卡 TM-P2-007 第 7 节、第 119 节编制，是 `00_SOURCE_OF_TRUTH.md` 的展开执行规范。
> 定义了来源分档、标签规范与「如何选源」的具体规则。

## 1. 六档来源（任务卡第 7 节）

```
1. 用户当前明确裁定
2. 项目 canon 当前正式裁定        → 00_DECISIONS.md / AU_CHANGES.md
3. 原著明确事实                   → 必须带章段来源（禁「据原著」无章段）
4. 已上线且未被正式废止的游戏连续性 → README P0–P1-031 + src/game/content/ 注册表 + 当前代码行为
5. 旧设计文档                     → Library 旧设定，仅在 1–4 缺源时可用，且须交叉核对
6. 临时推演                       → 仅作思路，不得直接落档为事实
```

任何冲突：高优先级覆盖低优先级；发现冲突记入 `CANON_CONFLICTS.md`。

## 2. 本项目可落档的原著级权威输入（唯三）

本阶段能拿到的原著事实只有三处，其它一律不主动读取/复制原著 TXT：

1. **完整任务卡 TM-P2-007**（含原著章节回查区间、六核心角色原著事实示例、AU-001~005 原文）——路径：临时目录 `tm-p2-007-taskcard.md`。
2. **上线游戏连续性基线**：本 worktree `README.md`（P0–P1-031 全部内容历史）+ `src/game/content/` 下的 npcs.ts / quests.ts / items.ts / locations.ts / enemies.ts / companions.ts / relationships.ts / professions.ts / skills.ts。
3. **任务卡提供的原著信息**：如莉安雅（飞龙圣骑士 / 水雾殿 / 六头双翼蛇 / 龙马琴 / 飞龙烈焰枪 / 寒冰雪龙 / 纯阴水泉，来源原著约 112–115、167、187–207）。

原著 TXT 文件是外部参考，本阶段不读取、不复制进仓库。

## 3. 标签规范（任务卡第 119 节）

| 标签 | 定义 | 示例 |
|---|---|---|
| `[CANON]` | 已上线游戏里确认的事实 | 地点 `qingshi_village`、敌人 `dudu_rabbit`（嘟嘟兔） |
| `[PROJECT-AU]` | 项目对原著的改编 | Sakura 提前、坐骑不是战斗单位 |
| `[PLANNED]` | 未来规划内容 | Act III 水雾殿、莉安雅正式获取 |
| `[UNKNOWN]` | 无法从权威输入核实 | 原著坐骑「紫焰雷翼马」的具体能力数值 |

补充规则：

- 一个条目可以组合使用标签，如 `[CANON][PROJECT-AU]`（已上线且是改编行为）。
- 原著事实必须给来源章段；给不出就 `[UNKNOWN]`。
- `[UNKNOWN]` 的内容通常伴随 `[PLANNED]`（待回查后填充），或直接不写。

## 4. 选源决策流程（具体用法）

### 4.1 人物档案

1. 先核对 `src/game/content/companions.ts`、`relationships.ts`、`npcs.ts` 是否存在该角色已上线条目 → 有则逐字段采纳为 `[CANON]`（如 Sakura 的属性、技能、values、likedGiftTags、adult=true）。
2. 再核对任务卡第 10 节/第 16 节给出的原著事实示例 → 采纳为 `[CANON-原著]` 并带章段。
3. 其余（原著具体外貌、剧情细节、其它角色原著事实）→ `[UNKNOWN]` 或 `[PLANNED]`，不编造。

### 4.2 剧情/世界

1. `[CANON]`：README 已记录的阶段内容（青石村→天龙城→黑石塔；Phase 2 北门失联；Sakura 落樱越界）。
2. `[PLANNED]`：任务卡第 12 节推荐主结构（Act I–XII + Finale）。
3. 具体原文细节（非已上线、非任务卡给出）→ `[UNKNOWN]`。

### 4.3 系统设计（Backpack / Loot / Mount / Encounter / Party Combat）

- 这些是**任务卡规格**（§20–116）→ 设计文档正文以任务卡为准，可标注 `[SPEC: TM-P2-007 §xx]`。
- 代码现状（如 ItemType 七类、LOOT_TABLES 现有结构、Combat V3）→ `[CANON]` 引用。
- 冲突 → 记 `CANON_CONFLICTS.md`（见 C-007）。

## 5. 原著回查执行约定

- 采用**目标驱动回查**（任务卡第 9 节），不是全文摘要。
- 回查区间与每段「待提取要素」见 `source/novel_chapter_index.md`。
- 回查产出：把可核实事实以 `[CANON]` + 章段来源回填到对应档案/目录，把仍无法核实的保留 `[UNKNOWN]`。
- 本阶段（TM-P2-007）**不执行**原著全文回查（该动作在任务卡清单中是后续工作）；本阶段只建立索引与待提取清单，供后续回查使用。
