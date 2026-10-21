import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { refreshSession, session } from '@/shared/api';
import { RealtimeClient, RealtimeContext } from '@/shared/realtime';

export function RealtimeProvider({
  children,
  client: injected,
}: {
  children: ReactNode;
  client?: RealtimeClient;
}) {
  const queryClient = useQueryClient();
  const [client] = useState(
    () =>
      injected ??
      new RealtimeClient(undefined, async () => (await refreshSession())?.accessToken ?? null),
  );

  useEffect(() => {
    client.connect(session.token);
    const unsubscribe = session.subscribe((auth) => client.connect(auth?.accessToken ?? null));
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, [client]);

  useEffect(() => {
    let wasOnline = false;
    return client.onStatus((status) => {
      if (status === 'online' && wasOnline === false) {
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
        void queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
      }
      wasOnline = status === 'online';
    });
  }, [client, queryClient]);

  useEffect(
    () =>
      client.onUserEvent((event) => {
        if (event.kind === 'order') {
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
        } else {
          void queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
          void queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
        }
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }),
    [client, queryClient],
  );

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}
