import { AnimatePresence, motion } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Chatbot } from './components/Chatbot';
import { useMe } from './lib/auth';
import { CreatorToolsPage } from './pages/CreatorToolsPage';
import { FavoritesPage, FolderPage } from './pages/FavoritesPage';
import { HomePage } from './pages/HomePage';
import { PrivacyPage, TermsPage, TokushohoPage } from './pages/LegalPages';
import { LoginPage } from './pages/LoginPage';
import { MockCheckoutPage } from './pages/MockCheckoutPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostEditorPage } from './pages/PostEditorPage';
import { ProfilePage } from './pages/ProfilePage';
import { RankingPage } from './pages/RankingPage';
import { ReportPage } from './pages/ReportPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { RequestPage } from './pages/RequestPage';
import { RequestsPage } from './pages/RequestsPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { Layout, type NavItem } from './ui/Layout';
import { pageTransition } from './ui/motion';

export function App() {
  const me = useMe();
  const location = useLocation();
  const user = me.data?.user;
  const nav: NavItem[] = [
    { to: '/', label: 'ホーム', icon: 'home', tab: true },
    { to: '/search', label: '探す', icon: 'search', tab: true },
    { to: '/ranking', label: 'ランキング', icon: 'trophy' },
    { to: '/requests', label: '依頼', icon: 'inbox', tab: true },
    {
      to: '/notifications',
      label: '通知',
      icon: 'bell',
      badge: me.data?.unreadNotifications,
      tab: true,
    },
    { to: '/favorites', label: 'お気に入り', icon: 'heart' },
    user
      ? { to: `/u/${user.handle}`, label: 'マイページ', icon: 'user', tab: true }
      : { to: '/login', label: 'ログイン', icon: 'login', tab: true },
    { to: '/creator', label: 'クリエイター', icon: 'chart' },
    { to: '/settings', label: '設定', icon: 'settings' },
  ];

  return (
    <Layout nav={nav}>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          variants={pageTransition}
          initial="initial"
          animate="enter"
          exit="exit"
        >
          {/* A frozen location keeps the exiting page intact during its exit animation. */}
          <Routes location={location}>
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
            <Route path="/creator" element={<CreatorToolsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/legal/terms" element={<TermsPage />} />
            <Route path="/legal/privacy" element={<PrivacyPage />} />
            <Route path="/legal/tokushoho" element={<TokushohoPage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route
              path="*"
              element={<p className="glass p-6 text-center">ページが見つかりません</p>}
            />
          </Routes>
        </motion.div>
      </AnimatePresence>
      <Chatbot />
    </Layout>
  );
}
