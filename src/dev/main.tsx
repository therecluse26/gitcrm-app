import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DevPage } from './DevPage.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DevPage />
  </StrictMode>,
);
