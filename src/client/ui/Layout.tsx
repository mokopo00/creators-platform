import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { pageTransition } from './motion';

export type NavItem = { to: string; label: string; icon: string; badge?: number; tab?: boolean };

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
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
  const location = useLocation();
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
        className="glass sticky top-4 m-4 hidden h-[calc(100vh-2rem)] w-56 shrink-0 flex-col gap-1 p-3 md:flex"
      >
        <Link to="/" className="mb-4 px-3 pt-2 text-lg font-bold tracking-tight">
          [PROJECT_NAME]
        </Link>
        <nav aria-label="メイン" className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-white/70 hover:text-ink'}`
              }
            >
              <span aria-hidden="true">{n.icon}</span>
              {n.label}
              <Badge n={n.badge} />
            </NavLink>
          ))}
        </nav>
        <footer className="mt-auto flex flex-col gap-1 px-3 pb-2 text-xs text-ink-soft">
          <Link to="/legal/terms" className="hover:underline">
            利用規約
          </Link>
          <Link to="/legal/privacy" className="hover:underline">
            プライバシーポリシー
          </Link>
          <Link to="/legal/tokushoho" className="hover:underline">
            特定商取引法に基づく表記
          </Link>
          <Link to="/report" className="hover:underline">
            通報・削除申立
          </Link>
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
                  `glass shrink-0 !rounded-full px-3 py-1 text-xs font-medium ${isActive ? 'text-accent' : 'text-ink-soft'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
        </nav>
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:pb-10 md:pt-6"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageTransition}
              initial="initial"
              animate="enter"
              exit="exit"
            >
              {children}
            </motion.div>
          </AnimatePresence>
          <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft md:hidden">
            <Link to="/legal/terms">利用規約</Link>
            <Link to="/legal/privacy">プライバシーポリシー</Link>
            <Link to="/legal/tokushoho">特定商取引法に基づく表記</Link>
            <Link to="/report">通報・削除申立</Link>
          </footer>
        </main>
      </div>

      <nav
        data-testid="tabbar"
        aria-label="タブバー"
        className="glass fixed inset-x-3 bottom-3 z-40 flex justify-around !rounded-2xl px-1 py-1.5 md:hidden"
      >
        {nav
          .filter((n) => n.tab)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `relative flex min-w-14 flex-col items-center rounded-xl px-2 py-1 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-ink-soft'}`
              }
            >
              <span aria-hidden="true" className="text-lg leading-6">
                {n.icon}
              </span>
              {n.label}
              {n.badge ? (
                <span
                  className="absolute right-1 top-0 size-2 rounded-full bg-accent"
                  aria-label={`未読 ${n.badge}件`}
                />
              ) : null}
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
