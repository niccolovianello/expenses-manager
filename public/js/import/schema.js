// Maps the budgeting app's export sheets onto transaction fields.
// To support another export, add a new schema here.
const MOVEMENT_COLUMNS = {
  date: 'Data e ora',
  category: 'Categoria',
  account: 'Conto',
  amount: 'Importo in valuta predefinita',
  currency: 'Valuta predefinita',
  tag: 'Tag',
  comment: 'Commento',
};

export const SHEET_SCHEMA = {
  Spese: { kind: 'expense', columns: MOVEMENT_COLUMNS },
  Entrate: { kind: 'income', columns: MOVEMENT_COLUMNS },
  Bonifici: {
    kind: 'transfer',
    columns: {
      date: 'Data e ora',
      account: 'In uscita',
      toAccount: 'In entrata',
      amount: 'Importo nella valuta in uscita',
      currency: 'Valuta in uscita',
      comment: 'Commento',
    },
  },
};

export const REQUIRED_COLUMNS = ['date', 'account', 'amount'];
