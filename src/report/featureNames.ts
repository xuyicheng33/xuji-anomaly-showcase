import type { Feature } from '../journey';

export const featureGroups = ['全部', '电压', '电流', '功率', '温度', '其他'] as const;
export type FeatureGroup = (typeof featureGroups)[number];

/** Display names come from the retained dictionary; indexes and source keys stay intact. */
export function featureName(feature: Feature) {
  if (feature.label !== '监测值') return feature.label;
  const match = feature.description.match(
    /CONVERTER POLE(\d+) GROUP(\d+) (CURRENT L(\d)|ACTIVE POWER|REACTIVE POWER)/,
  );
  if (!match) return feature.label;
  const kind = match[3].startsWith('CURRENT')
    ? `交流电流 L${match[4]}`
    : match[3] === 'ACTIVE POWER'
      ? '有功功率'
      : '无功功率';
  return `${kind} · 极${match[1]}组${match[2]}`;
}

export function featureGroup(feature: Feature): FeatureGroup {
  const description = feature.description;
  if (/TEMPERATURE|TEMP/.test(description)) return '温度';
  if (/VOLTAGE/.test(description)) return '电压';
  if (/CURRENT/.test(description)) return '电流';
  if (/POWER/.test(description)) return '功率';
  return '其他';
}

export function matchesFeature(feature: Feature, query: string, group: FeatureGroup = '全部') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/);
  const text = `${featureName(feature)} ${feature.key} ${feature.description}`.toLocaleLowerCase();
  return (
    (group === '全部' || featureGroup(feature) === group) &&
    words.every((word) => text.includes(word))
  );
}
