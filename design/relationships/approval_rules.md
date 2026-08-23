# Approval 产生规则（Approval Rules）

> 依据任务卡 TM-P2-007 第 36 节（§36：重要决定只对在场或合理知情伙伴产生 approval）与方向总纲原则 3 编制。
> 标签规范：`[CANON]`=已上线实现；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。
> 核心数值约束：本卡**不新增 approval 数值字段**；approval 以好感（affection）/信任（trust）增减的形式落到既有数值上。

## 1. 什么是 approval

approval（认可）与 disapproval（不认可）是**重要决定引发的伙伴态度反应**：正面认可 → 好感/信任上升，负面不认可 → 好感/信任下降。

**实现口径：approval 不是新的关系字段。** 任务卡 §36 与 §38 第 10 项均未要求新增数值；既有实现核心数值只有 affection/trust `[CANON]`。所有 approval 结果都表现为对既有 affection/trust 的有限整数增减（clamp 至 `[0,100]`）`[CANON]`，并携带明确来源标识。

## 2. 何时产生 approval

只在**重要决定**发生时结算。重要决定指会影响后续剧情走向或伙伴处境的抉择，典型场景：

- 主线 / 支线任务选择（多解路径分支）
- 涉及伙伴本人、或其族群 / 理想的关键决策
- 剧情大节点（阵营、代价、牺牲、去留等）

日常交谈、普通对话、送礼**不经过** approval 通道，走各自的日常收益规则（见 relationship_rules.md §3）。

## 3. 哪些伙伴产生 approval：在场或合理知情

对一次重要决定，逐名判定每个可攻略伙伴是否产生 approve / disapprove：

### 判定 1：在场（presence）

伙伴当前"在场"且能感知该决定：

- 复用 `isCompanionPresent(companions, party, npcId)`（guest / recruited 且处于 activeCompanionIds）`[CANON]`。

### 判定 2：合理知情（reasonably informed）

伙伴虽不在场，但通过正当途径获知该决定：

- 决定公开发生且事后有可信渠道告知（同伴转述、信使、公开事件）；
- 决定与其个人支线 / 族群 / 理想直接相关，且有剧情依据让其获知；
- 不得凭"魔法全知"或"设定默认知晓"让无关伙伴凭空点评。

### 判定 3：两者皆无 → 不表态

既不在场又不知情的伙伴：不产生任何 approve / disapprove、不产生好感/信任变化、不触发相关对话。伙伴不凭空点评自己不知道的决定（方向总纲原则 3）。

> 实现提示：判定顺序为 presence → informed → 无表态；任一通过即参与结算，两者皆否即跳过。

## 4. approve / disapprove 的方向

- **approve**：决定符合该伙伴的价值观（`RelationshipProfile.values`）或有益于其在意对象 → 好感上升；视决定性质可少量加信任 `[CANON]` 档案，具体数值 `[PLANNED]`。
- **disapprove**：决定违背其价值观或伤害其在意对象 → 好感下降（可能伴随信任下降）`[PLANNED]`。
- 价值观匹配以 `values` 字段判定 `[CANON]`；每次增减的具体数值由该决定的数据配置给定，禁止无依据的任意数值。

## 5. 与重复对话收益限制的关系

- 重复刷同一句日常对话不重复收益（relationship_rules.md §4）针对**日常对话**通道。
- approval 是**事件驱动、单次结算**通道：同一重要决定对同一伙伴只结算一次 approve / disapprove，重复触发、读档重放不重复结算。
- 两条通道相互独立：日常收益上限（talksThisRest）不约束 approval；approval 也不占用日常交谈次数（上限逻辑不变 `[CANON]`，approval 幂等 `[PLANNED]`）。

## 6. 落地实现规则清单

对每个重要决定场景，实现时按以下清单核对：

1. 定义该决定的 approve / disapprove 结果：方向、数值、唯一来源标识。
2. 枚举候选伙伴：只考虑已建立关系的可攻略角色（RelationshipProfile 存在）`[CANON]`。
3. 逐名判定 presence：`isCompanionPresent(companions, party, npcId) === true` → 参与结算 `[CANON]`。
4. presence 为否时判定 informed：是否有剧情依据 / 事件告知路径 → 参与结算；无 → 跳过 `[PLANNED]`。
5. 结算：对参与伙伴执行 `applyRelationshipDelta`（approve 正 / disapprove 负，clamp `[0,100]`），source 为该决定唯一标识 `[CANON]` 机制。
6. 幂等：该决定 + 该伙伴的结算记录一次，读档 / 重放不重复 `[PLANNED]`。
7. 反馈文本：仅对实际结算（在场 / 知情）的伙伴展示其表态；未参与的伙伴无反应。
8. 存档安全：结算后执行 `isRelationshipStateSafe` 校验 `[CANON]`。

## 7. 关联文档

- 关系层级与好感来源：`relationship_rules.md`
- 成人内容边界：`intimacy_rules.md`
- 方向总纲原则 3：`../00_GAME_DIRECTION.md`
- 内容变更记录：`../CONTENT_CHANGES.md`
