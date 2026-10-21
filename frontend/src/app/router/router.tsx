import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { DisputesPage } from '@/pages/account-disputes';
import { OrderPage } from '@/pages/account-order';
import { OrdersPage } from '@/pages/account-orders';
import { BecomeSellerPage } from '@/pages/become-seller';
import { CartPage } from '@/pages/cart';
import { CatalogPage } from '@/pages/catalog';
import { LoginPage } from '@/pages/login';
import { NotificationsPage } from '@/pages/notifications';
import { OAuthCallbackPage } from '@/pages/oauth-callback';
import { ProductPage } from '@/pages/product';
import { RegisterPage } from '@/pages/register';
import type { Role } from '@/shared/api';
import { EmptyState } from '@/shared/ui/states';
import { AccountLayout } from '../layouts/AccountLayout';
import { AppLayout } from '../layouts/AppLayout';
import { RequireAuth } from './RequireAuth';

const BUYERS: Role[] = ['CUSTOMER', 'SELLER'];

const guard = (element: ReactNode, roles?: Role[]) => (
  <RequireAuth roles={roles}>{element}</RequireAuth>
);

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'products/:id', element: <ProductPage /> },
      { path: 'cart', element: guard(<CartPage />, BUYERS) },
      {
        path: 'account',
        element: guard(<AccountLayout />),
        children: [
          { index: true, element: <Navigate to="orders" replace /> },
          { path: 'orders', element: guard(<OrdersPage />, BUYERS) },
          { path: 'orders/:id', element: guard(<OrderPage />, BUYERS) },
          { path: 'disputes', element: guard(<DisputesPage />, BUYERS) },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'become-seller', element: guard(<BecomeSellerPage />, ['CUSTOMER', 'SELLER']) },
        ],
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'auth/callback', element: <OAuthCallbackPage /> },
      { path: '*', element: <EmptyState title="Page not found" /> },
    ],
  },
]);
