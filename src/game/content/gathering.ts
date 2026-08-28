import type { GatheringDefinition } from '../types/gathering'

export const GATHERING: Record<string, GatheringDefinition> = {
  north_hills_hemostatic_herb: {
    id: 'north_hills_hemostatic_herb', name: '止血草', locationId: 'qingshi_north_hills', category: 'herb',
    resultItems: [{ itemId: 'hemostatic_herb', quantity: 2 }], description: '长在背风石缝里的止血草。', once: true,
  },
  spirit_spring_moss: {
    id: 'spirit_spring_moss', name: '清泉苔', locationId: 'spirit_spring_valley', category: 'herb',
    resultItems: [{ itemId: 'clear_spring_moss', quantity: 1 }], description: '被泉雾滋养的青苔。', once: true,
  },
  forest_boar_hide: {
    id: 'forest_boar_hide', name: '检查山林野猪', locationId: 'qingshi_north_hills', category: 'creature',
    resultItems: [{ itemId: 'wild_boar_hide', quantity: 1 }], description: '从已击败的山林野猪身上取下皮料。', once: true, prerequisiteFlag: 'forest_boar_first_kill',
  },
  venom_bee_stinger: {
    id: 'venom_bee_stinger', name: '检查毒针蜂群', locationId: 'spirit_spring_valley', category: 'creature',
    resultItems: [{ itemId: 'venom_bee_stinger', quantity: 2 }], description: '从已驱散的蜂群残留中收集蜂针。', once: true, prerequisiteFlag: 'venom_bee_swarm_first_kill',
  },
  qialala_hide: {
    id: 'qialala_hide', name: '收集熊皮', locationId: 'spirit_spring_valley', category: 'creature',
    resultItems: [{ itemId: 'bear_hide', quantity: 1 }], description: '恰拉拉留下的厚实熊皮。', once: true, prerequisiteFlag: 'black_bear_qialala_defeated',
  },
  spirit_spring_water: {
    id: 'spirit_spring_water', name: '收集神泉之水', locationId: 'spirit_spring_valley', category: 'natural',
    resultItems: [{ itemId: 'spirit_spring_water', quantity: 1 }], description: '从已平静的泉眼中装取神泉之水。', once: true, prerequisiteFlag: 'black_bear_qialala_defeated',
  },
}

export function getGathering(id: string): GatheringDefinition | undefined { return GATHERING[id] }
