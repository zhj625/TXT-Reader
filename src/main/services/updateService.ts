import type { AutoUpdater } from 'electron';
import type { UpdateState } from '../../shared/contracts';

export const UPDATE_REPOSITORY = 'zhj625/TXT-Reader';
export const INITIAL_CHECK_DELAY_MS = 30_000;
export const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

type Updater = Pick<AutoUpdater, 'on' | 'removeListener' | 'setFeedURL' | 'checkForUpdates'>;
export interface UpdateOptions {
  version: string;
  platform: string;
  arch: string;
  packaged: boolean;
  installed: boolean;
  disabled?: boolean;
}

export class UpdateService {
  private state: UpdateState;
  private initialTimer?: ReturnType<typeof setTimeout>;
  private intervalTimer?: ReturnType<typeof setInterval>;
  private started = false;
  private readyAt = 0;

  constructor(private readonly updater: Updater, private readonly options: UpdateOptions) {
    const enabled = options.packaged && options.installed && options.platform === 'win32'
      && options.arch === 'x64' && !options.disabled;
    this.state = {
      version: options.version,
      status: enabled ? 'idle' : 'disabled',
      message: enabled ? '自动更新已开启' : '安装版支持自动更新',
    };
  }

  private readonly checking = () => this.setState('checking', '正在检查更新…');
  private readonly available = () => this.setState('downloading', '正在后台下载新版，可继续阅读');
  private readonly current = () => this.setState('up-to-date', '当前已是最新版本');
  private readonly downloaded = () => this.setState('downloaded', '新版已准备好，下次启动自动生效');
  private readonly failed = () => this.setState('error', '暂时无法更新，请检查网络后重试');

  private setState(status: UpdateState['status'], message: string): void {
    this.state = { ...this.state, status, message };
  }

  getState(): UpdateState { return { ...this.state }; }

  start(): void {
    if (this.started || this.state.status === 'disabled') return;
    this.started = true;
    // Squirrel holds an installation lock during the first launch.
    this.readyAt = Date.now() + INITIAL_CHECK_DELAY_MS;
    this.updater.on('checking-for-update', this.checking);
    this.updater.on('update-available', this.available);
    this.updater.on('update-not-available', this.current);
    this.updater.on('update-downloaded', this.downloaded);
    this.updater.on('error', this.failed);
    this.initialTimer = setTimeout(() => this.check(), INITIAL_CHECK_DELAY_MS);
    this.intervalTimer = setInterval(() => this.check(), UPDATE_INTERVAL_MS);
    this.initialTimer.unref?.();
    this.intervalTimer.unref?.();
  }

  check(): UpdateState {
    if (!this.started || ['disabled', 'checking', 'downloading', 'downloaded'].includes(this.state.status)) {
      return this.getState();
    }
    if (Date.now() < this.readyAt) {
      this.setState('idle', '启动后稍等片刻，将自动检查更新');
      return this.getState();
    }
    this.checking();
    try {
      this.updater.setFeedURL({
        url: 'https://update.electronjs.org/' + UPDATE_REPOSITORY + '/win32-x64/' + encodeURIComponent(this.options.version),
      });
      this.updater.checkForUpdates();
    } catch {
      this.failed();
    }
    return this.getState();
  }

  dispose(): void {
    clearTimeout(this.initialTimer);
    clearInterval(this.intervalTimer);
    this.updater.removeListener('checking-for-update', this.checking);
    this.updater.removeListener('update-available', this.available);
    this.updater.removeListener('update-not-available', this.current);
    this.updater.removeListener('update-downloaded', this.downloaded);
    this.updater.removeListener('error', this.failed);
    this.started = false;
  }
}
