import { useCallback, useState } from 'react';
import { BookshelfPage } from './components/BookshelfPage';
import { ReaderPage } from './components/ReaderPage';
import { Toast } from './components/Toast';

type Route = { page: 'bookshelf' } | { page: 'reader'; bookId: string };

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'bookshelf' });
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = useCallback((message: string) => setNotice(message), []);

  return (
    <div className="app-shell">
      {route.page === 'bookshelf' ? (
        <BookshelfPage
          onOpen={(bookId) => setRoute({ page: 'reader', bookId })}
          onNotice={showNotice}
        />
      ) : (
        <ReaderPage
          bookId={route.bookId}
          onBack={() => setRoute({ page: 'bookshelf' })}
          onNotice={showNotice}
        />
      )}
      <Toast message={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
