import { useCallback, useEffect, useState } from 'react';
import type { BookSummary, ImportBookResult } from '../../shared/contracts';

interface BookshelfPageProps {
  onOpen: (bookId: string) => void;
  onNotice: (message: string) => void;
}

function formatLastRead(book: BookSummary): string {
  if (!book.lastReadAt) return '尚未开始阅读';
  const date = new Date(book.lastReadAt);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `今天 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)}`
    : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resultMessage(result: Exclude<ImportBookResult, { status: 'success' | 'cancelled' }>): string {
  if (result.status === 'duplicate') return `《${result.title}》已经在书架中了`;
  return result.message;
}

export function BookshelfPage({ onOpen, onNotice }: BookshelfPageProps) {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refreshBooks = useCallback(async () => {
    try {
      setBooks(await window.readerApi.listBooks());
    } catch {
      onNotice('书架加载失败，请重新打开应用');
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    let active = true;
    window.readerApi.listBooks()
      .then((loadedBooks) => {
        if (active) setBooks(loadedBooks);
      })
      .catch(() => {
        if (active) onNotice('书架加载失败，请重新打开应用');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onNotice]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.readerApi.importBook();
      if (result.status === 'success') {
        onOpen(result.book.id);
      } else if (result.status !== 'cancelled') {
        onNotice(resultMessage(result));
        if (result.status === 'duplicate') await refreshBooks();
      }
    } catch {
      onNotice('导入没有完成，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = async (book: BookSummary) => {
    const confirmed = window.confirm(`从书架移除《${book.title}》？\n\n原始 TXT 文件不会被删除。`);
    if (!confirmed) return;

    setRemovingId(book.id);
    try {
      await window.readerApi.removeBook(book.id);
      setBooks((current) => current.filter((item) => item.id !== book.id));
      onNotice(`已从书架移除《${book.title}》`);
    } catch {
      onNotice('移除失败，请稍后重试');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <main className="bookshelf-page" data-testid="bookshelf-page">
      <header className="bookshelf-header">
        <div>
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">墨</span>
            <span className="eyebrow">本地 TXT 阅读器</span>
          </div>
          <h1>我的书架</h1>
          <p className="page-subtitle">让文字留在本机，也让每次阅读从上次停下的地方继续。</p>
        </div>
        <button
          className="primary-button import-button"
          type="button"
          onClick={handleImport}
          disabled={importing}
          data-testid="import-book"
        >
          <span className="button-plus" aria-hidden="true">＋</span>
          {importing ? '正在导入…' : '导入 TXT'}
        </button>
      </header>

      <div className="bookshelf-rule" />

      {loading ? (
        <section className="book-grid" aria-label="正在加载书架">
          {[0, 1, 2].map((item) => <div className="book-card book-card-skeleton" key={item} />)}
        </section>
      ) : books.length === 0 ? (
        <section className="empty-shelf" data-testid="empty-shelf">
          <div className="empty-books" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h2>书架还是空的</h2>
          <p>导入一本 TXT，从第一页开始。</p>
          <button className="secondary-button" type="button" onClick={handleImport} disabled={importing}>
            选择本地 TXT
          </button>
          <span className="privacy-note">文件与阅读记录只保存在这台电脑上</span>
        </section>
      ) : (
        <section className="book-grid" aria-label={`书架，共 ${books.length} 本`}>
          {books.map((book) => (
            <article
              className="book-card"
              key={book.id}
              data-testid={`book-${book.id}`}
            >
              <button
                className="book-open-button"
                type="button"
                aria-label={`打开《${book.title}》`}
                onClick={() => onOpen(book.id)}
              >
                <div className="book-spine" aria-hidden="true">
                  <span>{book.title.slice(0, 1)}</span>
                </div>
                <div className="book-details">
                  <div className="book-heading">
                    <h2>{book.title}</h2>
                  </div>
                  <p className="book-meta">{formatFileSize(book.byteLength)} · {formatLastRead(book)}</p>
                  <div className="progress-track" aria-label={`阅读进度 ${book.progress.percentage.toFixed(1)}%`}>
                    <span style={{ width: `${book.progress.percentage}%` }} />
                  </div>
                  <div className="book-progress-row">
                    <strong>{book.progress.percentage.toFixed(book.progress.percentage < 1 ? 1 : 0)}%</strong>
                    <span>{book.progress.percentage > 0 ? '继续阅读' : '开始阅读'} →</span>
                  </div>
                </div>
              </button>
              <button
                className="icon-button remove-button"
                type="button"
                aria-label={`移除《${book.title}》`}
                title="从书架移除"
                disabled={removingId === book.id}
                onClick={() => void handleRemove(book)}
              >
                {removingId === book.id ? '…' : '×'}
              </button>
            </article>
          ))}
        </section>
      )}

      <footer className="bookshelf-footer">
        <span>{books.length > 0 ? `${books.length} 本藏书` : '墨读'}</span>
        <span>离线 · 本地保存</span>
      </footer>
    </main>
  );
}
