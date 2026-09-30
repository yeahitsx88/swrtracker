const LOCAL_BASE = 'https://swrtracker.invalid';

/** Navigation after authentication must remain a path on this application. */
export function getSafeReturnPath(value: string | null, fallback = '/projects'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const destination = new URL(value, LOCAL_BASE);
    if (destination.origin !== LOCAL_BASE) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
