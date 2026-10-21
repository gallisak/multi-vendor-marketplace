import { SectionNav } from '@/widgets/section-nav';

const LINKS = [
  { to: '/admin', label: 'Analytics', end: true },
  { to: '/admin/applications', label: 'Seller applications' },
  { to: '/admin/products', label: 'Product moderation' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/disputes', label: 'Disputes' },
  { to: '/admin/payouts', label: 'Payouts' },
];

export function AdminLayout() {
  return <SectionNav links={LINKS} />;
}
