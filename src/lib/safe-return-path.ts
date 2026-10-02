const RETURN_PATH_BASE = 'https://swrtracker.invalid';

/** Keep post-auth navigation on this application. */
export function getSafeReturnPath(value: string | null, fallback = '/projects'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }

  try {
    const destination = new URL(value, RETURN_PATH_BASE);
    if (destination.origin !== RETURN_PATH_BASE) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
