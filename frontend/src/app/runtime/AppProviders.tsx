import type { ReactNode } from 'react';
import { Toaster } from '@/shared/ui/sonner';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { AuthProvider } from './AuthProvider';
import { QueryProvider } from './QueryProvider';
import { RealtimeProvider } from './RealtimeProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <RealtimeProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </RealtimeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
