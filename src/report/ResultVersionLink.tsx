import { datasetId, isLegacy } from '../datasets';

export default function ResultVersionLink() {
  const params = new URLSearchParams();
  if (datasetId === 'wind') params.set('dataset', 'wind');
  if (!isLegacy) params.set('version', 'legacy');
  return (
    <p className="reading-copy">
      <a
        className="inline-link"
        href={`${import.meta.env.BASE_URL}${params.size ? '?' + params : ''}#/metrics`}
      >
        {isLegacy ? '返回新版结果' : '查看原版结果'} →
      </a>
    </p>
  );
}
