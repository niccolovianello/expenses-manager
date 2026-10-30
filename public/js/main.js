import { appConfig } from './config.js';
import { isConfigured, unlock } from './vault/session.js';
import { startIdleLock } from './vault/idle-lock.js';
import { createRepository } from './data/repository.js';
import { createStore } from './state/store.js';
import { createInitialState } from './state/initial.js';
import { createActions } from './state/actions.js';
import { startRouter, syncHash } from './router.js';
import { applyChartDefaults, onThemeChange } from './charts/theme.js';
import { mountLogin } from './components/login.js';
import { mountToast } from './components/toast.js';
import { mountShell } from './components/shell.js';
import { mountPeriodBar } from './components/period-bar.js';
import { mountOverview } from './views/overview/index.js';
import { mountTransactions } from './views/transactions/index.js';
import { mountRules } from './views/rules/index.js';

const byId = (id) => document.getElementById(id);

// Locking means signing out of Firebase and reloading the page:
// the key and decrypted data exist only in memory and are lost with it.
function startApp(session) {
  const lock = async () => {
    await session.lock().catch(() => {});
    location.replace(location.pathname);
  };
  startIdleLock(appConfig.idleLockMinutes, lock);

  // On the phone it opens on the current month: a quick glance, not a year-long analysis.
  const phone = window.matchMedia('(max-width: 860px)').matches;
  const store = createStore(createInitialState(phone ? { preset: 'month' } : {}));
  let pushNext = false;
  const actions = createActions(store, createRepository(session.storage), { lock, markHistory: () => { pushNext = true; } });

  applyChartDefaults(window.Chart);
  onThemeChange(() => {
    applyChartDefaults(window.Chart);
    actions.refreshTheme();
  });

  mountToast(byId('toast'));
  mountShell({
    root: byId('app'),
    nav: byId('nav'),
    railActions: byId('rail-actions'),
    periodBar: byId('period-bar'),
    sourceInfo: byId('source-info'),
    status: byId('app-status'),
    views: { overview: byId('view-overview'), transactions: byId('view-transactions'), rules: byId('view-rules') },
  }, store, actions);
  mountPeriodBar(byId('period-bar'), store, actions);
  mountOverview(byId('view-overview'), store, actions);
  mountTransactions(byId('view-transactions'), store, actions);
  mountRules(byId('view-rules'), store, actions);

  startRouter(store, actions.applyLocation);
  store.subscribe((state, changed) => {
    if (!['route', 'period', 'focusCategory'].some((key) => changed.has(key))) return;
    syncHash(state, { push: pushNext });
    pushNext = false;
  });
  actions.load();
}

mountLogin(byId('login'), {
  configured: isConfigured(appConfig),
  accountEmail: appConfig.accountEmail,
  async onSubmit(code) {
    const session = await unlock(code, appConfig);
    byId('login').hidden = true;
    byId('app').hidden = false;
    startApp(session);
  },
});
