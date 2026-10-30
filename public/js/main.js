import { appConfig } from './config.js';
import { isConfigured, unlock } from './vault/session.js';
import { startIdleLock } from './vault/idle-lock.js';
import { createRepository } from './data/repository.js';
import { createStore } from './state/store.js';
import { createInitialState } from './state/initial.js';
import { createActions } from './state/actions.js';
import { startRouter } from './router.js';
import { applyChartDefaults, onThemeChange } from './charts/theme.js';
import { mountLogin } from './components/login.js';
import { mountToast } from './components/toast.js';
import { mountShell } from './components/shell.js';
import { mountPeriodBar } from './components/period-bar.js';
import { mountOverview } from './views/overview/index.js';
import { mountTransactions } from './views/transactions/index.js';
import { mountRules } from './views/rules/index.js';

const byId = (id) => document.getElementById(id);

// Bloccare significa chiudere la sessione Firebase e ricaricare la pagina:
// chiave e dati decifrati esistono solo in memoria e vanno persi con essa.
function startApp(session) {
  const lock = async () => {
    await session.lock().catch(() => {});
    location.replace(location.pathname);
  };
  startIdleLock(appConfig.idleLockMinutes, lock);

  const store = createStore(createInitialState());
  const actions = createActions(store, createRepository(session.storage), { lock });

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

  startRouter(store);
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
