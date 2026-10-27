import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

export type NavItem = { to: string; label: string; icon: IconName; badge?: number; tab?: boolean };

const LEGAL_LINKS = [
  { to: '/legal/terms', label: '利用規約' },
  { to: '/legal/privacy', label: 'プライバシーポリシー' },
  { to: '/legal/tokushoho', label: '特定商取引法に基づく表記' },
  { to: '/report', label: '通報・削除申立' },
];

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function Layout({
  nav,
  children,
  header,
}: {
  nav: NavItem[];
  children: ReactNode;
  header?: ReactNode;
}) {
  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2"
      >
        本文へ移動
      </a>
      <aside
        data-testid="sidebar"
        aria-label="サイドバー"
        className="glass sticky top-4 m-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col p-3 md:flex"
      >
        <Link
          to="/"
          className="mb-5 flex h-10 items-center gap-2.5 px-3 text-base font-bold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
            <Icon name="sparkles" size="sm" />
          </span>
          [PROJECT_NAME]
        </Link>
        <nav aria-label="メイン" className="flex flex-col gap-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-white/70 hover:text-ink'}`
              }
            >
              <Icon name={n.icon} />
              {n.label}
              <Badge n={n.badge} />
            </NavLink>
          ))}
        </nav>
        <footer className="mt-auto flex flex-col gap-1.5 border-t border-white/80 px-3 pb-1 pt-4 text-xs text-ink-soft">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-ink hover:underline">
              {l.label}
            </Link>
          ))}
        </footer>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <nav
          aria-label="その他のメニュー"
          className="flex gap-2 overflow-x-auto px-4 pt-3 md:hidden"
        >
          {nav
            .filter((n) => !n.tab)
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `glass flex h-8 shrink-0 items-center gap-1.5 !rounded-full px-3 text-xs font-medium ${isActive ? 'text-accent' : 'text-ink-soft'}`
                }
              >
                <Icon name={n.icon} size="sm" />
                {n.label}
              </NavLink>
            ))}
        </nav>
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6"
        >
          {children}
          <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft md:hidden">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </footer>
        </main>
      </div>

      <nav
        data-testid="tabbar"
        aria-label="タブバー"
        className="glass glass-strong fixed inset-x-3 bottom-3 z-40 flex h-16 items-stretch justify-around !rounded-2xl px-1 md:hidden"
      >
        {nav
          .filter((n) => n.tab)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `relative flex min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium ${isActive ? 'text-accent' : 'text-ink-soft'}`
              }
            >
              <Icon name={n.icon} size="lg" />
              {n.label}
              {n.badge ? (
                <span
                  className="absolute right-[calc(50%-18px)] top-2 size-2 rounded-full bg-accent ring-2 ring-white"
                  aria-label={`未読 ${n.badge}件`}
                />
              ) : null}
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
