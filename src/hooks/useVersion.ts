/**
 * Version management hook
 * Handles version checking and auto-update notifications
 */

import { useState, useEffect, useCallback } from 'react';
import versionInfo from '@/version.json';

const VERSION_STORAGE_KEY = 'pezkuwi_app_version';
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

interface VersionState {
  currentVersion: string;
  buildTime: string;
  buildNumber: number;
  hasUpdate: boolean;
  isChecking: boolean;
}

export function useVersion() {
  const [state, setState] = useState<VersionState>({
    currentVersion: versionInfo.version,
    buildTime: versionInfo.buildTime,
    buildNumber: versionInfo.buildNumber,
    hasUpdate: false,
    isChecking: false,
  });

  // Check if this is a new version (first load after update)
  useEffect(() => {
    const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);

    if (storedVersion !== versionInfo.version) {
      // New version detected - clear old cache
      if (storedVersion) {
        // Clear any cached data that might be stale
        clearStaleCache();
      }

      // Store new version
      localStorage.setItem(VERSION_STORAGE_KEY, versionInfo.version);
    }
  }, []);

  // Check for updates by fetching version.json from server
  const checkForUpdate = useCallback(async () => {
    setState((prev) => ({ ...prev, isChecking: true }));

    try {
      // Add cache-busting timestamp
      const response = await fetch(`/src/version.json?t=${Date.now()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        // Try alternative path (for production build)
        const altResponse = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!altResponse.ok) throw new Error('Version check failed');
        const serverVersion = await altResponse.json();
        handleVersionCheck(serverVersion);
        return;
      }

      const serverVersion = await response.json();
      handleVersionCheck(serverVersion);
    } catch (error) {
      // Silently fail - not critical
      if (import.meta.env.DEV) {
        console.warn('[Version] Check failed:', error);
      }
    } finally {
      setState((prev) => ({ ...prev, isChecking: false }));
    }
  }, []);

  const handleVersionCheck = (serverVersion: typeof versionInfo) => {
    if (serverVersion.buildNumber > versionInfo.buildNumber) {
      setState((prev) => ({ ...prev, hasUpdate: true }));
    }
  };

  // Periodic update check
  useEffect(() => {
    // Initial check after 30 seconds
    const initialTimeout = setTimeout(checkForUpdate, 30000);

    // Then check periodically
    const interval = setInterval(checkForUpdate, VERSION_CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [checkForUpdate]);

  // Force refresh to get new version
  const forceUpdate = useCallback(() => {
    // Clear all caches
    clearStaleCache();

    // Force reload without cache
    window.location.reload();
  }, []);

  // Dismiss update notification
  const dismissUpdate = useCallback(() => {
    setState((prev) => ({ ...prev, hasUpdate: false }));
  }, []);

  return {
    ...state,
    checkForUpdate,
    forceUpdate,
    dismissUpdate,
  };
}

// Clear stale cached data
function clearStaleCache() {
  try {
    // Clear React Query cache if available
    if ('caches' in window && window.caches) {
      window.caches.keys().then((names) => {
        names.forEach((name) => window.caches?.delete(name));
      });
    }

    // Clear specific app cache keys (not wallet data)
    const keysToPreserve = ['pezkuwi_wallet', 'pezkuwi_app_version'];
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !keysToPreserve.includes(key) && key.startsWith('pezkuwi_')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Clear sessionStorage
    window.sessionStorage.clear();
  } catch {
    // Silently fail - cache clear is not critical
  }
}

export default useVersion;
