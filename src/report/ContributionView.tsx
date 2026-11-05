import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rankContributions } from '../contributions';
import { loadAsset, type Journey, type Model } from '../journey';
import { useDataAsset } from './useDataAsset';
import SensorWindowDetail from './SensorWindowDetail';
import { Footnote } from './notes';
import { featureName, matchesFeature } from './featureNames';

export default function ContributionView({
  data,
  model,
  index,
  playing,
  pause,
}: {
  data: Journey;
  model: Model;
  index: number | null;
  playing: boolean;
  pause: () => void;
}) {
  const [limit, setLimit] = useState(7);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<{ key: string; feature: number } | null>(null);
  const [lastHeight, setLastHeight] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const key = `${model.id}:${model.run}:${index}`;
  const chunk =
    index === null
      ? null
      : model.contributions.chunks.find((c) => index >= c.start && index < c.start + c.count);
  const asset = useDataAsset(
    chunk ? { ...chunk, shape: [chunk.count, data.features.length] } : null,
  );
  const features = data.features.length;
  useEffect(() => {
    if (!playing || !chunk) return;
    const next = model.contributions.chunks.find(
      (item) => item.start === chunk.start + chunk.count,
    );
    if (next)
      void loadAsset(next).catch(() => {
        /* The visible chunk retains its own retry control. */
      });
  }, [playing, chunk, model]);
  const ranked = useMemo(
    () =>
      asset.data && chunk && index !== null
        ? rankContributions(
            asset.data.subarray(
              (index - chunk.start) * features,
              (index - chunk.start + 1) * features,
            ),
            features,
          )
        : null,
    [asset.data, chunk, index, features],
  );
  const selected = !playing && selection?.key === key ? selection.feature : null;
  const selectedRow =
    selected === null ? null : ranked?.rows.find((row) => row.feature === selected);
  const rows = ranked?.rows.slice(0, limit) ?? [];
  const visibleRows =
    limit > 12 ? rows.filter((row) => matchesFeature(data.features[row.feature], query)) : rows;
  const remainder = ranked?.rows.slice(limit).reduce((sum, row) => sum + row.contribution, 0) ?? 0;
  const shown = rows.reduce((sum, row) => sum + row.contribution, 0);
  const ready = ranked !== null;
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(([entry]) => setLastHeight(entry.contentRect.height));
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [ready]);
  const percentage = (n: number) => (ranked?.total ? (n / ranked.total) * 100 : 0);
  const revealDetail = useCallback(() => {
    if (matchMedia('(max-width: 760px)').matches)
      detail.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
  }, []);
  const choose = (feature: number, button: HTMLButtonElement) => {
    pause();
    origin.current = button;
    setSelection({ key, feature });
  };
  const closeDetail = () => {
    setSelection(null);
    requestAnimationFrame(() => {
      origin.current?.focus({ preventScroll: true });
      if (matchMedia('(max-width: 760px)').matches)
        origin.current?.scrollIntoView({ block: 'nearest' });
    });
  };
  return (
    <section
      className="contribution-section"
      aria-labelledby="contribution-title"
      data-point={index === null ? '' : index + 1}
    >
      <div className="contribution-heading">
        <div>
          <h2 id="contribution-title">
            测点对分数的贡献
            <Footnote note="window-aggregation" reference="ref-contribution-overview" />
          </h2>
          <p className="quiet">
            {index === null ? '准备开始' : `第 ${index + 1} 点 · ${data.times[index]}`}
          </p>
        </div>
        <label className="field">
          显示测点
          <select
            aria-label="贡献测点数量"
            value={limit}
            onChange={(e) => {
              pause();
              setLimit(+e.target.value);
              setQuery('');
            }}
          >
            <option value={7}>前 {Math.min(7, features)} 个</option>
            {features > 7 && <option value={12}>前 {Math.min(12, features)} 个</option>}
            {features > 12 && <option value={features}>全部 {features} 个</option>}
          </select>
        </label>
      </div>
      {index === null ? (
        <div className="contribution-empty">—</div>
      ) : asset.error ? (
        <p role="alert" style={{ minHeight: lastHeight }}>
          贡献数据读取失败。<button onClick={asset.retry}>重试贡献数据</button>
        </p>
      ) : ranked ? (
        <div ref={content}>
          <div className="contribution-summary">
            <span>
              前 {rows.length} 个合计 <strong>{percentage(shown).toFixed(2)}%</strong>
              {features > rows.length && (
                <>
                  ，其余 {features - rows.length} 个{' '}
                  <strong>{percentage(remainder).toFixed(2)}%</strong>
                </>
              )}
            </span>
            <span>
              贡献合计 <strong data-testid="contribution-total">{ranked.total.toFixed(9)}</strong>
            </span>
          </div>
          {limit > 12 && (
            <div className="contribution-search">
              <label>
                <span>查找测点</span>
                <input
                  type="search"
                  aria-label="查找贡献测点"
                  placeholder="名称或测点编号"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <span>
                {visibleRows.length} / {features} 个测点
              </span>
            </div>
          )}
          <div className={'contribution-workspace' + (selectedRow ? ' has-detail' : '')}>
            <div
              className={'contribution-list' + (limit > 12 ? ' is-long' : '')}
              role="group"
              aria-label="测点贡献柱状图"
              data-playing={playing}
            >
              {visibleRows.map((row) => (
                <button
                  className="contribution-row"
                  key={row.feature}
                  aria-label={`查看测点 ${data.features[row.feature].key} 的贡献明细`}
                  aria-pressed={selected === row.feature}
                  data-feature={row.feature}
                  data-contribution={row.contribution}
                  onClick={(event) => choose(row.feature, event.currentTarget)}
                >
                  <span className="contribution-name">
                    {featureName(data.features[row.feature])}
                    <small>{data.features[row.feature].key}</small>
                  </span>
                  <span className="contribution-track">
                    <i style={{ width: `${percentage(row.contribution)}%` }} />
                  </span>
                  <span className="contribution-value">
                    {row.contribution.toFixed(6)}
                    <small>{percentage(row.contribution).toFixed(2)}%</small>
                  </span>
                  <svg className="contribution-chevron" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="m4 2 4 4-4 4" />
                  </svg>
                </button>
              ))}
              {visibleRows.length === 0 && (
                <p className="feature-no-results" role="status">
                  没有匹配的测点
                </p>
              )}
              {features > rows.length && (
                <button
                  className="contribution-row contribution-other"
                  data-contribution={remainder}
                  onClick={() => {
                    pause();
                    setLimit(features);
                  }}
                >
                  <span className="contribution-name">
                    其余 {features - rows.length} 个测点<small>查看全部 →</small>
                  </span>
                  <span className="contribution-track">
                    <i style={{ width: `${percentage(remainder)}%` }} />
                  </span>
                  <span className="contribution-value">
                    {remainder.toFixed(6)}
                    <small>{percentage(remainder).toFixed(2)}%</small>
                  </span>
                </button>
              )}
            </div>
            {selectedRow && index !== null && (
              <div ref={detail} className="contribution-detail-anchor">
                <SensorWindowDetail
                  key={`${key}:${selectedRow.feature}`}
                  data={data}
                  model={model}
                  index={index}
                  feature={selectedRow.feature}
                  meanError={selectedRow.error}
                  close={closeDetail}
                  reveal={revealDetail}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="contribution-empty" role="status" style={{ minHeight: lastHeight }}>
          正在读取当前时刻的测点贡献…
        </div>
      )}
    </section>
  );
}
