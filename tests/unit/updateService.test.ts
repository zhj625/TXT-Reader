import { EventEmitter } from 'node:events';
import type { AutoUpdater } from 'electron';
import { INITIAL_CHECK_DELAY_MS, UPDATE_INTERVAL_MS, UpdateService, type UpdateOptions } from '../../src/main/services/updateService';

function createService(overrides: Partial<UpdateOptions> = {}) {
  const updater = Object.assign(new EventEmitter(), { setFeedURL: vi.fn(), checkForUpdates: vi.fn() });
  const service = new UpdateService(updater as unknown as AutoUpdater, {
    version: '0.2.0', platform: 'win32', arch: 'x64', packaged: true, installed: true, ...overrides,
  });
  return { updater, service };
}

describe('automatic updates', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the installer lock, checks the fixed feed, and periodically retries', () => {
    const { updater, service } = createService();
    service.start();
    service.start();
    expect(service.check().status).toBe('idle');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INITIAL_CHECK_DELAY_MS);
    expect(updater.setFeedURL).toHaveBeenCalledWith({url:'https://update.electronjs.org/zhj625/TXT-Reader/win32-x64/0.2.0'});
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    updater.emit('update-not-available');
    expect(service.getState().status).toBe('up-to-date');
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    service.dispose();
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(updater.listenerCount('error')).toBe(0);
  });

  it.each([{packaged:false}, {installed:false}, {platform:'linux'}, {arch:'arm64'}, {disabled:true}])('does not update unsupported runs: %j', (options) => {
    const { updater, service } = createService(options);
    service.start();
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    expect(service.check().status).toBe('disabled');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    service.dispose();
  });

  it('deduplicates checks and leaves downloaded updates ready for the next normal launch', () => {
    const { updater, service } = createService();
    service.start();
    vi.advanceTimersByTime(INITIAL_CHECK_DELAY_MS);
    service.check();
    updater.emit('update-available');
    expect(service.check().status).toBe('downloading');
    updater.emit('update-downloaded');
    expect(service.check().status).toBe('downloaded');
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(service.getState().message).toContain('下次启动');
    service.dispose();
  });

  it('recovers from network errors through manual checks without affecting reading', () => {
    const { updater, service } = createService();
    service.start();
    vi.advanceTimersByTime(INITIAL_CHECK_DELAY_MS);
    updater.emit('error', new Error('offline'));
    expect(service.getState().status).toBe('error');
    expect(service.check().status).toBe('checking');
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    updater.emit('update-not-available');
    const snapshot = service.getState();
    snapshot.status = 'error';
    expect(service.getState().status).toBe('up-to-date');
    service.dispose();
  });

  it.each([
    ['Response status 404 (Not Found)', '更新源尚未准备好，请稍后重试'],
    ['ETIMEDOUT while connecting', '无法连接更新服务，请检查网络后重试'],
    ['Unexpected updater failure', '检查更新失败，请稍后重试'],
  ])('reports the actual failure category for %s', (detail, message) => {
    const { updater, service } = createService();
    service.start();
    vi.advanceTimersByTime(INITIAL_CHECK_DELAY_MS);
    updater.emit('error', new Error(detail));
    expect(service.getState()).toMatchObject({status:'error', message});
    expect(service.check().status).toBe('checking');
    service.dispose();
  });

  it('handles synchronous updater failures and permits a later retry', () => {
    const { updater, service } = createService();
    updater.setFeedURL.mockImplementationOnce(() => { throw Error('feed unavailable'); });
    service.start();
    vi.advanceTimersByTime(INITIAL_CHECK_DELAY_MS);
    expect(service.getState().status).toBe('error');
    service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    service.dispose();
  });
});
