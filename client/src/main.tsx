import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexProvider } from 'convex/react';
import { App } from '@/app/App';
import { convex } from '@/lib/convex';
import '@/index.css';

/**
 * TanStack Query is gone. Convex queries are subscriptions with their own cache and
 * invalidation, so a second client-side cache layer would only be something to keep
 * in sync with it.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);
