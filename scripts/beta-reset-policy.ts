import path from 'node:path';

export function assertSafeBetaResetRoot(cwd: string, candidateRoot: string): void {
  const expectedRoot = path.resolve(cwd, '.data', 'beta');
  if (path.resolve(candidateRoot) !== expectedRoot) {
    throw new Error(`Refusing to reset an unexpected beta path: ${candidateRoot}`);
  }
}

export function betaBackupPath(cwd: string, now = new Date()): string {
  const timestamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return path.resolve(cwd, '.data', 'beta-backups', timestamp);
}
