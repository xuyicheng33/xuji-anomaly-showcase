import { chapters } from './navigation';
import { dataset } from '../datasets';
import { rememberNoteOrigin } from './notes';

export default function ChapterNavigation({ page }: { page: string }) {
  const index = chapters.findIndex(({ id }) => id === page);
  if (index < 0) return null;
  const previous = chapters[index - 1];
  const next = chapters[index + 1];
  return (
    <nav className="chapter-navigation" aria-label="章节衔接">
      <a href={previous ? '#/' + previous.id : '#/'}>
        <span>{previous ? '← 上一章' : '← 返回首页'}</span>
        <strong>{previous?.title ?? `${dataset.title}异常检测研究`}</strong>
      </a>
      {next ? (
        <a href={'#/' + next.id}>
          <span>下一章 →</span>
          <strong>{next.title}</strong>
        </a>
      ) : (
        <a href="#/metrics" onClick={() => rememberNoteOrigin()}>
          <span>继续查看 →</span>
          <strong>数据与评估说明</strong>
        </a>
      )}
    </nav>
  );
}
