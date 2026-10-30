// Configurazione pubblica: questi valori sono visibili a chiunque apra la pagina e va bene così.
// I dati sono protetti dalle regole di Firestore (solo il tuo account) e dalla cifratura col tuo codice.
// Compila i campi seguendo DEPLOY.md.
export const appConfig = {
  firebase: {
    apiKey: 'AIzaSyBjMZmRdJuPZwrKQQyAKXpu2kOQXm3OdtA',
    authDomain: 'money-manager-79b34.firebaseapp.com',
    projectId: 'money-manager-79b34',
    appId: '1:891008287368:web:5813ac5d18612064f0d53d',
  },
  // Email dell'unico utente creato in Firebase Authentication (solo identificativo, non una casella reale).
  accountEmail: 'owner@spese.niccolovianello.invalid',
  // Minuti senza interazioni prima del blocco automatico (0 per disattivarlo).
  idleLockMinutes: 15,
};
