import { Bell, LogOut, Package, Scale, ShoppingCart, Store, User as UserIcon } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router';
import { useCart } from '@/entities/cart';
import { useNotifications } from '@/entities/notification';
import { useAuth } from '@/entities/viewer';
import { cn } from '@/shared/lib';
import { useConnectionStatus } from '@/shared/realtime';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConnectionDot } from '@/shared/ui/connection-dot';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted',
    isActive && 'bg-muted',
  );

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) {
    return (
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/login">Sign in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link to="/register">Create account</Link>
        </Button>
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Account menu">
          <UserIcon /> {user.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role !== 'ADMIN' && (
          <>
            <DropdownMenuItem onSelect={() => navigate('/account/orders')}>
              <Package /> My orders
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/account/disputes')}>
              <Scale /> Disputes
            </DropdownMenuItem>
          </>
        )}
        {user.role === 'CUSTOMER' && (
          <DropdownMenuItem onSelect={() => navigate('/account/become-seller')}>
            <Store /> Become a seller
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout().then(() => navigate('/'))}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CounterLink({
  to,
  label,
  count,
  icon,
}: {
  to: string;
  label: string;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to={to} aria-label={`${label}: ${count}`}>
        {icon}
        {count > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px]">{count}</Badge>}
      </Link>
    </Button>
  );
}

function ViewerLinks() {
  const { user } = useAuth();
  const cart = useCart(user !== null && user.role !== 'ADMIN');
  const notifications = useNotifications(user !== null);
  if (!user) return null;
  const unread = notifications.data?.filter((notification) => !notification.readAt).length ?? 0;
  return (
    <>
      <CounterLink
        to="/account/notifications"
        label="Notifications"
        count={unread}
        icon={<Bell />}
      />
      {user.role !== 'ADMIN' && (
        <CounterLink
          to="/cart"
          label="Cart items"
          count={cart.data?.itemsCount ?? 0}
          icon={<ShoppingCart />}
        />
      )}
    </>
  );
}

export function Header() {
  const { user } = useAuth();
  const status = useConnectionStatus();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Store className="size-5" /> Marketplace
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          <NavLink to="/" end className={navClass}>
            Catalog
          </NavLink>
          {user?.role === 'SELLER' && (
            <NavLink to="/seller" className={navClass}>
              Seller
            </NavLink>
          )}
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={navClass}>
              Admin
            </NavLink>
          )}
        </nav>
        <ConnectionDot status={status} />
        <ViewerLinks />
        <UserMenu />
      </div>
    </header>
  );
}
