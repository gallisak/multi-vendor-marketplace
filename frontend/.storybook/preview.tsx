import type { Preview } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Toaster } from '../src/shared/ui/sonner';
import '../src/app/styles/index.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
  },
  decorators: [
    (Story, context) => {
      const queryClient =
        (context.parameters.queryClient as QueryClient | undefined) ??
        new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Story />
            <Toaster />
          </MemoryRouter>
        </QueryClientProvider>
      );
    },
  ],
};

export default preview;
