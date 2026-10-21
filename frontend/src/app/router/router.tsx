import { createBrowserRouter } from 'react-router';
import { CartPage } from '@/pages/cart';
import { CatalogPage } from '@/pages/catalog';
import { LoginPage } from '@/pages/login';
import { OAuthCallbackPage } from '@/pages/oauth-callback';
import { ProductPage } from '@/pages/product';
import { RegisterPage } from '@/pages/register';
import { EmptyState } from '@/shared/ui/states';
import { AppLayout } from '../layouts/AppLayout';
import { RequireAuth } from './RequireAuth';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'products/:id', element: <ProductPage /> },
      {
        path: 'cart',
        element: (
          <RequireAuth>
            <CartPage />
          </RequireAuth>
        ),
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'auth/callback', element: <OAuthCallbackPage /> },
      { path: '*', element: <EmptyState title="Page not found" /> },
    ],
  },
]);
