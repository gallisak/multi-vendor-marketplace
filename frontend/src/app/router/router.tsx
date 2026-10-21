import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { DisputesPage } from '@/pages/account/disputes';
import { AnalyticsPage } from '@/pages/admin/analytics';
import { ApplicationsPage } from '@/pages/admin/applications';
import { CategoriesPage } from '@/pages/admin/categories';
import { AdminDisputesPage } from '@/pages/admin/disputes';
import { AdminPayoutsPage } from '@/pages/admin/payouts';
import { ModerationPage } from '@/pages/admin/products';
import { OrderPage } from '@/pages/account/order';
import { OrdersPage } from '@/pages/account/orders';
import { BecomeSellerPage } from '@/pages/account/become-seller';
import { CartPage } from '@/pages/cart';
import { CatalogPage } from '@/pages/catalog';
import { LoginPage } from '@/pages/login';
import { NotificationsPage } from '@/pages/account/notifications';
import { OAuthCallbackPage } from '@/pages/oauth-callback';
import { ProductPage } from '@/pages/product';
import { RegisterPage } from '@/pages/register';
import { SellerDashboardPage } from '@/pages/seller/dashboard';
import { SellerDisputesPage } from '@/pages/seller/disputes';
import { SellerOrderPage } from '@/pages/seller/order';
import { SellerOrdersPage } from '@/pages/seller/orders';
import { SellerPayoutsPage } from '@/pages/seller/payouts';
import { EditProductPage, NewProductPage } from '@/pages/seller/product-form';
import { SellerProductsPage } from '@/pages/seller/products';
import type { Role } from '@/shared/api';
import { EmptyState } from '@/shared/ui/states';
import { AccountLayout } from '../layouts/AccountLayout';
import { AdminLayout } from '../layouts/AdminLayout';
import { AppLayout } from '../layouts/AppLayout';
import { SellerLayout } from '../layouts/SellerLayout';
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
      {
        path: 'seller',
        element: guard(<SellerLayout />, ['SELLER']),
        children: [
          { index: true, element: <SellerDashboardPage /> },
          { path: 'products', element: <SellerProductsPage /> },
          { path: 'products/new', element: <NewProductPage /> },
          { path: 'products/:id/edit', element: <EditProductPage /> },
          { path: 'orders', element: <SellerOrdersPage /> },
          { path: 'orders/:id', element: <SellerOrderPage /> },
          { path: 'disputes', element: <SellerDisputesPage /> },
          { path: 'payouts', element: <SellerPayoutsPage /> },
        ],
      },
      {
        path: 'admin',
        element: guard(<AdminLayout />, ['ADMIN']),
        children: [
          { index: true, element: <AnalyticsPage /> },
          { path: 'applications', element: <ApplicationsPage /> },
          { path: 'products', element: <ModerationPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'disputes', element: <AdminDisputesPage /> },
          { path: 'payouts', element: <AdminPayoutsPage /> },
        ],
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'auth/callback', element: <OAuthCallbackPage /> },
      { path: '*', element: <EmptyState title="Page not found" /> },
    ],
  },
]);
