// Public configuration: these values are visible to anyone who opens the page, and that is fine.
// The data is protected by the Firestore rules (your account only) and by encryption with your code.
// Fill in the fields following DEPLOY.md.
export const appConfig = {
  firebase: {
    apiKey: 'AIzaSyBjMZmRdJuPZwrKQQyAKXpu2kOQXm3OdtA',
    authDomain: 'money-manager-79b34.firebaseapp.com',
    projectId: 'money-manager-79b34',
    appId: '1:891008287368:web:5813ac5d18612064f0d53d',
  },
  // Email of the single user created in Firebase Authentication (an identifier only, not a real mailbox).
  accountEmail: 'owner@spese.niccolovianello.invalid',
  // Minutes without interaction before the automatic lock (0 to disable it).
  idleLockMinutes: 15,
};
