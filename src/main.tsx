import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './ui/ui.css';
import './ui/skin.css';
import './styles/reactive.css';
import { App } from './app/App.tsx';
import { initChapterTracking } from './app/chapters.ts';
import { initLibraryPersistence, libraryStore } from './state/library.ts';
import { initHeartbeat } from './systems/heartbeat.ts';
import { initMotion } from './systems/motion.ts';
import { initPreviews } from './systems/previews.ts';
import { initReactive } from './systems/reactive.ts';
import { initSound, sound } from './systems/sound/engine.ts';

// Restore the persisted guest library before first paint so preferences apply immediately.
try {
  const raw = localStorage.getItem('ms.library.guest.v1');
  if (raw) {
    const { migrateLibrary } = await import('../shared/library.ts');
    libraryStore.set(migrateLibrary(JSON.parse(raw)));
  }
} catch {
  /* corrupt or blocked storage — start fresh */
}
const prefs = libraryStore.get().prefs;
sound.hydrate(prefs.sound);

initMotion();
initHeartbeat();
initPreviews();
initSound();
initLibraryPersistence();
initChapterTracking();
initReactive();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
