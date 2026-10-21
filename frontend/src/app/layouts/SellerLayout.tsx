import { SectionNav } from '@/widgets/section-nav';

const LINKS = [
  { to: '/seller', label: 'Dashboard', end: true },
  { to: '/seller/products', label: 'Products' },
  { to: '/seller/orders', label: 'Orders' },
  { to: '/seller/disputes', label: 'Disputes' },
  { to: '/seller/payouts', label: 'Payouts' },
];

export function SellerLayout() {
  return <SectionNav links={LINKS} />;
}
