import { RouterProvider } from 'react-router';
import { AppProviders } from './runtime/AppProviders';
import { router } from './router/router';
import './styles/index.css';

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
