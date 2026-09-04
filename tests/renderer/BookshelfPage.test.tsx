// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookSummary, ReaderDesktopApi } from '../../src/shared/contracts';
import { BookshelfPage } from '../../src/renderer/components/BookshelfPage';

const book: BookSummary = {
  id: 'a'.repeat(64),
  title: '长夜读书',
  sourceFileName: '长夜读书.txt',
  byteLength: 2_048,
  characterLength: 1_000,
  importedAt: '2026-09-03T00:00:00.000Z',
  lastReadAt: null,
  progress: { charOffset: 0, percentage: 0, updatedAt: null },
};

function mockApi(overrides: Partial<ReaderDesktopApi> = {}): ReaderDesktopApi {
  return {
    listBooks: vi.fn().mockResolvedValue([]),
    importBook: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    loadBook: vi.fn(),
    removeBook: vi.fn().mockResolvedValue(undefined),
    saveProgress: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({ fontSize: 'medium' }),
    updateSettings: vi.fn(),
    ...overrides,
  };
}

describe('BookshelfPage', () => {
  it('shows the empty state and opens a successfully imported book', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    window.readerApi = mockApi({
      importBook: vi.fn().mockResolvedValue({ status: 'success', book }),
    });
    render(<BookshelfPage onOpen={onOpen} onNotice={vi.fn()} />);

    expect(await screen.findByTestId('empty-shelf')).toBeInTheDocument();
    await user.click(screen.getByTestId('import-book'));
    expect(onOpen).toHaveBeenCalledWith(book.id);
  });

  it('confirms removal, updates the shelf and preserves a clear user message', async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    window.readerApi = mockApi({ listBooks: vi.fn().mockResolvedValue([book]) });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BookshelfPage onOpen={vi.fn()} onNotice={onNotice} />);

    await user.click(await screen.findByRole('button', { name: `移除《${book.title}》` }));
    await waitFor(() => expect(window.readerApi.removeBook).toHaveBeenCalledWith(book.id));
    expect(screen.queryByText(book.title)).not.toBeInTheDocument();
    expect(onNotice).toHaveBeenCalledWith(`已从书架移除《${book.title}》`);
  });
});
