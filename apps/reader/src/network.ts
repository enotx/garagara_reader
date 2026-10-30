import type { NetworkKind, NetworkStatus } from './settings.js';

interface NetworkInformationLike {
  type?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

interface NavigatorLike {
  onLine?: boolean;
  connection?: NetworkInformationLike;
}

function kindFor(type: string | undefined): NetworkKind {
  if (type === 'wifi' || type === 'ethernet') {
    return 'wifi';
  }
  if (type === 'cellular' || type === '2g' || type === '3g' || type === '4g' || type === '5g') {
    return 'cellular';
  }
  return 'unknown';
}

/**
 * Maps the browser Network Information API to the policy input from Spec §9.4.
 * Browsers that do not expose a connection type report `unknown`, which the
 * default Wi-Fi policy treats as not allowed.
 */
export function networkStatusFrom(input: {
  online?: boolean;
  connectionType?: string;
}): NetworkStatus {
  return {
    online: input.online ?? true,
    kind: kindFor(input.connectionType),
  };
}

/** Reads the current online state and connection type without throwing. */
export function readNetworkStatus(): NetworkStatus {
  if (typeof navigator === 'undefined') {
    return { online: true, kind: 'unknown' };
  }
  const scope = navigator as unknown as NavigatorLike;
  return networkStatusFrom({
    ...(scope.onLine === undefined ? {} : { online: scope.onLine }),
    ...(scope.connection?.type === undefined ? {} : { connectionType: scope.connection.type }),
  });
}

/** Subscribes to online/offline and connection-type changes. */
export function watchNetworkStatus(listener: (status: NetworkStatus) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const scope = navigator as unknown as NavigatorLike;
  const notify = (): void => listener(readNetworkStatus());
  const connection = scope.connection;
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  connection?.addEventListener?.('change', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
    connection?.removeEventListener?.('change', notify);
  };
}
