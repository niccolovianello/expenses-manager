# Spese

Analisi delle spese personali a partire dall'export xlsx dell'app di budgeting (fogli `Spese`, `Entrate`, `Bonifici`).
Sito statico su GitHub Pages; i dati stanno su Firebase, cifrati nel browser con un codice segreto. Vedi [DEPLOY.md](DEPLOY.md).

- **Panoramica**: uscite, entrate, saldo e spesa media per qualsiasi periodo, con confronto sul periodo precedente; andamento per categoria, entrate contro uscite, classifica delle categorie con dettaglio per tag, spese più alte. Clic su una barra per zoomare su quell'intervallo.
- **Movimenti**: ricerca, filtri, ordinamento e ricategorizzazione dal menu di ogni riga. Con **Nuovo movimento** si inseriscono a mano uscite, entrate e giroconti, poi modificabili o eliminabili; restano dopo ogni nuovo import, e quelli che compaiono anche nell'export (stesso tipo, data, importo e conti) vengono tolti per non contarli due volte.
- **Categorie e regole**: regole del tipo "commento contiene *Dropbox* → Abbonamenti" con anteprima sui dati reali; elenco delle correzioni manuali.

Precedenza: correzione manuale → prima regola attiva che corrisponde → categoria dell'export. I giroconti sono mostrati ma esclusi dai totali.

## Struttura

```
public/                    il sito pubblicato (nessun dato dentro)
  index.html               schermata del codice + scheletro dell'app
  css/                     token, base, layout, componenti, viste
  js/
    config.js              configurazione pubblica di Firebase
    vault/                 derivazione chiavi, cifratura, sessione Firebase, archivio cifrato
    data/                  repository dei dati e modifiche a regole/correzioni
    import/                lettore xlsx nel browser → movimenti normalizzati
    domain/                logica di categorizzazione
    state/                 store, azioni, selettori memoizzati
    lib/                   date, periodi, formati, aggregazioni
    charts/                Chart.js: tema da CSS, palette, grafico a barre
    components/            login, shell, barra del periodo, elementi comuni
    views/                 panoramica, movimenti, regole (un modulo per pannello)
server/                    server statico per lo sviluppo locale
scripts/                   calcolo della password Firebase dal codice
firestore.rules            regole di sicurezza
test/                      node --test
```

```bash
npm start
npm test
```
