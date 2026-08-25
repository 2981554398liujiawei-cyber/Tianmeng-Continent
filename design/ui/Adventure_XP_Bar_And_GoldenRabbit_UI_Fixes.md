# Adventure XP Bar 与 Golden Rabbit UI 修复边界

状态：修复说明，不等于已完成实现。

XP 条读取 adventureXp、当前与下一等级阈值；缺少下一等级显示封顶/不可用，不出现 NaN。胜利统一结算后刷新，逃跑/失败不增加 XP；重复击败按首次奖励规则，UI 不重复发放。

Golden Rabbit 必须显示 quest_golden_rabbit_search=in_progress、stage 0、四调查 flag=true、rabbit_path ×1。不得提供新目的地、消耗路径物品、Golden Rabbit King、North Gate、Mount/Pet/Sakura 联动或新 clue；旧入口应隐藏/禁用且不篡改存档。

验收覆盖新游戏、读 Save V6、胜利、重复胜利、逃跑、失败和刷新页面。确认 XP 与实际状态一致；确认 Golden Rabbit 仍冻结。P2-011 未推进，需新存档字段的方案暂不实现。
