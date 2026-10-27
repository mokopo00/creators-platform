import { Route, Routes } from 'react-router-dom';
import { useMe } from './lib/auth';
import { FavoritesPage, FolderPage } from './pages/FavoritesPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MockCheckoutPage } from './pages/MockCheckoutPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostEditorPage } from './pages/PostEditorPage';
import { ProfilePage } from './pages/ProfilePage';
import { RankingPage } from './pages/RankingPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { RequestPage } from './pages/RequestPage';
import { RequestsPage } from './pages/RequestsPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { Layout, type NavItem } from './ui/Layout';

export function App() {
  const me = useMe();
  const user = me.data?.user;
  const nav: NavItem[] = [
    { to: '/', label: 'ホーム', icon: '⌂', tab: true },
    { to: '/search', label: '探す', icon: '⌕', tab: true },
    { to: '/ranking', label: 'ランキング', icon: '★' },
    { to: '/requests', label: '依頼', icon: '✉', tab: true },
    {
      to: '/notifications',
      label: '通知',
      icon: '◔',
      badge: me.data?.unreadNotifications,
      tab: true,
    },
    { to: '/favorites', label: 'お気に入り', icon: '♡' },
    user
      ? { to: `/u/${user.handle}`, label: 'マイページ', icon: '☺', tab: true }
      : { to: '/login', label: 'ログイン', icon: '→', tab: true },
    { to: '/settings', label: '設定', icon: '⚙' },
  ];

  return (
    <Layout nav={nav}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/u/:handle" element={<ProfilePage />} />
        <Route path="/u/:handle/request" element={<RequestPage />} />
        <Route path="/posts/new" element={<PostEditorPage />} />
        <Route path="/posts/:id" element={<PostDetailPage />} />
        <Route path="/posts/:id/edit" element={<PostEditorPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<RequestDetailPage />} />
        <Route path="/checkout/mock/:sessionId" element={<MockCheckoutPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/favorites/folders/:id" element={<FolderPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<p className="glass p-6 text-center">ページが見つかりません</p>} />
      </Routes>
    </Layout>
  );
}
