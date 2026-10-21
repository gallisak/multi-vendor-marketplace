import { useAuth } from '@/entities/viewer';
import { SectionNav } from '@/widgets/section-nav';

const BUYER_LINKS = [
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/disputes', label: 'Disputes' },
  { to: '/account/notifications', label: 'Notifications' },
];

const CUSTOMER_LINKS = [...BUYER_LINKS, { to: '/account/become-seller', label: 'Become a seller' }];

const ADMIN_LINKS = [{ to: '/account/notifications', label: 'Notifications' }];

export function AccountLayout() {
  const { user } = useAuth();
  const links =
    user?.role === 'ADMIN' ? ADMIN_LINKS : user?.role === 'CUSTOMER' ? CUSTOMER_LINKS : BUYER_LINKS;
  return <SectionNav links={links} />;
}
