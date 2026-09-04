import type { ReaderDesktopApi } from './shared/contracts';

declare global {
  interface Window {
    readerApi: ReaderDesktopApi;
  }

  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}

export {};
