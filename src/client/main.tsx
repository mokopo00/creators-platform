import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/index.css';
import { Layout } from './ui/Layout';
import { PageSkeleton } from './ui/Skeleton';
import { ToastProvider } from './ui/Toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <BrowserRouter>
          <Layout nav={[{ to: '/', label: 'ホーム', icon: '⌂' }]}>
            <PageSkeleton variant="feed" />
          </Layout>
        </BrowserRouter>
      </ToastProvider>
    </MotionConfig>
  </StrictMode>,
);
