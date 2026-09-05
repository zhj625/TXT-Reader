import { handleSquirrelStartup } from '../../src/main/squirrelStartup';

describe('Squirrel startup handling', () => {
  it('continues normal startup when no Squirrel event is present', () => {
    const quit = vi.fn();

    expect(handleSquirrelStartup(false, quit)).toBe(false);
    expect(quit).not.toHaveBeenCalled();
  });

  it('quits immediately after the shortcut lifecycle event is handled', () => {
    const quit = vi.fn();

    expect(handleSquirrelStartup(true, quit)).toBe(true);
    expect(quit).toHaveBeenCalledOnce();
  });
});
