import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { Dashboard } from './components/Dashboard';
import { Wizard } from './components/Wizard';
import { TitleBar } from './components/TitleBar';

type View = 'loading' | 'wizard' | 'dashboard';

export function App(): JSX.Element {
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    void api.credsStatus().then((status) => {
      setView(status.hasDiscord && status.hasSpotify ? 'dashboard' : 'wizard');
    });
  }, []);

  if (view === 'loading') {
    return (
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="grid min-h-0 flex-1 place-items-center text-muted">Loading…</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="app-no-drag min-h-0 flex-1">
        {view === 'wizard' ? <Wizard onDone={() => setView('dashboard')} /> : <Dashboard />}
      </main>
    </div>
  );
}
