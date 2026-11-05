/** A dataset link starts a separate page session, including playback and request caches. */
export const datasetId =
  new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('dataset') ===
  'wind'
    ? 'wind'
    : 'converter';
export const isWind = datasetId === 'wind';
export const dataRoot = isWind ? 'data/wind/' : 'data/journey/';
export const dataUrl = (file: string) => import.meta.env.BASE_URL + dataRoot + file;
export const datasetHome = (id: 'wind' | 'converter') =>
  import.meta.env.BASE_URL + (id === 'wind' ? '?dataset=wind#/' : '#/');
