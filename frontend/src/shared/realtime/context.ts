import { createContext, useContext, useEffect, useState } from 'react';
import type { RealtimeClient } from './client';
import type { ConnectionStatus } from './types';

export const RealtimeContext = createContext<RealtimeClient | null>(null);

export function useRealtime(): RealtimeClient {
  const client = useContext(RealtimeContext);
  if (!client) {
    throw new Error('useRealtime must be used inside RealtimeProvider');
  }
  return client;
}

export function useConnectionStatus(): ConnectionStatus {
  const client = useRealtime();
  const [status, setStatus] = useState<ConnectionStatus>(client.connectionStatus);
  useEffect(() => client.onStatus(setStatus), [client]);
  return status;
}
