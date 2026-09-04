import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookContent, FontSize } from '../../shared/contracts';
import { calculatePercentage, clampCharOffset } from '../../shared/progress';
import { createTextChunks, findChunkIndex } from '../../shared/textChunks';

interface ReaderPageProps {
  bookId: string;
  onBack: () => void;
  onNotice: (message: string) => void;
}

const FONT_SIZE_LABELS: Array<{ value: FontSize; label: string; sample: string }> = [
  { value: 'small', label: '小字号', sample: '小' },
  { value: 'medium', label: '中字号', sample: '中' },
  { value: 'large', label: '大字号', sample: '大' },
];

const READER_TOP_SPACING = 58;

export function ReaderPage({ bookId, onBack, onNotice }: ReaderPageProps) {
  const [book, setBook] = useState<BookContent | null>(null);
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pendingOffsetRef = useRef(0);
  const pendingRestoreRef = useRef<number | null>(null);

  const chunks = useMemo(() => createTextChunks(book?.content ?? ''), [book?.content]);
  // TanStack Virtual intentionally exposes imperative functions; React Compiler is not enabled here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: chunks.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) => {
      const charsPerLine = fontSize === 'small' ? 52 : fontSize === 'large' ? 38 : 45;
      const lineHeight = fontSize === 'small' ? 30 : fontSize === 'large' ? 39 : 34;
      return Math.max(70, Math.ceil(chunks[index].text.length / charsPerLine) * lineHeight + 26);
    },
    overscan: 5,
  });

  const getViewportOffset = useCallback(() => {
    if (!book || chunks.length === 0 || !scrollElementRef.current) return 0;
    const scrollTop = Math.max(0, scrollElementRef.current.scrollTop - READER_TOP_SPACING);
    const virtualItems = virtualizer.getVirtualItems();
    const visible = virtualItems.find((item) => item.end > scrollTop) ?? virtualItems[0];
    if (!visible) return pendingOffsetRef.current;

    const chunk = chunks[visible.index];
    const innerRatio = Math.min(Math.max((scrollTop - visible.start) / Math.max(visible.size, 1), 0), 1);
    return clampCharOffset(
      chunk.startOffset + Math.round(chunk.text.length * innerRatio),
      book.characterLength,
    );
  }, [book, chunks, virtualizer]);

  const restoreOffset = useCallback((charOffset: number) => {
    if (!book || chunks.length === 0) return;
    const normalized = clampCharOffset(charOffset, book.characterLength);
    const chunkIndex = findChunkIndex(chunks, normalized);
    const chunk = chunks[chunkIndex];
    const innerRatio = (normalized - chunk.startOffset) / Math.max(chunk.text.length, 1);
    virtualizer.scrollToIndex(chunkIndex, { align: 'start' });

    window.requestAnimationFrame(() => {
      virtualizer.measure();
      window.requestAnimationFrame(() => {
        const item = virtualizer.getVirtualItems().find((entry) => entry.index === chunkIndex);
        const scroller = scrollElementRef.current;
        if (item && scroller) {
          scroller.scrollTop = READER_TOP_SPACING + item.start + item.size * innerRatio;
        }
      });
    });
  }, [book, chunks, virtualizer]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([window.readerApi.loadBook(bookId), window.readerApi.getSettings()])
      .then(([loadedBook, settings]) => {
        if (!active) return;
        setBook(loadedBook);
        setFontSize(settings.fontSize);
        setProgress(loadedBook.progress.percentage);
        pendingOffsetRef.current = loadedBook.progress.charOffset;
        pendingRestoreRef.current = loadedBook.progress.charOffset;
      })
      .catch(() => {
        if (!active) return;
        onNotice('这本书暂时无法打开');
        onBack();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bookId, onBack, onNotice]);

  useEffect(() => {
    if (!book || pendingRestoreRef.current === null) return;
    const offset = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    restoreOffset(offset);
  }, [book, fontSize, restoreOffset]);

  const persistOffset = useCallback((charOffset: number) => {
    if (!book) return;
    pendingOffsetRef.current = charOffset;
    setProgress(calculatePercentage(charOffset, book.characterLength));
    void window.readerApi.saveProgress({ bookId: book.id, charOffset }).catch(() => {
      onNotice('阅读进度暂时没有保存成功');
    });
  }, [book, onNotice]);

  const handleScroll = () => {
    const offset = getViewportOffset();
    pendingOffsetRef.current = offset;
    if (book) setProgress(calculatePercentage(offset, book.characterLength));
    if (saveTimerRef.current !== null) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persistOffset(pendingOffsetRef.current);
    }, 250);
  };

  useEffect(() => {
    const saveBeforeClose = () => {
      if (!book) return;
      void window.readerApi.saveProgress({ bookId: book.id, charOffset: getViewportOffset() });
    };
    window.addEventListener('beforeunload', saveBeforeClose);
    return () => window.removeEventListener('beforeunload', saveBeforeClose);
  }, [book, getViewportOffset]);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
  }, []);

  const handleBack = async () => {
    if (book) {
      try {
        await window.readerApi.saveProgress({ bookId: book.id, charOffset: getViewportOffset() });
      } catch {
        onNotice('阅读进度暂时没有保存成功');
      }
    }
    onBack();
  };

  const handleFontSize = async (nextSize: FontSize) => {
    if (nextSize === fontSize) return;
    const anchor = getViewportOffset();
    try {
      const settings = await window.readerApi.updateSettings({ fontSize: nextSize });
      pendingRestoreRef.current = anchor;
      setFontSize(settings.fontSize);
    } catch {
      onNotice('字号设置没有保存成功');
    }
  };

  if (loading || !book) {
    return (
      <main className="reader-page reader-loading" data-testid="reader-loading">
        <div className="reader-loading-mark">墨</div>
        <p>正在展开书页…</p>
      </main>
    );
  }

  return (
    <main className={`reader-page font-${fontSize}`} data-testid="reader-page">
      <header className="reader-toolbar">
        <button className="back-button" type="button" onClick={() => void handleBack()}>
          <span aria-hidden="true">←</span> 书架
        </button>
        <div className="reader-title-block">
          <h1>{book.title}</h1>
          <span>{progress.toFixed(progress < 1 ? 1 : 0)}%</span>
        </div>
        <div className="font-controls" aria-label="字号">
          {FONT_SIZE_LABELS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={fontSize === option.value ? 'active' : ''}
              aria-label={option.label}
              aria-pressed={fontSize === option.value}
              onClick={() => void handleFontSize(option.value)}
            >
              {option.sample}
            </button>
          ))}
        </div>
      </header>

      <div className="reader-progress-line" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div
        ref={scrollElementRef}
        className="reading-scroller"
        onScroll={handleScroll}
        data-testid="reading-scroller"
      >
        <article
          className="reading-column"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
          aria-label={`${book.title}正文`}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const chunk = chunks[virtualItem.index];
            return (
              <p
                className="text-chunk"
                data-index={virtualItem.index}
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                {chunk.text}
              </p>
            );
          })}
        </article>
        <div className="reader-end" aria-hidden="true">— 全文完 —</div>
      </div>
    </main>
  );
}
