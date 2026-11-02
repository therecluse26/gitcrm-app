// First: Zod's settings must be in place before any module parses (see zod-config.ts).
import './app/zod-config.ts';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { router } from './app/router.tsx';
import { applyTheme, storedTheme } from './app/theme.ts';
import './index.css';

// Refuse to run inside a frame (clickjacking): hosts without custom headers cannot send
// frame-ancestors (docs/07).
if (window.top !== window.self) {
  document.body.textContent = 'GitCRM does not run inside a frame. Open it in its own tab.';
} else {
  applyTheme(storedTheme()); // index.html starts dark (spec 12)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
