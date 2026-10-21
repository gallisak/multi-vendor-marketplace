import { NavLink, Outlet } from 'react-router';
import { cn } from '@/shared/lib';

export function SectionNav({ links }: { links: { to: string; label: string; end?: boolean }[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Section">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-muted',
                isActive && 'bg-muted font-medium',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
