// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReaderDesktopApi, UpdateState } from '../../src/shared/contracts';
import { UpdateStatus } from '../../src/renderer/components/UpdateStatus';

const state: UpdateState = {version:'0.2.0', status:'idle', message:'自动更新已开启'};
function mockApi(value: UpdateState = state) {
  window.readerApi = {
    getUpdateState: vi.fn().mockResolvedValue(value),
    checkForUpdates: vi.fn().mockResolvedValue({...state, status:'checking', message:'正在检查更新…'}),
  } as unknown as ReaderDesktopApi;
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('shows the installed version and allows a manual check', async () => {
  mockApi();
  render(<UpdateStatus />);
  expect(await screen.findByText('v0.2.0')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', {name:'检查更新'}));
  expect(window.readerApi.checkForUpdates).toHaveBeenCalledOnce();
  expect(await screen.findByText('正在检查更新…')).toBeInTheDocument();
  expect(screen.getByRole('button')).toBeDisabled();
});

it('explains portable builds without exposing a nonfunctional check button', async () => {
  mockApi({...state, status:'disabled', message:'安装版支持自动更新'});
  render(<UpdateStatus />);
  expect(await screen.findByText('安装版支持自动更新')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('refreshes download status and cleans up polling when unmounted', async () => {
  vi.useFakeTimers();
  mockApi();
  const view = render(<UpdateStatus />);
  await act(async () => {});
  vi.mocked(window.readerApi.getUpdateState).mockResolvedValue({...state, status:'downloaded', message:'新版已准备好，下次启动自动生效'});
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText('新版已准备好，下次启动自动生效')).toBeInTheDocument();
  expect(screen.getByRole('button')).toBeDisabled();
  view.unmount();
  const count = vi.mocked(window.readerApi.getUpdateState).mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(window.readerApi.getUpdateState).toHaveBeenCalledTimes(count);
});

it('keeps the check button usable after a rejected IPC request', async () => {
  mockApi();
  vi.mocked(window.readerApi.checkForUpdates).mockRejectedValue(new Error('unavailable'));
  render(<UpdateStatus />);
  await screen.findByText('v0.2.0');
  await userEvent.click(screen.getByRole('button'));
  expect(await screen.findByText('更新状态暂时无法读取')).toBeInTheDocument();
  expect(screen.getByRole('button')).toBeEnabled();
});

it('keeps only one polling loop after StrictMode replays an effect', async () => {
  vi.useFakeTimers();
  mockApi();
  const view = render(<StrictMode><UpdateStatus /></StrictMode>);
  await act(async () => {});
  const initial = vi.mocked(window.readerApi.getUpdateState).mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(window.readerApi.getUpdateState).toHaveBeenCalledTimes(initial + 1);
  view.unmount();
  await vi.advanceTimersByTimeAsync(5000);
  expect(window.readerApi.getUpdateState).toHaveBeenCalledTimes(initial + 1);
});
