export function handleSquirrelStartup(isSquirrelStartup: boolean, quit: () => void): boolean {
  if (!isSquirrelStartup) return false;

  quit();
  return true;
}
