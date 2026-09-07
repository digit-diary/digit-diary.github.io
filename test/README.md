# Test automatici — Diario Collaboratori

Test che girano **senza browser e senza database**, per verificare la parte
critica del programma prima di pubblicare una modifica.

## Come si lanciano

Dalla cartella del progetto:

```
npm test
```

oppure direttamente:

```
node test/piano-regole.test.js
```

Esce con codice **0** se tutto passa, **1** se qualcosa fallisce (utile in
eventuali automazioni). L'output elenca ogni controllo con `OK` o `FAIL`.

## Cosa verificano

`test/piano-regole.test.js` controlla il **motore delle regole del piano**
(`js/piano-regole.js`): riposo minimo tra i turni, giorni consecutivi (anche a
cavallo tra un mese e l'altro), idoneità/formazione alla posizione e
accompagnamento. Sono le regole applicate a ogni cambio, scambio, copertura
malattia e inserimento manuale.

## Quando eseguirli

**Dopo ogni modifica alle regole** e prima di mettere online una nuova versione.
Se un test diventa `FAIL`, la modifica ha cambiato un comportamento: va corretta
oppure, se il cambiamento è voluto, va aggiornato il test corrispondente.

## Come aggiungere un test

Il file è JavaScript semplice. Si importa il motore e si usano gli helper
`ok(condizione, "nome")` e `eq(ottenuto, atteso, "nome")`. Esempio:

```js
const R = require('../js/piano-regole.js');
eq(R.oraNum('08:30'), 8.5, 'oraNum 08:30');
```

Il motore è composto da funzioni **pure**: ricevono i dati come parametri e
ritornano un risultato, senza dipendere dallo stato dell'app. Per questo si
possono provare in isolamento con dati finti.
