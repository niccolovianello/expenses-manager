// Configurazione pubblica: questi valori sono visibili a chiunque apra la pagina e va bene così.
// I dati sono protetti dalle regole di Firestore (solo il tuo account) e dalla cifratura col tuo codice.
// Compila i campi seguendo DEPLOY.md.
export const appConfig = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  },
  // Email dell'unico utente creato in Firebase Authentication.
  accountEmail: '',
  // Minuti senza interazioni prima del blocco automatico (0 per disattivarlo).
  idleLockMinutes: 15,
};
