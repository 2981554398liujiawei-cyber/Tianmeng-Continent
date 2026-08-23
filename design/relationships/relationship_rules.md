# 关系层级与好感来源规则（Relationship Rules）

> 依据任务卡 TM-P2-007 第 36 节（§36 Relationship Rules）编制，为 Game Design Bible 关系系统规则文档。
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目对原著的改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。
> 本文件描述关系层级、禁止字段与好感来源；Approval 触发细节见 `approval_rules.md`，成人内容边界见 `intimacy_rules.md`。

## 1. 关系层级：六档（保持现有）

关系层级维持以下六个阶段，不新增、不合并、不改名 `[CANON]`：

```text
stranger       陌生人
acquaintance   相识
trusted        信任
close          亲近
romance        恋爱
committed      承诺
```

- 六档顺序即关系由浅入深的方向；档位由好感（affection）与信任（trust）数值档位以及显式关系 flag 共同决定 `[CANON]`。
- `romance` 与 `committed` 必须通过显式剧情事件解锁，不能仅靠刷数值自动进入 `[CANON]`（现有实现 `stageOf`：`committed` / `romance_started` flag 优先判定）。
- 档位数值参考（源自现有实现，非本卡新增）：初始 `acquaintance ≥5 好感 / ≥5 信任`；`trusted ≥30 好感 / ≥25 信任`；`close ≥50 好感 / ≥40 信任`；好感/信任范围 `[0,100]` `[CANON]`。

## 2. 不增加的字段

**禁止新增以下关系数值或状态** `[CANON]`：

- lust（欲望）
- submission（臣服）
- obedience（顺从）

现有关系核心数值只有 **好感（affection）** 与 **信任（trust）**。任何实现都不得引入上述字段或语义等价字段（如 desire / sex / obedience / submission 及其同义词）`[CANON]`。

## 3. 好感来源（合法好感来源清单）

好感/信任可以通过以下来源获得 `[任务卡 §36]`：

```text
1. 日常新对话
2. 合适礼物
3. 同行
4. 营地
5. 任务选择
6. 个人支线
7. 守约
8. 帮助她的族群 / 理想
```

### 来源说明与落地参考

| 来源 | 说明 | 落地参考 |
|---|---|---|
| 日常新对话 | 新的、有内容的对话 | 普通交谈基础收益 +1/次，每休整周期上限 2 次（talksThisRest）`[CANON]` |
| 合适礼物 | 送对方喜欢或契合的物品 | 礼物收益：普通 +1 / 命中 likedGiftTags +2 / favoriteItemIds +4；不加信任；每周期一次 `[CANON]` |
| 同行 | 带她一起行动、冒险 | 队伍 active 槽位上限 3（MAX_ACTIVE_COMPANIONS）`[CANON]`；同行事件/结算收益 `[PLANNED]` |
| 营地 | 营地中的互动与对话 | Long Rest 承担关系互动周期（满资源也允许休整）`[CANON]`；营地剧情事件 `[PLANNED]` |
| 任务选择 | 在任务/剧情中做出她认可的选择 | 见 approval_rules.md（重要决定 approval）`[PLANNED]` |
| 个人支线 | 完成她专属的个人支线 | personalQuestStage 记录支线进度、不参与档位判定 `[CANON]`；支线结算好感 `[PLANNED]` |
| 守约 | 兑现对她的承诺 | 承诺→兑现闭环；违约按反感行为反向处理 `[PLANNED]` |
| 帮助她的族群 / 理想 | 援助她在意的族群或支持她的价值观 | 按 RelationshipProfile.values 判定 `[CANON]` 档案，触发时机 `[PLANNED]` |

> 负面方向（反感行为）按角色模板第 12 项「反感行为」在角色档案中单独定义；本文件不扩展具体数值。

## 4. 重复收益限制

**重复刷同一句对话不重复收益。** `[任务卡 §36]`

- 同一段对话 / 同一句台词对同一角色只结算一次好感/信任收益，重复触发不叠加。
- 既有机制（每休整周期交谈/送礼次数上限）负责"周期内频率"维度 `[CANON]`；本卡要求补足"同一句不重复"维度（对话事件的幂等记录）`[PLANNED]`。

## 5. 重要决定只对在场或合理知情伙伴产生 approval

重要决定（任务选择、路线分支、重大剧情抉择）只对**在场**或**合理知情**的伙伴产生 approval / disapproval `[任务卡 §36]`。

- 既不在场、又无从知情的伙伴，对该决定不表态、不产生任何好感/信任变化。
- "在场"判定复用现有 presence 机制（`isCompanionPresent`）`[CANON]`。
- "合理知情"指通过在场、对话、信使、公开事件等正当途径得知该决定，而非凭空获知；具体判定见 `approval_rules.md`。

## 6. 落地实现规则（供实现参考）

- 阶段判定以 `stageOf` 为唯一出口；新增来源只允许影响 affection/trust，不得直接写 stage `[CANON]`。
- 所有好感/信任变化必须携带明确来源（RelationshipChangeSource 风格），禁止无来源的裸数值变化 `[CANON]`。
- 同句/同事件收益幂等：记录已结算的事件键，重复触发不重复收益 `[PLANNED]`。
- 关系状态数值安全：affection/trust 必须为 `[0,100]` 有限整数，禁止 NaN / Infinity / 小数 / 越界写入存档 `[CANON]`。
- 禁止新增 lust/submission/obedience 或等价字段；禁止剧情按此类假想字段分档或作为推进依据 `[CANON]`。

## 7. 关联文档

- Approval 触发与"在场/合理知情"判定：`approval_rules.md`
- 成人内容边界与同意：`intimacy_rules.md`
- 内容变更记录：`../CONTENT_CHANGES.md`
- 方向总纲：`../00_GAME_DIRECTION.md`
