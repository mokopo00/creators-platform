import { Route, Routes } from 'react-router-dom';
import { useMe } from './lib/auth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MockCheckoutPage } from './pages/MockCheckoutPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostEditorPage } from './pages/PostEditorPage';
import { ProfilePage } from './pages/ProfilePage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { RequestPage } from './pages/RequestPage';
import { RequestsPage } from './pages/RequestsPage';
import { SettingsPage } from './pages/SettingsPage';
import { Layout, type NavItem } from './ui/Layout';

export function App() {
  const me = useMe();
  const user = me.data?.user;
  const nav: NavItem[] = [
    { to: '/', label: 'ホーム', icon: '⌂' },
    user
      ? { to: `/u/${user.handle}`, label: 'マイページ', icon: '☺' }
      : { to: '/login', label: 'ログイン', icon: '→' },
    { to: '/requests', label: '依頼', icon: '✉' },
    { to: '/settings', label: '設定', icon: '⚙' },
  ];

  return (
    <Layout nav={nav}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/u/:handle" element={<ProfilePage />} />
        <Route path="/posts/new" element={<PostEditorPage />} />
        <Route path="/posts/:id" element={<PostDetailPage />} />
        <Route path="/posts/:id/edit" element={<PostEditorPage />} />
        <Route path="/u/:handle/request" element={<RequestPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<RequestDetailPage />} />
        <Route path="/checkout/mock/:sessionId" element={<MockCheckoutPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<p className="glass p-6 text-center">ページが見つかりません</p>} />
      </Routes>
    </Layout>
  );
}
