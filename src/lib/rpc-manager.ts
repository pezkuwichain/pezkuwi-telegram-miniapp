/**
 * RPC Connection Manager
 * Handles multiple RPC endpoints with automatic failover
 */

import { ApiPromise, WsProvider } from '@pezkuwi/api';
import { trackError, trackWarning } from './error-tracking';

// RPC Endpoints - ordered by priority
// Note: Domain must have SSL and WebSocket proxy configured
const RPC_ENDPOINTS = [
  {
    url: 'wss://rpc.pezkuwichain.io',
    name: 'Pezkuwichain RPC',
    priority: 1,
  },
];

// Asset Hub RPC for PEZ token
const ASSET_HUB_ENDPOINTS = [
  {
    url: 'wss://asset-hub-rpc.pezkuwichain.io',
    name: 'Asset Hub RPC',
    priority: 1,
  },
];

// People Chain RPC for identity/citizenship
const PEOPLE_ENDPOINTS = [
  {
    url: 'wss://people-rpc.pezkuwichain.io',
    name: 'People Chain RPC',
    priority: 1,
  },
];

interface RPCEndpoint {
  url: string;
  name: string;
  priority: number;
}

interface ConnectionState {
  api: ApiPromise | null;
  provider: WsProvider | null;
  endpoint: RPCEndpoint | null;
  isConnected: boolean;
  lastError: Error | null;
  reconnectAttempts: number;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
const CONNECTION_TIMEOUT_MS = 10000; // Reduced from 15s to 10s
const HEALTH_CHECK_INTERVAL_MS = 30000;

let state: ConnectionState = {
  api: null,
  provider: null,
  endpoint: null,
  isConnected: false,
  lastError: null,
  reconnectAttempts: 0,
};

// Asset Hub connection state (for PEZ token)
let assetHubState: ConnectionState = {
  api: null,
  provider: null,
  endpoint: null,
  isConnected: false,
  lastError: null,
  reconnectAttempts: 0,
};

// People Chain connection state (for identity/citizenship)
let peopleState: ConnectionState = {
  api: null,
  provider: null,
  endpoint: null,
  isConnected: false,
  lastError: null,
  reconnectAttempts: 0,
};

// Export last error for UI display
export function getLastError(): string | null {
  return state.lastError?.message || null;
}

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let assetHubHealthCheckInterval: ReturnType<typeof setInterval> | null = null;
let peopleHealthCheckInterval: ReturnType<typeof setInterval> | null = null;
let connectionListeners: Set<(isConnected: boolean, endpoint: RPCEndpoint | null) => void> =
  new Set();
let assetHubListeners: Set<(isConnected: boolean, endpoint: RPCEndpoint | null) => void> =
  new Set();
let peopleListeners: Set<(isConnected: boolean, endpoint: RPCEndpoint | null) => void> = new Set();

/**
 * Try to connect to a specific endpoint
 */
// PezkuwiChain custom signed extensions
const PEZKUWI_SIGNED_EXTENSIONS = {
  AuthorizeCall: {
    extrinsic: {},
    payload: {},
  },
  StorageWeightReclaim: {
    extrinsic: {},
    payload: {},
  },
};

async function connectToEndpoint(endpoint: RPCEndpoint): Promise<ApiPromise> {
  // Use simple WsProvider with auto-connect (more reliable)
  const provider = new WsProvider(endpoint.url);

  // Create API with timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Connection to ${endpoint.name} timed out`));
    }, CONNECTION_TIMEOUT_MS);
  });

  try {
    const api = await Promise.race([
      ApiPromise.create({
        provider,
        signedExtensions: PEZKUWI_SIGNED_EXTENSIONS,
      }),
      timeoutPromise,
    ]);

    await api.isReady;
    state.provider = provider;
    state.endpoint = endpoint;
    return api;
  } catch (error) {
    provider.disconnect();
    throw error;
  }
}

/**
 * Try to connect to available endpoints in order of priority
 */
async function connectWithFailover(): Promise<ApiPromise> {
  const sortedEndpoints = [...RPC_ENDPOINTS].sort((a, b) => a.priority - b.priority);

  for (const endpoint of sortedEndpoints) {
    try {
      trackWarning(`Attempting connection to ${endpoint.name}`, {
        action: 'rpc_connect_attempt',
        extra: { url: endpoint.url },
      });

      const api = await connectToEndpoint(endpoint);

      trackWarning(`Connected to ${endpoint.name}`, {
        action: 'rpc_connected',
        extra: { url: endpoint.url },
      });

      return api;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      trackWarning(`Failed to connect to ${endpoint.name}: ${err.message}`, {
        action: 'rpc_connect_failed',
        extra: { url: endpoint.url },
      });
      continue;
    }
  }

  throw new Error('All RPC endpoints unavailable');
}

/**
 * Initialize RPC connection
 */
export async function initRPCConnection(): Promise<ApiPromise> {
  if (state.api && state.isConnected) {
    return state.api;
  }

  try {
    const api = await connectWithFailover();
    state.api = api;
    state.isConnected = true;
    state.reconnectAttempts = 0;
    state.lastError = null;

    // Set up disconnect handler
    api.on('disconnected', handleDisconnect);
    api.on('error', handleError);

    // Start health checks
    startHealthCheck();

    // Notify listeners
    notifyListeners();

    return api;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    state.lastError = err;
    state.isConnected = false;
    trackError(err, { action: 'rpc_init_failed' });
    notifyListeners();
    throw err;
  }
}

/**
 * Handle disconnect event
 */
async function handleDisconnect(): Promise<void> {
  state.isConnected = false;
  notifyListeners();

  trackWarning('RPC disconnected, attempting reconnect', { action: 'rpc_disconnected' });

  // Attempt reconnection
  await attemptReconnect();
}

/**
 * Handle error event
 */
function handleError(error: Error): void {
  trackError(error, { action: 'rpc_error' });
}

/**
 * Attempt to reconnect with exponential backoff
 */
async function attemptReconnect(): Promise<void> {
  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    trackError(new Error('Max reconnect attempts reached'), { action: 'rpc_max_reconnects' });
    return;
  }

  state.reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * Math.pow(2, state.reconnectAttempts - 1);

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    await initRPCConnection();
  } catch {
    // Will retry on next disconnect or health check
  }
}

/**
 * Start periodic health checks
 */
function startHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    if (!state.api || !state.isConnected) return;

    try {
      // Simple health check - get chain name
      await state.api.rpc.system.chain();
    } catch {
      trackWarning('Health check failed', { action: 'rpc_health_failed' });
      handleDisconnect();
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop health checks
 */
function stopHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

/**
 * Get current API instance
 */
export function getAPI(): ApiPromise | null {
  return state.api;
}

/**
 * Get current connection state
 */
export function getConnectionState(): {
  isConnected: boolean;
  endpoint: RPCEndpoint | null;
  lastError: Error | null;
} {
  return {
    isConnected: state.isConnected,
    endpoint: state.endpoint,
    lastError: state.lastError,
  };
}

/**
 * Subscribe to connection state changes
 * Immediately calls callback with current state, then on every change
 */
export function subscribeToConnection(
  callback: (isConnected: boolean, endpoint: RPCEndpoint | null) => void
): () => void {
  connectionListeners.add(callback);

  // Immediately call with current state to avoid race condition
  callback(state.isConnected, state.endpoint);

  return () => {
    connectionListeners.delete(callback);
  };
}

/**
 * Notify all listeners of state change
 */
function notifyListeners(): void {
  connectionListeners.forEach((callback) => {
    callback(state.isConnected, state.endpoint);
  });
}

/**
 * Disconnect from RPC
 */
export async function disconnectRPC(): Promise<void> {
  stopHealthCheck();

  if (state.api) {
    await state.api.disconnect();
  }

  if (state.provider) {
    state.provider.disconnect();
  }

  state = {
    api: null,
    provider: null,
    endpoint: null,
    isConnected: false,
    lastError: null,
    reconnectAttempts: 0,
  };

  notifyListeners();
}

/**
 * Get list of available endpoints
 */
export function getAvailableEndpoints(): RPCEndpoint[] {
  return [...RPC_ENDPOINTS];
}

// ============================================
// ASSET HUB CONNECTION (for PEZ token)
// ============================================

/**
 * Connect to Asset Hub endpoint
 */
async function connectToAssetHubEndpoint(endpoint: RPCEndpoint): Promise<ApiPromise> {
  const provider = new WsProvider(endpoint.url);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Connection to ${endpoint.name} timed out`));
    }, CONNECTION_TIMEOUT_MS);
  });

  try {
    const api = await Promise.race([
      ApiPromise.create({
        provider,
        signedExtensions: PEZKUWI_SIGNED_EXTENSIONS,
      }),
      timeoutPromise,
    ]);

    await api.isReady;
    assetHubState.provider = provider;
    assetHubState.endpoint = endpoint;
    return api;
  } catch (error) {
    provider.disconnect();
    throw error;
  }
}

/**
 * Connect to Asset Hub with failover
 */
async function connectAssetHubWithFailover(): Promise<ApiPromise> {
  const sortedEndpoints = [...ASSET_HUB_ENDPOINTS].sort((a, b) => a.priority - b.priority);

  for (const endpoint of sortedEndpoints) {
    try {
      trackWarning(`Attempting Asset Hub connection to ${endpoint.name}`, {
        action: 'asset_hub_connect_attempt',
        extra: { url: endpoint.url },
      });

      const api = await connectToAssetHubEndpoint(endpoint);

      trackWarning(`Connected to Asset Hub ${endpoint.name}`, {
        action: 'asset_hub_connected',
        extra: { url: endpoint.url },
      });

      return api;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      trackWarning(`Failed to connect to Asset Hub ${endpoint.name}: ${err.message}`, {
        action: 'asset_hub_connect_failed',
        extra: { url: endpoint.url },
      });
      continue;
    }
  }

  throw new Error('All Asset Hub RPC endpoints unavailable');
}

/**
 * Initialize Asset Hub RPC connection
 */
export async function initAssetHubConnection(): Promise<ApiPromise> {
  if (assetHubState.api && assetHubState.isConnected) {
    return assetHubState.api;
  }

  try {
    const api = await connectAssetHubWithFailover();
    assetHubState.api = api;
    assetHubState.isConnected = true;
    assetHubState.reconnectAttempts = 0;
    assetHubState.lastError = null;

    // Set up disconnect handler
    api.on('disconnected', handleAssetHubDisconnect);
    api.on('error', handleAssetHubError);

    // Start health checks
    startAssetHubHealthCheck();

    // Notify listeners
    notifyAssetHubListeners();

    return api;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    assetHubState.lastError = err;
    assetHubState.isConnected = false;
    trackError(err, { action: 'asset_hub_init_failed' });
    notifyAssetHubListeners();
    throw err;
  }
}

/**
 * Handle Asset Hub disconnect
 */
async function handleAssetHubDisconnect(): Promise<void> {
  assetHubState.isConnected = false;
  notifyAssetHubListeners();

  trackWarning('Asset Hub RPC disconnected, attempting reconnect', {
    action: 'asset_hub_disconnected',
  });

  await attemptAssetHubReconnect();
}

/**
 * Handle Asset Hub error
 */
function handleAssetHubError(error: Error): void {
  trackError(error, { action: 'asset_hub_error' });
}

/**
 * Attempt Asset Hub reconnection
 */
async function attemptAssetHubReconnect(): Promise<void> {
  if (assetHubState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    trackError(new Error('Asset Hub max reconnect attempts reached'), {
      action: 'asset_hub_max_reconnects',
    });
    return;
  }

  assetHubState.reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * Math.pow(2, assetHubState.reconnectAttempts - 1);

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    await initAssetHubConnection();
  } catch {
    // Will retry on next disconnect or health check
  }
}

/**
 * Start Asset Hub health checks
 */
function startAssetHubHealthCheck(): void {
  if (assetHubHealthCheckInterval) {
    clearInterval(assetHubHealthCheckInterval);
  }

  assetHubHealthCheckInterval = setInterval(async () => {
    if (!assetHubState.api || !assetHubState.isConnected) return;

    try {
      await assetHubState.api.rpc.system.chain();
    } catch {
      trackWarning('Asset Hub health check failed', { action: 'asset_hub_health_failed' });
      handleAssetHubDisconnect();
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Notify Asset Hub listeners
 */
function notifyAssetHubListeners(): void {
  assetHubListeners.forEach((callback) => {
    callback(assetHubState.isConnected, assetHubState.endpoint);
  });
}

/**
 * Get Asset Hub API instance
 */
export function getAssetHubAPI(): ApiPromise | null {
  return assetHubState.api;
}

/**
 * Subscribe to Asset Hub connection state
 */
export function subscribeToAssetHubConnection(
  callback: (isConnected: boolean, endpoint: RPCEndpoint | null) => void
): () => void {
  assetHubListeners.add(callback);
  callback(assetHubState.isConnected, assetHubState.endpoint);

  return () => {
    assetHubListeners.delete(callback);
  };
}

/**
 * Disconnect from Asset Hub
 */
export async function disconnectAssetHub(): Promise<void> {
  if (assetHubHealthCheckInterval) {
    clearInterval(assetHubHealthCheckInterval);
    assetHubHealthCheckInterval = null;
  }

  if (assetHubState.api) {
    await assetHubState.api.disconnect();
  }

  if (assetHubState.provider) {
    assetHubState.provider.disconnect();
  }

  assetHubState = {
    api: null,
    provider: null,
    endpoint: null,
    isConnected: false,
    lastError: null,
    reconnectAttempts: 0,
  };

  notifyAssetHubListeners();
}

// ============================================
// PEOPLE CHAIN CONNECTION (for identity/citizenship)
// ============================================

/**
 * Connect to People Chain endpoint
 */
async function connectToPeopleEndpoint(endpoint: RPCEndpoint): Promise<ApiPromise> {
  const provider = new WsProvider(endpoint.url);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Connection to ${endpoint.name} timed out`));
    }, CONNECTION_TIMEOUT_MS);
  });

  try {
    const api = await Promise.race([
      ApiPromise.create({
        provider,
        signedExtensions: PEZKUWI_SIGNED_EXTENSIONS,
      }),
      timeoutPromise,
    ]);

    await api.isReady;
    peopleState.provider = provider;
    peopleState.endpoint = endpoint;
    return api;
  } catch (error) {
    provider.disconnect();
    throw error;
  }
}

/**
 * Connect to People Chain with failover
 */
async function connectPeopleWithFailover(): Promise<ApiPromise> {
  const sortedEndpoints = [...PEOPLE_ENDPOINTS].sort((a, b) => a.priority - b.priority);

  for (const endpoint of sortedEndpoints) {
    try {
      trackWarning(`Attempting People Chain connection to ${endpoint.name}`, {
        action: 'people_connect_attempt',
        extra: { url: endpoint.url },
      });

      const api = await connectToPeopleEndpoint(endpoint);

      trackWarning(`Connected to People Chain ${endpoint.name}`, {
        action: 'people_connected',
        extra: { url: endpoint.url },
      });

      return api;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      trackWarning(`Failed to connect to People Chain ${endpoint.name}: ${err.message}`, {
        action: 'people_connect_failed',
        extra: { url: endpoint.url },
      });
      continue;
    }
  }

  throw new Error('All People Chain RPC endpoints unavailable');
}

/**
 * Initialize People Chain RPC connection
 */
export async function initPeopleConnection(): Promise<ApiPromise> {
  if (peopleState.api && peopleState.isConnected) {
    return peopleState.api;
  }

  try {
    const api = await connectPeopleWithFailover();
    peopleState.api = api;
    peopleState.isConnected = true;
    peopleState.reconnectAttempts = 0;
    peopleState.lastError = null;

    // Set up disconnect handler
    api.on('disconnected', handlePeopleDisconnect);
    api.on('error', handlePeopleError);

    // Start health checks
    startPeopleHealthCheck();

    // Notify listeners
    notifyPeopleListeners();

    return api;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    peopleState.lastError = err;
    peopleState.isConnected = false;
    trackError(err, { action: 'people_init_failed' });
    notifyPeopleListeners();
    throw err;
  }
}

/**
 * Handle People Chain disconnect
 */
async function handlePeopleDisconnect(): Promise<void> {
  peopleState.isConnected = false;
  notifyPeopleListeners();

  trackWarning('People Chain RPC disconnected, attempting reconnect', {
    action: 'people_disconnected',
  });

  await attemptPeopleReconnect();
}

/**
 * Handle People Chain error
 */
function handlePeopleError(error: Error): void {
  trackError(error, { action: 'people_error' });
}

/**
 * Attempt People Chain reconnection
 */
async function attemptPeopleReconnect(): Promise<void> {
  if (peopleState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    trackError(new Error('People Chain max reconnect attempts reached'), {
      action: 'people_max_reconnects',
    });
    return;
  }

  peopleState.reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * Math.pow(2, peopleState.reconnectAttempts - 1);

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    await initPeopleConnection();
  } catch {
    // Will retry on next disconnect or health check
  }
}

/**
 * Start People Chain health checks
 */
function startPeopleHealthCheck(): void {
  if (peopleHealthCheckInterval) {
    clearInterval(peopleHealthCheckInterval);
  }

  peopleHealthCheckInterval = setInterval(async () => {
    if (!peopleState.api || !peopleState.isConnected) return;

    try {
      await peopleState.api.rpc.system.chain();
    } catch {
      trackWarning('People Chain health check failed', { action: 'people_health_failed' });
      handlePeopleDisconnect();
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Notify People Chain listeners
 */
function notifyPeopleListeners(): void {
  peopleListeners.forEach((callback) => {
    callback(peopleState.isConnected, peopleState.endpoint);
  });
}

/**
 * Get People Chain API instance
 */
export function getPeopleAPI(): ApiPromise | null {
  return peopleState.api;
}

/**
 * Subscribe to People Chain connection state
 */
export function subscribeToPeopleConnection(
  callback: (isConnected: boolean, endpoint: RPCEndpoint | null) => void
): () => void {
  peopleListeners.add(callback);
  callback(peopleState.isConnected, peopleState.endpoint);

  return () => {
    peopleListeners.delete(callback);
  };
}

/**
 * Disconnect from People Chain
 */
export async function disconnectPeople(): Promise<void> {
  if (peopleHealthCheckInterval) {
    clearInterval(peopleHealthCheckInterval);
    peopleHealthCheckInterval = null;
  }

  if (peopleState.api) {
    await peopleState.api.disconnect();
  }

  if (peopleState.provider) {
    peopleState.provider.disconnect();
  }

  peopleState = {
    api: null,
    provider: null,
    endpoint: null,
    isConnected: false,
    lastError: null,
    reconnectAttempts: 0,
  };

  notifyPeopleListeners();
}
