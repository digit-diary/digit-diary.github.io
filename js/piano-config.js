/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-config.js
 * PIANO · scheda Regole (per settore, guida, controlli), fabbisogni, turni, codici, festivi
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ================================================================
// REGOLE DEL PIANO · card admin: elenco ordinato, valori e stato
// modificabili. Etichetta onesta su DOVE ogni regola è applicata.
// ================================================================
// Fonte normativa di ogni regola: si legge accanto al valore, cosi' chi la
// modifica sa da dove viene (RAP, direttiva interna, legge sul lavoro)
const PIANO_REGOLE_FONTE = {
  jolly_indennita_vacanze_4sett: 'RAP Allegato 1: indennita vacanze 8.33% (4 settimane) sul salario orario',
  jolly_indennita_vacanze_5sett: 'RAP Allegato 1: indennita vacanze 10.65% (5 settimane) sul salario orario',
  jolly_indennita_tredicesima: 'RAP Allegato 1: tredicesima 8.33% sul salario orario',
  notte_inizio: 'RAP Allegato 1 (personale ausiliario) · fascia notturna di legge',
  notte_fine: 'RAP Allegato 1 (personale ausiliario) · fascia notturna di legge',
  notte_percentuale: 'RAP Allegato 1: 10% del tempo di lavoro notturno come tempo libero pagato',
  min_riposo_ore: 'LL art. 15a · direttiva 16-007',
  max_consecutivi: 'LL art. 21 · OLL1 art. 20',
  domeniche_libere_anno: 'OLL2 art. 24 cpv. 2 · direttiva 16-007',
  turno_prima_domenica_libera: 'LL art. 18: la domenica libera vale se il sabato si finisce entro le 23:00',
  nd_jolly_giorno: 'Direttiva 16-007 · formulario HR 1187',
  jolly_percentuale_piano: 'RAP All. 1 · personale ausiliario: bersaglio della generazione, non ore dovute',
  jolly_ore_min: 'RAP All. 1 · personale ausiliario',
  jolly_ore_max: 'RAP All. 1 · personale ausiliario',
  tolleranza_ore: 'RAP 3.1: 41 ore settimanali su media mensile',
  tolleranza_ore_sopra: 'RAP 3.1: max 45 ore in alta stagione',
  ore_settimana_max: 'Legge sul lavoro · indicazione del titolare: 45.1 ore lavorate lunedì-domenica',
  ore_settimana_con_notturno: 'Indicazione del titolare (30.09): il massimo comprende il 10% notturno',
  riposo_domenica_libera_ore: 'LL art. 18-20a, OLL 1 art. 21: 35 ore (11 + 24) comprese le 23 sab - 23 dom',
  riposo_domenica_lavorata_ore: 'OLL 2 art. 12 cpv. 2 (case da gioco): 36 + 11 = 47 ore consecutive',
};
// NOMI SEMPLICI, GRUPPO E TIPO DI OGNI REGOLA. La scheda Regole parla la
// lingua di chi la usa: niente HARD/SOFT/peso, ma "cosa fa", "dove agisce",
// "da dove viene". tipo: 'sino' (interruttore), 'numero', 'testo'.
const PIANO_REGOLE_GUIDA = {
  min_riposo_ore: {
    g: 'Riposo e giorni di lavoro',
    n: 'Ore minime di riposo fra due turni',
    t: 'numero',
    d: 'Valida regole, bozza, cambi turno, coperture',
  },
  max_consecutivi: {
    g: 'Riposo e giorni di lavoro',
    n: 'Giorni di lavoro consecutivi al massimo',
    t: 'numero',
    d: 'Valida regole, bozza, cambi turno, coperture',
  },
  no_4w1c1w: {
    g: 'Riposo e giorni di lavoro',
    n: 'Vietato: 4 giorni di lavoro, 1 di riposo, poi di nuovo lavoro',
    t: 'sino',
    d: 'Valida regole e bozza',
  },
  blocchi_compatti: {
    g: 'Riposo e giorni di lavoro',
    n: 'Preferisci blocchi di lavoro e riposo compatti',
    t: 'sino',
    d: 'Bozza (ordine dei candidati)',
  },
  pattern_lavoro: {
    g: 'Riposo e giorni di lavoro',
    n: 'Lunghezza ideale di un blocco di lavoro (giorni)',
    t: 'numero',
    d: 'Bozza (con "blocchi compatti")',
  },
  penalita_riposo_isolato: {
    g: 'Riposo e giorni di lavoro',
    n: 'Evita il riposo di un giorno solo fra due blocchi',
    t: 'sino',
    d: 'Bozza (ordine dei candidati)',
  },
  no_notte_riposo_presto: {
    g: 'Riposo e giorni di lavoro',
    n: 'Evita: notte, un riposo, poi turno del mattino',
    t: 'sino',
    d: 'Bozza (ordine dei candidati)',
  },
  equilibrio_notti: {
    g: 'Riposo e giorni di lavoro',
    n: 'Distribuisci le notti in modo equo',
    t: 'sino',
    d: 'Bozza (ordine dei candidati)',
  },
  equilibrio_diurni_notturni: {
    g: 'Riposo e giorni di lavoro',
    n: 'Equilibra diurni e notturni per ogni persona',
    t: 'sino',
    d: 'Bozza (ordine dei candidati)',
  },
  domeniche_libere_anno: {
    g: 'Domeniche',
    n: 'Domeniche libere garantite in un anno',
    t: 'numero',
    d: 'Valida regole, tabella Domeniche, Benessere, bozza',
  },
  turno_prima_domenica_libera: {
    g: 'Domeniche',
    n: 'La domenica libera vale solo se il sabato finisce entro le 23',
    t: 'sino',
    d: 'Valida regole, tabella Domeniche, Benessere',
  },
  tolleranza_ore: {
    g: 'Ore e saldo',
    n: 'Scarto accettato dalle ore dovute del mese (più o meno): vale solo se le due regole "sopra" e "sotto" sono vuote',
    t: 'numero',
    d: 'Valida regole, bozza, Migliora ore (se sopra e sotto sono vuote)',
  },
  tolleranza_ore_sopra: {
    g: 'Ore e saldo',
    n: 'Ore massime sopra le dovute del mese (se attiva vince sulla precedente)',
    t: 'numero',
    d: 'Valida regole, bozza, Migliora ore',
  },
  tolleranza_ore_sotto: {
    g: 'Ore e saldo',
    n: 'Ore massime sotto le dovute del mese (se attiva vince sulla precedente)',
    t: 'numero',
    d: 'Valida regole',
  },
  riposo_domenica_libera_ore: {
    g: 'Domeniche',
    n: 'Domenica libera: ore consecutive minime di riposo (comprese le 23 del sabato - 23 della domenica)',
    t: 'numero',
    d: 'Valida regole, avviso sulla cella, bozza, scheda Avvisi',
  },
  riposo_domenica_lavorata_ore: {
    g: 'Domeniche',
    n: 'Domenica lavorata: ore consecutive minime di riposo nella settimana prima oppure in quella dopo (lunedì-sabato)',
    t: 'numero',
    d: 'Valida regole, avviso sulla cella, scheda Avvisi',
  },
  ore_settimana_con_notturno: {
    g: 'Ore e saldo',
    n: 'Il massimo di ore della settimana comprende il 10% notturno (Si) o solo le ore da orologio (No)',
    t: 'sino',
    d: 'Valida regole, avviso sulla cella, bozza, scheda Avvisi',
  },
  ore_settimana_max: {
    g: 'Ore e saldo',
    n: 'Ore lavorate massime nella settimana lunedì-domenica (con o senza il 10% notturno: vedi la regola sotto)',
    t: 'numero',
    d: 'Valida regole, avviso sulla cella, bozza, scheda Avvisi',
  },
  saldo_ore_max: {
    g: 'Ore e saldo',
    n: 'Saldo ore dell anno: oltre questo valore e troppo alto',
    t: 'numero',
    d: 'Saldo ore anno (semaforo)',
  },
  saldo_ore_min: {
    g: 'Ore e saldo',
    n: 'Saldo ore dell anno: sotto questo valore e troppo basso',
    t: 'numero',
    d: 'Saldo ore anno (semaforo)',
  },
  jolly_percentuale_piano: {
    g: 'Ausiliari (jolly)',
    n: 'Percentuale massima degli ausiliari (0.8 = 80%): oltre, con la tolleranza, solo se serve; nessun minimo',
    t: 'numero',
    d: 'Bozza, Migliora, Valida',
  },
  jolly_ore_max: {
    g: 'Ausiliari (jolly)',
    n: 'Ore massime al mese per gli ausiliari senza percentuale',
    t: 'numero',
    d: 'Valida regole e bozza',
  },
  jolly_ore_min: {
    g: 'Ausiliari (jolly)',
    n: 'Ore minime al mese per gli ausiliari senza percentuale',
    t: 'numero',
    d: 'Valida regole (solo avviso)',
  },
  jolly_codici_gia_pagati: {
    g: 'Ausiliari (jolly)',
    n: 'Codici che per gli ausiliari valgono zero ore (indennita già pagata)',
    t: 'testo',
    d: 'Calendario, saldo, statistiche',
  },
  jolly_indennita_vacanze_4sett: {
    g: 'Ausiliari (jolly)',
    n: 'Indennita vacanze con 4 settimane (% sul salario orario)',
    t: 'numero',
    d: 'Statistiche anno',
  },
  jolly_indennita_vacanze_5sett: {
    g: 'Ausiliari (jolly)',
    n: 'Indennita vacanze con 5 settimane (% sul salario orario)',
    t: 'numero',
    d: 'Statistiche anno',
  },
  jolly_indennita_tredicesima: {
    g: 'Ausiliari (jolly)',
    n: 'Indennita tredicesima (% sul salario orario)',
    t: 'numero',
    d: 'Statistiche anno',
  },
  notte_inizio: {
    g: 'Ausiliari (jolly)',
    n: 'Inizio della fascia notturna (ora)',
    t: 'numero',
    d: 'Statistiche anno (colonna Ore notte)',
  },
  notte_fine: {
    g: 'Ausiliari (jolly)',
    n: 'Fine della fascia notturna (ora)',
    t: 'numero',
    d: 'Statistiche anno (colonna Ore notte)',
  },
  notte_percentuale: {
    g: 'Ausiliari (jolly)',
    n: 'Tempo libero pagato sulle ore notturne degli ausiliari (%)',
    t: 'numero',
    d: 'Statistiche anno',
  },
  nd_jolly_giorno: {
    g: 'Ausiliari (jolly)',
    n: 'Giorno del mese entro cui gli ausiliari consegnano le non disponibilità',
    t: 'numero',
    d: 'Formulario non disponibilità',
  },
  cgf_solo_parificati: {
    g: 'Festivi e recuperi (CGF)',
    n: 'Il recupero matura solo sui festivi parificati alla domenica (come nel foglio Excel)',
    t: 'sino',
    d: 'Bozza, Assegna CGF, Chi ha diritto, Statistiche, scheda Festivi',
  },
  cgf_max_mese: {
    g: 'Festivi e recuperi (CGF)',
    n: 'Recuperi automatici al massimo per persona in un mese',
    t: 'numero',
    d: 'Bozza e Assegna CGF',
  },
  cgf_distanza_giorni: {
    g: 'Festivi e recuperi (CGF)',
    n: 'Giorni minimi fra due recuperi della stessa persona',
    t: 'numero',
    d: 'Bozza e Assegna CGF',
  },
  cgf_non_con_vacanze: {
    g: 'Festivi e recuperi (CGF)',
    n: 'Mai un recupero il giorno prima o dopo una vacanza',
    t: 'sino',
    d: 'Bozza e Assegna CGF',
  },
  vacanze_giorni_primi2anni: {
    g: 'Vacanze',
    n: 'Giorni di vacanza nei primi due anni di contratto',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_giorni_base: {
    g: 'Vacanze',
    n: 'Giorni di vacanza dal compimento dei due anni',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_10anni: {
    g: 'Vacanze',
    n: 'Giorni in più nell anno dei 10 anni di servizio (una volta sola)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_15anni: {
    g: 'Vacanze',
    n: 'Giorni in più nell anno dei 15 anni di servizio (una volta sola)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_20anni: {
    g: 'Vacanze',
    n: 'Giorni in più nell anno dei 20 anni di servizio (una volta sola)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_25anni: {
    g: 'Vacanze',
    n: 'Giorni in più nell anno dei 25 anni di servizio (una volta sola)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_30anni: {
    g: 'Vacanze',
    n: 'Giorni in più nell anno dei 30 anni di servizio (una volta sola)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_arrotonda_da: {
    g: 'Vacanze',
    n: 'Da questa frazione in su i giorni si arrotondano al giorno pieno (0.35: 32.37 diventa 33)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_giorni_anno: {
    g: 'Vacanze',
    n: 'Giorni di vacanza per l indice di benessere, solo per chi non ha la data di assunzione (gli altri: il loro diritto)',
    t: 'numero',
    d: 'Benessere',
  },
  c_prima_dopo_vacanza: {
    g: 'Vacanze',
    n: 'Metti i congedi C attorno alle settimane di vacanza',
    t: 'sino',
    d: 'Applica vacanze e bozza',
  },
  c_prima_fissi: {
    g: 'Vacanze',
    n: 'Giorni di congedo C prima della vacanza (fissi)',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  c_prima_jolly: {
    g: 'Vacanze',
    n: 'Giorni di congedo C prima della vacanza (ausiliari)',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  c_dopo_jolly: {
    g: 'Vacanze',
    n: 'Giorni di congedo C dopo la vacanza (ausiliari)',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  c_dopo_100: {
    g: 'Vacanze',
    n: 'Giorni di congedo C dopo la vacanza (100%)',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  c_dopo_80: {
    g: 'Vacanze',
    n: 'Giorni di congedo C dopo la vacanza (80%)',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  c_dopo_60: {
    g: 'Vacanze',
    n: 'Giorni di congedo C dopo la vacanza (60%)',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  c_dopo_40: {
    g: 'Vacanze',
    n: 'Giorni di congedo C dopo la vacanza (40% o meno)',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  wd_prima_vacanza: {
    g: 'Vacanze',
    n: 'Giorni di lavoro diurno forzato (WD) prima dei congedi pre vacanza',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  wd_dopo_vacanza: {
    g: 'Vacanze',
    n: 'Giorni di lavoro (WD) dopo i congedi del rientro',
    t: 'numero',
    d: 'Applica vacanze e bozza',
  },
  diurno_prima_vacanza: {
    g: 'Vacanze',
    n: 'Turno diurno il giorno prima della vacanza',
    t: 'sino',
    d: 'Valida regole',
  },
  funzioni_fanno_tutto: {
    g: 'Funzioni e turni',
    n: 'Funzioni che a mano possono fare qualsiasi turno (il livello alto comprende quelli sotto, come in Formazione)',
    t: 'testo',
    d: 'Scrittura manuale, Valida regole, cambi turno e coperture (la bozza automatica segue le regole del settore)',
  },
  chiusura_ora_normale: {
    g: 'Orari di chiusura',
    n: 'Ora di chiusura nei giorni normali',
    t: 'numero',
    d: 'Calendario, ore dei turni prolungati, briefing',
  },
  chiusura_ora_tardi: {
    g: 'Orari di chiusura',
    n: 'Ora di chiusura il venerdì, il sabato e la notte prima di un festivo',
    t: 'numero',
    d: 'Calendario, ore dei turni prolungati, briefing',
  },
  chiusura_ora_fine_anno: {
    g: 'Orari di chiusura',
    n: 'Ora di chiusura del 31 dicembre',
    t: 'numero',
    d: 'Calendario, ore dei turni prolungati, briefing',
  },
  chiusura_giorni_tardi: {
    g: 'Orari di chiusura',
    n: 'Giorni della settimana che chiudono tardi (0 domenica, 5 venerdì, 6 sabato)',
    t: 'testo',
    d: 'Calendario, ore dei turni prolungati, briefing',
  },
  congedo_np_giorni_vacanze: {
    g: 'Congedi non pagati',
    n: 'Oltre questi giorni di congedo il diritto vacanze si riduce in proporzione (0 = ogni giorno lo riduce)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto), scheda Congedi',
  },
  congedo_np_mesi_anzianita: {
    g: 'Congedi non pagati',
    n: 'Oltre questi mesi di congedo l anzianità si sposta in avanti (0 = ogni giorno di congedo la sposta)',
    t: 'numero',
    d: 'Giubilei, scheda Vacanze, scheda Congedi',
  },
  blocco_giorni_chiusi: {
    g: 'Giorni chiusi',
    n: 'I giorni passati si modificano solo con uno sblocco motivato',
    t: 'sino',
    d: 'Tutto il piano',
  },
  blocco_ora_limite: {
    g: 'Giorni chiusi',
    n: 'Ora del giorno dopo oltre la quale il giorno prima e chiuso',
    t: 'numero',
    d: 'Tutto il piano',
  },
};
// LIMITI DI BUON SENSO per i valori numerici: un valore fuori scala (riposo
// di 3 ore, 40 giorni consecutivi, 300 domeniche) viene rifiutato con un
// avviso chiaro invece di finire nei calcoli. Chi crea l'eccezione per un
// settore riceve lo stesso controllo.
const PIANO_REGOLE_LIMITI = {
  min_riposo_ore: [8, 16],
  ore_settimana_max: [30, 60],
  riposo_domenica_libera_ore: [24, 72],
  riposo_domenica_lavorata_ore: [24, 96],
  max_consecutivi: [1, 7],
  pattern_lavoro: [1, 7],
  domeniche_libere_anno: [0, 52],
  tolleranza_ore: [0, 60],
  tolleranza_ore_sopra: [0, 60],
  tolleranza_ore_sotto: [0, 60],
  saldo_ore_max: [0, 200],
  saldo_ore_min: [-200, 0],
  jolly_percentuale_piano: [0.1, 1],
  c_dopo_jolly: [0, 7],
  wd_dopo_vacanza: [0, 7],
  jolly_ore_max: [1, 250],
  jolly_ore_min: [0, 250],
  jolly_indennita_vacanze_4sett: [0, 30],
  jolly_indennita_vacanze_5sett: [0, 30],
  jolly_indennita_tredicesima: [0, 30],
  notte_inizio: [0, 24],
  notte_fine: [0, 24],
  notte_percentuale: [0, 100],
  nd_jolly_giorno: [1, 28],
  cgf_max_mese: [1, 10],
  cgf_distanza_giorni: [0, 15],
  vacanze_giorni_primi2anni: [20, 40],
  vacanze_giorni_base: [20, 45],
  vacanze_bonus_10anni: [0, 10],
  vacanze_bonus_15anni: [0, 10],
  vacanze_bonus_20anni: [0, 10],
  vacanze_bonus_25anni: [0, 10],
  vacanze_bonus_30anni: [0, 10],
  vacanze_arrotonda_da: [0, 1],
  vacanze_giorni_anno: [10, 45],
  c_prima_fissi: [0, 5],
  c_prima_jolly: [0, 5],
  c_dopo_100: [0, 7],
  c_dopo_80: [0, 7],
  c_dopo_60: [0, 7],
  c_dopo_40: [0, 7],
  wd_prima_vacanza: [0, 7],
  chiusura_ora_normale: [0, 12],
  chiusura_ora_tardi: [0, 12],
  chiusura_ora_fine_anno: [0, 12],
  blocco_ora_limite: [0, 23],
  congedo_np_giorni_vacanze: [0, 365],
  congedo_np_mesi_anzianita: [0, 24],
};
// COSA ESISTE IN UN SETTORE: sigle dei turni, gruppi e funzioni presenti.
// Serve a dire "questa regola qui non ha senso" (L1 e 9 ai Tavoli non esistono).
function _pianoContestoSettore(settore) {
  const chiave = String(settore || '').toLowerCase();
  const tutti = !chiave;
  const turni = pianoTurniCache.filter((t) => t.attivo !== false && (tutti || (t.reparto_dip || 'slots') === chiave));
  const funzioni = new Set();
  collaboratoriCache
    .filter((c) => c.attivo !== false && (tutti || (c.reparto_dip || 'slots') === chiave))
    .forEach((c) => c.funzione && funzioni.add(String(c.funzione).toUpperCase()));
  const jolly = collaboratoriCache.some(
    (c) =>
      c.attivo !== false && (tutti || (c.reparto_dip || 'slots') === chiave) && (c.is_jolly || c.impiego === 'jolly'),
  );
  return {
    label: tutti ? 'nessun settore' : repartoLabel(chiave),
    codici: new Set(turni.map((t) => String(t.codice).toUpperCase())),
    gruppi: new Set(turni.map((t) => String(t.gruppo || '').toUpperCase()).filter(Boolean)),
    funzioni: funzioni,
    jolly: jolly,
  };
}
// Regole che parlano di turni o funzioni precisi: valgono solo dove esistono
function _pianoValidaRegolaSettore(nome, valore, settore) {
  const ctx = _pianoContestoSettore(settore);
  const manca = (cosa) =>
    'Regola non valida per ' +
    ctx.label +
    ': ' +
    cosa +
    '. Qui non avrebbe alcun effetto: lasciala su No o non crearla.';
  if (/^jolly_|^c_prima_jolly$|^c_dopo_jolly$/.test(nome) && settore && !ctx.jolly)
    return manca('non ci sono ausiliari (jolly) in questo settore');
  return null;
}
// Controllo del valore PRIMA del salvataggio: ritorna il motivo dell'errore
// oppure null se va bene. Usato dal salvataggio generale e da quello per settore.
function _pianoValidaRegola(nome, valore, settore) {
  const g = PIANO_REGOLE_GUIDA[nome];
  const v = String(valore == null ? '' : valore).trim();
  if (!g) return null;
  const perSettore = _pianoValidaRegolaSettore(nome, v, settore);
  if (perSettore) return perSettore;
  if (g.t === 'sino') {
    if (!/^(TRUE|FALSE)$/i.test(v)) return 'Questa regola accetta solo Si o No';
    return null;
  }
  if (g.t === 'numero') {
    const num = parseFloat(v.replace(',', '.'));
    if (v === '' || isNaN(num)) return 'Serve un numero (per esempio 11 oppure 0.8), non "' + v + '"';
    const lim = PIANO_REGOLE_LIMITI[nome];
    if (lim && (num < lim[0] || num > lim[1]))
      return (
        'Valore fuori scala: per "' + g.n + '" e ammesso da ' + lim[0] + ' a ' + lim[1] + ' (hai scritto ' + v + ')'
      );
    return null;
  }
  if (nome === 'chiusura_giorni_tardi') {
    const parti = v.split(',').map((x) => x.trim());
    if (!parti.length || parti.some((x) => !/^[0-6]$/.test(x)))
      return 'Scrivi i giorni della settimana come numeri da 0 (domenica) a 6 (sabato), separati da virgola: es. 5,6';
    return null;
  }
  if (nome === 'funzioni_fanno_tutto') {
    const note = new Set(_pianoFunzioniTutte());
    collaboratoriCache.forEach((c) => c.funzione && note.add(String(c.funzione).toUpperCase()));
    const ignote = v
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x && !note.has(x));
    if (ignote.length)
      return 'Funzioni sconosciute: ' + ignote.join(', ') + ' (Impostazioni del piano, Funzioni disponibili)';
    return null;
  }
  if (nome === 'jolly_codici_gia_pagati') {
    const noti = new Set(pianoCodiciCache.map((c) => String(c.codice).toUpperCase()));
    const ignoti = v
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x && !noti.has(x));
    if (ignoti.length)
      return 'Codici speciali inesistenti: ' + ignoti.join(', ') + ' (vedi scheda Turni, codici speciali)';
    return null;
  }
  return null;
}
const PIANO_REGOLE_GRUPPI_ORDINE = [
  'Riposo e giorni di lavoro',
  'Domeniche',
  'Ore e saldo',
  'Festivi e recuperi (CGF)',
  'Vacanze',
  'Ausiliari (jolly)',
  'Funzioni e turni',
  'Orari di chiusura',
  'Giorni chiusi',
  'Congedi non pagati',
];
function _pianoRegoleDove(nome) {
  const g = PIANO_REGOLE_GUIDA[nome];
  return g ? g.d : 'Non usata dal programma';
}
function _renderPianoRegoleCard() {
  if (!puoGestireRegole()) return _pianoSchedaRiservata('Regole del piano', 'Regole del piano');
  // VISTA PER SETTORE: si sceglie il settore in alto e si cambiano i numeri
  // direttamente. Per quel settore nasce (o si aggiorna) l'eccezione, la
  // regola generale resta per gli altri. "Tutti i settori" mostra le generali.
  const settori = typeof getReparti === 'function' ? getReparti() : [];
  const vista = window._pianoRegoleSettoreVista || '';
  const generali = {};
  const specifiche = {}; // nome|settore -> regola
  const sconosciute = [];
  pianoRegoleCache.forEach((r) => {
    if (!PIANO_REGOLE_GUIDA[r.nome]) {
      sconosciute.push(r);
      return;
    }
    const sett = _pianoRegolaSettori(r);
    if (!sett.length) generali[r.nome] = r;
    else sett.forEach((k) => (specifiche[r.nome + '|' + k] = r));
  });
  const perGruppo = {};
  Object.keys(PIANO_REGOLE_GUIDA).forEach((nome) => {
    if (!generali[nome] && !Object.keys(specifiche).some((k) => k.startsWith(nome + '|'))) return;
    const g = PIANO_REGOLE_GUIDA[nome];
    (perGruppo[g.g] = perGruppo[g.g] || []).push(nome);
  });
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Regole del piano' +
    '<select onchange="window._pianoRegoleSettoreVista=this.value;renderPiano()" style="padding:4px 8px;font-size:var(--fs-sm,.8125rem);border:1px solid var(--line-forte);border-radius:var(--r-1);background:var(--paper);color:var(--ink)"><option value=""' +
    (vista ? '' : ' selected') +
    '>Tutti i settori (valori generali)</option>' +
    settori
      .map(
        (rp) =>
          '<option value="' +
          escP(rp.key) +
          '"' +
          (vista === rp.key ? ' selected' : '') +
          '>' +
          escP(rp.label) +
          '</option>',
      )
      .join('') +
    '</select></div><div style="padding:10px 14px">';
  h +=
    '<details style="margin-bottom:12px;background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:8px 12px"><summary style="cursor:pointer;font-weight:700;font-size:var(--fs-md,.875rem)">Come si usano le regole (guida in 6 punti)</summary>' +
    '<ol style="font-size:var(--fs-md,.875rem);margin:8px 0 4px 18px;line-height:1.5">' +
    '<li><b>Cambia il valore</b> nella casella e premi Invio o clicca fuori: si salva da solo e vale subito in tutto il programma. La colonna "Dove agisce" dice in quali schermate la regola conta.</li>' +
    '<li><b>Si / No</b> accende o spegne una preferenza. La casella <b>Attiva</b> spegne qualsiasi regola senza perdere il valore: spenta, e come se non esistesse.</li>' +
    '<li><b>Un valore diverso per un settore</b>: scegli il settore nel menu in alto e cambia il numero. Nasce l eccezione per quel settore; gli altri tengono il valore generale. "Torna al generale" la toglie. Esempio: riposo 11 ore ovunque, 12 ai Tavoli.</li>' +
    '<li><b>Regole nuove sui gruppi di lavoro</b> (chi può fare cassa, quanti Supervisor al giorno, una funzione richiesta): si creano nella card <b>Regole di gruppo</b>, più in basso in questa scheda, scegliendo il tipo dall elenco. Non serve scrivere codice.</li>' +
    '<li><b>Preferenze di una persona</b> (solo diurni o notturni, turni bloccati, giorni di lavoro, affiancamento): in Piano &gt; Impostazioni, Preferenze collaboratori. La copertura di altri settori, la funzione e la percentuale in Impostazioni &gt; Gestione collaboratori; competenze e livelli in Formazione. La bozza e Valida regole le rispettano.</li>' +
    '<li><b>Fonte</b>: sotto ogni regola normativa c e il riferimento (RAP, legge sul lavoro, direttiva). Se cambia il regolamento, cambia il numero qui: il programma non va toccato. Ogni modifica finisce nel Registro attività.</li>' +
    '</ol></details>';
  if (vista)
    h +=
      '<p style="font-size:var(--fs-sm,.8125rem);color:var(--c-oro,#8b6914);margin-bottom:8px">Stai vedendo i valori validi per <b>' +
      escP(repartoLabel(vista)) +
      '</b>. Le righe con il segno <b>eccezione</b> hanno un valore proprio; le altre usano quello generale. Modificando una casella crei l eccezione per questo settore.</p>';
  const valoreInput = (r, tipo, onch) => {
    if (tipo === 'sino') {
      const on = String(r.valore || '').toUpperCase() === 'TRUE';
      return (
        '<select onchange="' +
        onch +
        '" style="padding:3px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="TRUE"' +
        (on ? ' selected' : '') +
        '>Si</option><option value="FALSE"' +
        (on ? '' : ' selected') +
        '>No</option></select>'
      );
    }
    return (
      '<input type="text" value="' +
      escP(r.valore || '') +
      '" onchange="' +
      onch +
      '" style="width:' +
      (tipo === 'numero' ? '64' : '110') +
      'px;padding:3px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">'
    );
  };
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:760px;font-size:var(--fs-md,.875rem)">';
  h +=
    '<thead><tr><th style="text-align:left">Regola</th><th>Valore</th><th style="min-width:170px">' +
    (vista ? 'Per questo settore' : 'Eccezioni') +
    '</th><th>Attiva</th><th style="text-align:left">Dove agisce</th></tr></thead><tbody>';
  const gruppi = PIANO_REGOLE_GRUPPI_ORDINE.filter((g) => perGruppo[g]).concat(
    Object.keys(perGruppo).filter((g) => !PIANO_REGOLE_GRUPPI_ORDINE.includes(g)),
  );
  gruppi.forEach((gr) => {
    h +=
      '<tr><td colspan="5" style="text-align:left;background:var(--paper2);font-weight:700;letter-spacing:.04em">' +
      escP(gr) +
      '</td></tr>';
    perGruppo[gr]
      .slice()
      .sort((a, b) => PIANO_REGOLE_GUIDA[a].n.localeCompare(PIANO_REGOLE_GUIDA[b].n))
      .forEach((nome) => {
        const g = PIANO_REGOLE_GUIDA[nome];
        const gen = generali[nome];
        const spec = vista ? specifiche[nome + '|' + vista] : null;
        const r = spec || gen;
        if (!r) return;
        const eccezioni = Object.keys(specifiche)
          .filter((k) => k.startsWith(nome + '|'))
          .map((k) => k.split('|')[1]);
        const onch = vista
          ? "salvaPianoRegolaSettore('" + escP(nome) + "','" + escP(vista) + "','valore',this.value)"
          : 'salvaPianoRegola(' + r.id + ",'valore',this.value)";
        const onAtt = vista
          ? "salvaPianoRegolaSettore('" + escP(nome) + "','" + escP(vista) + "','attivo',this.checked)"
          : 'salvaPianoRegola(' + r.id + ",'attivo',this.checked)";
        let colSett = '';
        if (vista) {
          colSett = spec
            ? '<span style="color:var(--c-oro,#8b6914);font-weight:700">eccezione</span> <button class="btn-del-tipo pericolo" style="font-size:var(--fs-sm,.8125rem);padding:1px 6px" onclick="eliminaPianoRegolaSettore(' +
              spec.id +
              ')">Torna al generale</button>'
            : '<span style="color:var(--muted)">valore generale</span>';
        } else {
          colSett = eccezioni.length
            ? eccezioni
                .map((k) => escP(repartoLabel(k)) + ': <b>' + escP(specifiche[nome + '|' + k].valore || '') + '</b>')
                .join(', ')
            : '<span style="color:var(--muted)">nessuna</span>';
        }
        h +=
          '<tr' +
          (r.attivo === false ? ' style="opacity:.55"' : '') +
          '><td style="text-align:left;white-space:normal;min-width:260px"><b>' +
          escP(g.n) +
          '</b><br><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
          escP(nome) +
          (PIANO_REGOLE_FONTE[nome] ? ' · ' + escP(PIANO_REGOLE_FONTE[nome]) : '') +
          '</span></td><td>' +
          valoreInput(r, g.t, onch) +
          '</td><td style="text-align:left;font-size:var(--fs-sm,.8125rem)">' +
          colSett +
          '</td><td><input type="checkbox"' +
          (r.attivo !== false ? ' checked' : '') +
          ' onchange="' +
          onAtt +
          '"></td><td style="font-size:var(--fs-sm,.8125rem);text-align:left;color:var(--c-verde,#2c6e49)">' +
          escP(g.d) +
          '</td></tr>';
      });
  });
  if (sconosciute.length) {
    h +=
      '<tr><td colspan="5" style="text-align:left;background:var(--paper2);font-weight:700">Regole che il programma non usa</td></tr>';
    sconosciute.forEach((r) => {
      h +=
        '<tr style="opacity:.6"><td style="text-align:left;white-space:normal">' +
        escP(r.nome) +
        '<br><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
        escP(r.descrizione || '') +
        '</span></td><td>' +
        escP(r.valore || '') +
        '</td><td colspan="2" style="text-align:left;font-size:var(--fs-sm,.8125rem);color:var(--muted)">nessun effetto</td><td style="font-size:var(--fs-sm,.8125rem);text-align:left"><button class="btn-del-tipo pericolo" onclick="eliminaPianoRegola(' +
        r.id +
        ')">Elimina</button></td></tr>';
    });
  }
  h += '</tbody></table></div></div></div>';
  return h;
}
// Valore di una regola per UN settore: aggiorna l'eccezione se c'e', altrimenti
// la crea copiando la generale. Cosi' "personalizzare per settore" e' una
// casella da cambiare, non una procedura.
async function salvaPianoRegolaSettore(nome, settore, campo, valore) {
  if (!isAdmin()) return;
  if (campo === 'valore') {
    const errore = _pianoValidaRegola(nome, valore, settore);
    if (errore) {
      toastErrore(errore + ' Per ' + repartoLabel(settore) + ' resta il valore di prima.', 9000);
      renderPiano();
      return;
    }
  }
  const spec = pianoRegoleCache.find((x) => x.nome === nome && _pianoRegolaSettori(x).includes(settore));
  if (spec) return salvaPianoRegola(spec.id, campo, valore);
  const gen = pianoRegoleCache.find((x) => x.nome === nome && !_pianoRegolaSettori(x).length);
  if (!gen) return;
  try {
    const nuova = await secPost('piano_regole', {
      nome: nome,
      valore: campo === 'valore' ? String(valore).trim() : gen.valore,
      tipo: gen.tipo,
      peso: gen.peso,
      attivo: campo === 'attivo' ? !!valore : true,
      descrizione: gen.descrizione,
      settori: settore,
    });
    if (nuova && nuova[0]) pianoRegoleCache.push(nuova[0]);
    const mostra = campo === 'attivo' ? (valore ? 'si' : 'no') : String(valore).trim();
    logAzione('Regola per settore', nome + ' = ' + mostra + ' per ' + settore);
    _pianoRegistraModifica('Regole', nome + ' (' + repartoLabel(settore) + ')', campo, 'valore generale', mostra);
    toast('Eccezione creata per ' + repartoLabel(settore) + ': ' + nome + ' = ' + mostra);
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toastErrore('Errore nel salvataggio della regola: ' + (e.message || ''));
  }
}
async function eliminaPianoRegolaSettore(id) {
  if (!isAdmin()) return;
  const r = pianoRegoleCache.find((x) => x.id === id);
  if (!r) return;
  if (
    !(await chiediConferma(
      'Togliere il valore proprio di "' +
        r.nome +
        '" per ' +
        _pianoRegolaSettori(r).map(repartoLabel).join(', ') +
        "?\n\nTornera' a valere il valore generale.",
    ))
  )
    return;
  try {
    await secDel('piano_regole', 'id=eq.' + id);
    pianoRegoleCache = pianoRegoleCache.filter((x) => x.id !== id);
    logAzione('Regola per settore tolta', r.nome + ' (' + String(r.settori) + ')');
    _pianoRegistraModifica(
      'Regole',
      r.nome + ' (' + String(r.settori) + ')',
      'eccezione',
      String(r.valore),
      'valore generale',
    );
    toast('Torna il valore generale');
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toastErrore('Errore: ' + (e.message || ''));
  }
}
// Una regola che il programma non legge e' solo confusione: si puo' togliere
async function eliminaPianoRegola(id) {
  if (!isAdmin()) return;
  const r = pianoRegoleCache.find((x) => x.id === id);
  if (!r) return;
  if (
    !(await chiediConferma(
      'Eliminare la regola "' + r.nome + '"? Il programma non la usa: non cambia nulla nei calcoli.',
    ))
  )
    return;
  try {
    await secDel('piano_regole', 'id=eq.' + id);
    pianoRegoleCache = pianoRegoleCache.filter((x) => x.id !== id);
    logAzione('Piano: regola eliminata', r.nome + ' (non usata)');
    toast('Regola eliminata');
    renderPiano();
  } catch (e) {
    toastErrore('Errore: ' + (e.message || ''));
  }
}
// Crea una regola SPECIFICA per uno o piu' settori a partire da quella
// generale: la generale resta e continua a valere ovunque, la nuova vince nei
// settori indicati. Non si duplicano tutte le regole, solo l'eccezione.
async function pianoRegolaEccezione(nome) {
  if (!isAdmin()) return;
  const gen = pianoRegoleCache.find((x) => x.nome === nome && !_pianoRegolaSettori(x).length);
  if (!gen) return;
  const elenco = (typeof getReparti === 'function' ? getReparti() : []).map((r) => r.key).join(', ');
  const sett = await chiediTesto(
    'Per quali settori vale l\'eccezione a "' +
      nome +
      '"?\n\nScrivi i settori separati da virgola.' +
      (elenco ? '\nDisponibili: ' + elenco : ''),
    typeof _pianoReparto === 'function' ? _pianoReparto() : '',
  );
  if (sett === null) return;
  const pulito = String(sett)
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(',');
  if (!pulito) return;
  const val = await chiediTesto('Valore di "' + nome + '" per ' + pulito + ':', gen.valore || '');
  if (val === null) return;
  const erroreV = _pianoValidaRegola(nome, val, pulito.split(',').length === 1 ? pulito : '');
  if (erroreV) {
    toastErrore(erroreV, 9000);
    return;
  }
  try {
    const nuova = await secPost('piano_regole', {
      nome: nome,
      valore: String(val).trim(),
      tipo: gen.tipo,
      peso: gen.peso,
      attivo: true,
      descrizione: gen.descrizione,
      settori: pulito,
    });
    if (nuova && nuova[0]) pianoRegoleCache.push(nuova[0]);
    logAzione('Regola per settore', nome + ' = ' + val + ' per ' + pulito);
    toast('Eccezione creata: ' + nome + ' = ' + val + ' per ' + pulito);
    renderPiano();
  } catch (e) {
    toast('Errore: esiste già una regola "' + nome + '" per quei settori');
  }
}
// Cambia i settori di una regola specifica (vuoto = torna generale)
async function pianoRegolaSettoriEdit(id) {
  if (!isAdmin()) return;
  const r = pianoRegoleCache.find((x) => x.id === id);
  if (!r) return;
  const sett = await chiediTesto(
    'Settori per la regola "' + r.nome + '" (vuoto = vale per tutti i settori):',
    _pianoRegolaSettori(r).join(','),
  );
  if (sett === null) return;
  const pulito = String(sett)
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(',');
  try {
    await secPatch('piano_regole', 'id=eq.' + id, { settori: pulito || null });
    r.settori = pulito || null;
    logAzione('Regola per settore', r.nome + ' -> ' + (pulito || 'tutti i settori'));
    toast(pulito ? 'Ora vale per: ' + pulito : 'Ora vale per tutti i settori');
    renderPiano();
  } catch (e) {
    toast('Errore aggiornamento settori');
  }
}
async function salvaPianoRegola(id, campo, valore) {
  if (!isAdmin()) return;
  const rV = pianoRegoleCache.find((x) => x.id === id);
  if (campo === 'valore' && rV) {
    const settR = _pianoRegolaSettori(rV);
    const errore = _pianoValidaRegola(rV.nome, valore, settR.length === 1 ? settR[0] : '');
    if (errore) {
      toastErrore(errore + ' Il valore precedente (' + String(rV.valore) + ') resta in vigore.', 9000);
      renderPiano();
      return;
    }
  }
  try {
    const patch = {};
    patch[campo] = campo === 'attivo' ? !!valore : String(valore).trim();
    await secPatch('piano_regole', 'id=eq.' + id, patch);
    const r = pianoRegoleCache.find((x) => x.id === id);
    const prima = r ? r[campo] : '';
    if (r) r[campo] = patch[campo];
    const mostra = (v) => (campo === 'attivo' ? (v ? 'si' : 'no') : String(v == null || v === '' ? 'vuoto' : v));
    logAzione(
      'Piano: regola modificata',
      (r ? r.nome : id) + ' \u00b7 ' + campo + ': ' + mostra(prima) + ' \u2192 ' + mostra(patch[campo]),
    );
    _pianoRegistraModifica(
      'Regole',
      r ? r.nome || r.chiave || String(id) : String(id),
      campo,
      mostra(prima),
      mostra(patch[campo]),
    );
    toast('Salvato \u00b7 ' + (r ? r.nome : id) + ': ' + mostra(prima) + ' \u2192 ' + mostra(patch[campo]));
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio regola');
  }
}

// ================================================================
// PERSONALIZZAZIONE COMPLETA · fabbisogni, turni, codici, festivi
// ================================================================
let _pianoFabbCache = [];

async function setPianoFabbisogno(codice, dstr, qDiretta) {
  if (!puoGestirePiano()) return;
  if (!_pianoAzioneAutoConsentita('fabbisogno')) return; // visibile a tutti, modificabile con il permesso
  const esistente = _pianoFabbCache.find(
    (f) => f.turno_codice === codice && f.data === dstr && (f.reparto_dip || 'slots') === _pianoReparto(),
  );
  const attuale = esistente ? esistente.quantita : 0;
  let q;
  if (qDiretta != null) {
    q = qDiretta;
  } else {
    const v = await chiediTesto(
      'Persone necessarie per ' +
        codice +
        ' il ' +
        new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
        ' (0 = rimuovi):',
      String(attuale),
    );
    if (v === null) return;
    q = parseInt(v);
  }
  if (isNaN(q) || q < 0 || q > 99) {
    toast('Inserisci un numero tra 0 e 99');
    return;
  }
  if (q === attuale) {
    renderPiano();
    return;
  }
  try {
    if (esistente && q === 0) {
      await secDel('piano_fabbisogni', 'id=eq.' + esistente.id);
    } else if (esistente) {
      await secPatch('piano_fabbisogni', 'id=eq.' + esistente.id, { quantita: q });
    } else if (q > 0) {
      await secPost('piano_fabbisogni', {
        data: dstr,
        turno_codice: codice,
        quantita: q,
        reparto_dip: _pianoReparto(),
      });
    } else return;
    logAzione('Piano: fabbisogno', codice + ' ' + dstr + ' → ' + q);
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio fabbisogno');
  }
}

// Modifica INLINE del fabbisogno: click sulla cella = scrivi il numero lì
// MODIFICA DI UNA CELLA DEL FABBISOGNO, con la tastiera come nel calendario (richiesta del
// titolare 08/10/2026): Invio = conferma e scende (Maiusc+Invio sale), Tab = destra
// (Maiusc+Tab sinistra), frecce = conferma e si sposta, Esc = annulla. Con piu celle
// selezionate (opz.blocco) il numero va su tutte.
function fabbisognoInline(codice, dstr, el, opz) {
  opz = opz || {};
  if (window.event && window.event.shiftKey && window.event.type !== 'keydown') {
    pianoBloccoClick('fabb', el);
    return;
  }
  if (!puoGestirePiano() || !el || el.querySelector('input')) return;
  if (!opz.blocco) _fabbSelezionaCella(el);
  const esistente = _pianoFabbCache.find(
    (f) => f.turno_codice === codice && f.data === dstr && (f.reparto_dip || 'slots') === _pianoReparto(),
  );
  const attuale = esistente ? esistente.quantita : 0;
  const vecchio = el.innerHTML;
  el.innerHTML =
    '<input type="text" inputmode="numeric" value="' +
    (attuale || '') +
    '" size="1" maxlength="2" style="width:100%;min-width:0;box-sizing:border-box;border:1px solid #1a4a7a;border-radius:0;padding:0;margin:0;font:inherit;font-weight:700;text-align:center;background:transparent;color:inherit">';
  const inp = el.querySelector('input');
  inp.focus();
  if (opz.iniziale) {
    inp.value = opz.iniziale;
    inp.setSelectionRange(inp.value.length, inp.value.length);
  } else inp.select();
  let chiuso = false;
  let dopo = null; // cella su cui spostarsi dopo la conferma
  const conferma = async () => {
    if (chiuso) return;
    chiuso = true;
    const v = inp.value.trim();
    const q = v === '' ? 0 : parseInt(v);
    // la cella attiva passa subito alla destinazione: il ridisegno la ritrova
    if (dopo) _fabbRicordaCella(dopo);
    if (v !== '' && (isNaN(q) || q < 0 || q > 99)) {
      el.innerHTML = vecchio;
      toast('Inserisci un numero tra 0 e 99');
      if (dopo) _fabbSelezionaCella(dopo);
      return;
    }
    if (opz.blocco) {
      el.innerHTML = vecchio;
      await fabbScriviSuSelezione(q, opz.blocco);
      return;
    }
    if (q === attuale) {
      el.innerHTML = vecchio;
      _fabbSelezionaCella(dopo || el);
      return;
    }
    await setPianoFabbisogno(codice, dstr, q);
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    let mossa = null;
    if (e.key === 'Enter') mossa = [0, e.shiftKey ? -1 : 1];
    else if (e.key === 'Tab') mossa = [e.shiftKey ? -1 : 1, 0];
    else if (e.key === 'ArrowDown') mossa = [0, 1];
    else if (e.key === 'ArrowUp') mossa = [0, -1];
    else if (e.key === 'ArrowRight') mossa = [1, 0];
    else if (e.key === 'ArrowLeft') mossa = [-1, 0];
    if (mossa) {
      e.preventDefault();
      dopo = _fabbCellaVicina(el, mossa[0], mossa[1]) || el;
      conferma();
    } else if (e.key === 'Escape') {
      chiuso = true;
      el.innerHTML = vecchio;
      _fabbSelezionaCella(el);
    }
  });
  inp.addEventListener('click', (e) => e.stopPropagation());
  inp.addEventListener('blur', conferma);
}

// Import fabbisogno da CSV/Excel · formato Turnivo (upload_fabbisogno):
// prima colonna = codice turno, colonne successive = quantità per i giorni
// 1..N del mese. SOSTITUISCE il fabbisogno del mese per questo settore.

// ---- lettura dei file Excel REALI (PIANO SLOTS/VALET 2026) ----
// I fogli sono per mese ("SETTEMBRE 2026"), l'intestazione giorni è una riga
// di date seriali (1..31) e le sigle sono spesso minuscole.
function _xlsFoglioMese(wb, ym) {
  const MESI_L = (typeof MESI_FULL !== 'undefined' ? MESI_FULL : []).map((m) => String(m).toUpperCase());
  const mese = MESI_L[parseInt(ym.split('-')[1]) - 1] || '';
  const anno = ym.split('-')[0];
  const hit = wb.SheetNames.find((n) => {
    const u = n.toUpperCase().trim();
    return mese && u.startsWith(mese) && u.includes(anno);
  });
  return hit || null;
}
// trova in una riga la mappa giorno -> indice colonna (valori 1..31 crescenti)
function _xlsMappaGiorni(riga, nGiorni) {
  const mappa = {};
  let trovati = 0;
  let atteso = 1;
  for (let c = 0; c < (riga || []).length && atteso <= nGiorni; c++) {
    let v = riga[c];
    if (v instanceof Date) v = Math.round((v - new Date(Date.UTC(1899, 11, 31))) / 86400000);
    const n = typeof v === 'number' ? Math.round(v) : parseInt(v);
    if (n === atteso) {
      mappa[atteso] = c;
      trovati++;
      atteso++;
    }
  }
  return trovati >= Math.min(10, nGiorni) ? mappa : null;
}
function _xlsCercaMappaGiorni(dati, nGiorni, daRiga, aRiga) {
  for (let r = daRiga; r <= Math.min(aRiga, dati.length - 1); r++) {
    const m = _xlsMappaGiorni(dati[r], nGiorni);
    if (m) return m;
  }
  return null;
}
// COLORI DEL FILE EXCEL, come li vede chi apre il file. Due fonti:
// 1. i colori dati a mano alla cella (es. le X dei coordinatori in rosso);
// 2. le REGOLE AUTOMATICHE di Excel (formattazione condizionale, es. "se la
//    cella e V sfondo blu"): stanno sopra al colore a mano e sono quelle che
//    si vedono. Il programma le calcola come Excel: per ogni cella le regole
//    che la coprono, in ordine di priorita, la prima vera vince.
// Ritorna (riga, colonna) -> { sfondo, testo, sfondoRegola, testoRegola, diretto }
// (colori '#RRGGBB' o ''; diretto = '#SFONDO||#TESTO' dato a mano alla cella,
// anche se una regola lo copre).
function _xlsColoriFoglio(wb, nomeFoglio) {
  const nessuno = () => null;
  try {
    const files = wb && wb.files;
    if (!files) return nessuno;
    const testo = (n) => {
      const f = files[n] || files['/' + n];
      if (!f || !f.content) return '';
      return typeof f.content === 'string' ? f.content : new TextDecoder('utf-8').decode(f.content);
    };
    const wbx = testo('xl/workbook.xml');
    const rels = testo('xl/_rels/workbook.xml.rels');
    const esc = nomeFoglio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mS = wbx.match(new RegExp('<sheet[^>]*name="' + esc + '"[^>]*r:id="([^"]+)"'));
    if (!mS) return nessuno;
    const mR =
      rels.match(new RegExp('Id="' + mS[1] + '"[^>]*Target="([^"]+)"')) ||
      rels.match(new RegExp('Target="([^"]+)"[^>]*Id="' + mS[1] + '"'));
    if (!mR) return nessuno;
    const percorso = mR[1].replace(/^\//, '').replace(/^xl\//, '');
    const foglio = testo('xl/' + percorso);
    const stili = testo('xl/styles.xml');
    if (!foglio || !stili) return nessuno;
    const ws = wb.Sheets && wb.Sheets[nomeFoglio];
    const pal = _xlsTavolozza(testo('xl/theme/theme1.xml'));
    const blocco = (nome) => {
      const m = stili.match(new RegExp('<' + nome + '[^>]*>([\\s\\S]*?)</' + nome + '>'));
      return m ? m[1] : '';
    };
    const fills = (blocco('fills').match(/<fill>[\s\S]*?<\/fill>|<fill\/>/g) || []).map((f) => {
      if (!/patternType="solid"/.test(f)) return '';
      return pal((f.match(/<fgColor[^>]*\/>/) || [])[0]);
    });
    const fonts = (blocco('fonts').match(/<font>[\s\S]*?<\/font>|<font\/>/g) || []).map((f) =>
      pal((f.match(/<color[^>]*\/>/) || [])[0]),
    );
    const xfs = (blocco('cellXfs').match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || []).map((x) => {
      const n = (k) => {
        const m = x.match(new RegExp(k + '="(\\d+)"'));
        return m ? parseInt(m[1]) : 0;
      };
      const bg = fills[n('fillId')] || '';
      const fg = fonts[n('fontId')] || '';
      return { bg: bg && bg !== 'FFFFFF' ? '#' + bg : '', fg: fg && fg !== '000000' ? '#' + fg : '' };
    });
    const numCol = (lett) => lett.split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const diretti = {};
    const re = /<c r="([A-Z]+)(\d+)"[^>]*?\ss="(\d+)"/g;
    let m;
    while ((m = re.exec(foglio))) {
      const st = xfs[parseInt(m[3])];
      if (st && (st.bg || st.fg)) diretti[parseInt(m[2]) - 1 + '|' + numCol(m[1])] = st;
    }
    // stili delle regole (dxf): in una regola lo sfondo e bgColor
    const dxfs = (blocco('dxfs').match(/<dxf>[\s\S]*?<\/dxf>|<dxf\/>/g) || []).map((d) => {
      const fill = (d.match(/<fill>[\s\S]*?<\/fill>/) || [''])[0];
      const font = (d.match(/<font>[\s\S]*?<\/font>/) || [''])[0];
      const bg = pal((fill.match(/<bgColor[^>]*\/>/) || fill.match(/<fgColor[^>]*\/>/) || [])[0]);
      const fg = pal((font.match(/<color[^>]*\/>/) || [])[0]);
      return { bg: bg ? '#' + bg : '', fg: fg ? '#' + fg : '' };
    });
    const regole = _xlsRegoleCondizionali(foglio, numCol);
    const valore = (r, c) => {
      if (!ws || typeof XLSX === 'undefined') return null;
      const x = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      return x ? x.v : null;
    };
    return (r, c) => {
      const dir = diretti[r + '|' + c] || { bg: '', fg: '' };
      const out = {
        sfondo: dir.bg,
        testo: dir.fg,
        sfondoRegola: false,
        testoRegola: false,
        diretto: dir.bg || dir.fg ? dir.bg + (dir.fg ? '||' + dir.fg : '') : '',
      };
      let bgFatto = false;
      let fgFatto = false;
      const v = valore(r, c);
      for (const rg of regole) {
        if (bgFatto && fgFatto) break;
        if (!rg.aree.some((a) => r >= a[0] && r <= a[2] && c >= a[1] && c <= a[3])) continue;
        if (!_xlsRegolaVera(rg, v)) continue;
        const st = dxfs[rg.dxf];
        if (st && st.bg && !bgFatto) {
          out.sfondo = st.bg;
          out.sfondoRegola = true;
          bgFatto = true;
        }
        if (st && st.fg && !fgFatto) {
          out.testo = st.fg;
          out.testoRegola = true;
          fgFatto = true;
        }
        if (rg.ferma) break;
      }
      if (out.sfondo === '#FFFFFF') out.sfondo = '';
      if (out.testo === '#000000') out.testo = '';
      return out;
    };
  } catch (e) {
    console.warn('colori del file non letti', e);
    return nessuno;
  }
}
// colori del tema e della tavolozza di Excel; la tinta (schiarire/scurire) si
// applica alla luminosita come fa Excel, non ai tre canali
function _xlsTavolozza(tema) {
  const temaCol = [];
  ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].forEach((k) => {
    const m = String(tema || '').match(
      new RegExp('<a:' + k + '>[\\s\\S]*?(?:srgbClr val="([0-9A-Fa-f]{6})"|lastClr="([0-9A-Fa-f]{6})")'),
    );
    temaCol.push(m ? (m[1] || m[2]).toUpperCase() : null);
  });
  const PAL = {
    0: '000000',
    1: 'FFFFFF',
    2: 'FF0000',
    3: '00FF00',
    4: '0000FF',
    5: 'FFFF00',
    6: 'FF00FF',
    7: '00FFFF',
    8: '000000',
    9: 'FFFFFF',
    10: 'FF0000',
    11: '00FF00',
    12: '0000FF',
    13: 'FFFF00',
    14: 'FF00FF',
    15: '00FFFF',
    16: '800000',
    17: '008000',
    18: '000080',
    19: '808000',
    20: '800080',
    21: '008080',
    22: 'C0C0C0',
    23: '808080',
    40: '00CCFF',
    41: 'CCFFFF',
    42: 'CCFFCC',
    43: 'FFFF99',
    44: '99CCFF',
    45: 'FF99CC',
    46: 'CC99FF',
    47: 'FFCC99',
    48: '3366FF',
    49: '33CCCC',
    50: '99CC00',
    51: 'FFCC00',
    52: 'FF9900',
    53: 'FF6600',
    54: '666699',
    55: '969696',
  };
  return (tag) => {
    if (!tag) return '';
    const a = (k) => {
      const m = tag.match(new RegExp('\\s' + k + '="([^"]+)"'));
      return m ? m[1] : null;
    };
    let hex = null;
    if (a('rgb')) hex = a('rgb').slice(-6).toUpperCase();
    else if (a('theme') != null) hex = temaCol[parseInt(a('theme'))] || null;
    else if (a('indexed') != null) hex = PAL[parseInt(a('indexed'))] || null;
    if (!hex) return '';
    return _xlsTinta(hex, parseFloat(a('tint')) || 0);
  };
}
function _xlsTinta(hex, t) {
  if (!t) return hex;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  const f = (p, q, x) => {
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = f(p, q, h + 1 / 3);
    g = f(p, q, h);
    b = f(p, q, h - 1 / 3);
  }
  return [r, g, b]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
}
// regole automatiche del foglio, in ordine di priorita (numero piu basso = prima)
function _xlsRegoleCondizionali(foglio, numCol) {
  const regole = [];
  const deXml = (s) =>
    String(s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  const blocchi = foglio.match(/<conditionalFormatting[^>]*>[\s\S]*?<\/conditionalFormatting>/g) || [];
  blocchi.forEach((bl) => {
    const sq = (bl.match(/sqref="([^"]+)"/) || [])[1];
    if (!sq) return;
    const aree = sq
      .split(/\s+/)
      .map((p) => {
        const m = p.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
        if (!m) return null;
        const r1 = parseInt(m[2]) - 1;
        const c1 = numCol(m[1]);
        return [r1, c1, m[4] ? parseInt(m[4]) - 1 : r1, m[3] ? numCol(m[3]) : c1];
      })
      .filter(Boolean);
    if (!aree.length) return;
    // i riferimenti relativi delle formule partono dall angolo in alto a sinistra
    const angolo = { r: Math.min(...aree.map((a) => a[0])), c: Math.min(...aree.map((a) => a[1])) };
    (bl.match(/<cfRule[^>]*\/>|<cfRule[\s\S]*?<\/cfRule>/g) || []).forEach((cr) => {
      const at = (k) => {
        const m = cr.match(new RegExp('\\s' + k + '="([^"]*)"'));
        return m ? deXml(m[1]) : null;
      };
      if (at('dxfId') == null) return;
      regole.push({
        aree: aree,
        angolo: angolo,
        numCol: numCol,
        tipo: at('type'),
        op: at('operator'),
        testo: at('text'),
        formule: (cr.match(/<formula>[\s\S]*?<\/formula>/g) || []).map((f) => deXml(f.replace(/<\/?formula>/g, ''))),
        dxf: parseInt(at('dxfId')),
        priorita: parseInt(at('priority')) || 0,
        ferma: at('stopIfTrue') === '1',
      });
    });
  });
  return regole.sort((a, b) => a.priorita - b.priorita);
}
// valore di una costante di formula: "testo" o numero; null = non calcolabile
function _xlsCostante(f) {
  const s = String(f || '').trim();
  const m = s.match(/^"((?:[^"]|"")*)"$/);
  if (m) return m[1].replace(/""/g, '"');
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return null;
}
// confronto come Excel: numeri prima dei testi, testi senza maiuscole/minuscole
function _xlsConfronta(a, b) {
  const na = typeof a === 'number';
  const nb = typeof b === 'number';
  if (na && nb) return a - b;
  if (na !== nb) return na ? -1 : 1;
  const x = String(a).toUpperCase();
  const y = String(b).toUpperCase();
  return x < y ? -1 : x > y ? 1 : 0;
}
function _xlsRegolaVera(rg, v) {
  const vuota = v == null || v === '';
  const val = typeof v === 'number' ? v : vuota ? '' : String(v);
  const txt = vuota ? '' : String(v).toUpperCase();
  if (rg.tipo === 'cellIs') {
    const k = rg.formule.map(_xlsCostante);
    if (k[0] == null || (rg.formule.length > 1 && k[1] == null)) return false;
    if (vuota && rg.op !== 'notEqual') return false;
    const c0 = _xlsConfronta(val, k[0]);
    switch (rg.op) {
      case 'equal':
        return c0 === 0;
      case 'notEqual':
        return c0 !== 0;
      case 'greaterThan':
        return c0 > 0;
      case 'lessThan':
        return c0 < 0;
      case 'greaterThanOrEqual':
        return c0 >= 0;
      case 'lessThanOrEqual':
        return c0 <= 0;
      case 'between':
      case 'notBetween': {
        const lo = _xlsConfronta(k[0], k[1]) <= 0 ? k[0] : k[1];
        const hi = lo === k[0] ? k[1] : k[0];
        const dentro = _xlsConfronta(val, lo) >= 0 && _xlsConfronta(val, hi) <= 0;
        return rg.op === 'between' ? dentro : !dentro;
      }
    }
    return false;
  }
  const t = String(rg.testo || '').toUpperCase();
  if (rg.tipo === 'containsText') return !!t && txt.indexOf(t) >= 0;
  if (rg.tipo === 'notContainsText') return !!t && txt.indexOf(t) < 0;
  if (rg.tipo === 'beginsWith') return !!t && txt.startsWith(t);
  if (rg.tipo === 'endsWith') return !!t && txt.endsWith(t);
  if (rg.tipo === 'containsBlanks') return !txt.trim();
  if (rg.tipo === 'notContainsBlanks') return !!txt.trim();
  if (rg.tipo === 'expression') return _xlsEspressioneVera(rg, txt);
  return false;
}
// espressioni sulla cella stessa: LEFT(A1;n)="x", RIGHT(A1;n)="x", A1="x"
// (anche con <>). Le altre (che guardano altre celle) non si calcolano.
function _xlsEspressioneVera(rg, txt) {
  const f = String(rg.formule[0] || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  const stessa = (ref) => {
    const m = ref.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/);
    return !!m && parseInt(m[2]) - 1 === rg.angolo.r && rg.numCol(m[1]) === rg.angolo.c;
  };
  let m = f.match(/^(LEFT|RIGHT)\(([$A-Z0-9]+),(\d+)\)(=|<>)"((?:[^"]|"")*)"$/);
  if (m && stessa(m[2])) {
    const n = parseInt(m[3]);
    const pezzo = m[1] === 'LEFT' ? txt.slice(0, n) : txt.slice(-n);
    const ug = pezzo === m[5].replace(/""/g, '"');
    return m[4] === '=' ? ug : !ug;
  }
  m = f.match(/^([$A-Z0-9]+)(=|<>)"((?:[^"]|"")*)"$/);
  if (m && stessa(m[1])) {
    const ug = txt === m[3].replace(/""/g, '"');
    return m[2] === '=' ? ug : !ug;
  }
  return false;
}
// colori quasi uguali (le tinte di Excel arrotondano di qualche punto)
function _xlsColoriVicini(a, b) {
  const h = (x) =>
    String(x || '')
      .replace('#', '')
      .toUpperCase();
  const x = h(a);
  const y = h(b);
  if (!/^[0-9A-F]{6}$/.test(x) || !/^[0-9A-F]{6}$/.test(y)) return x === y;
  return [0, 2, 4].every((i) => Math.abs(parseInt(x.substr(i, 2), 16) - parseInt(y.substr(i, 2), 16)) <= 8);
}
// colore da salvare nella cella del piano: solo quello dato a mano nel file e
// che Excel mostra davvero (non coperto da una regola), se diverso dal colore
// della sigla. I colori delle regole sono i colori delle sigle: valgono per
// tutte le celle con quella sigla, non si copiano cella per cella.
function _xlsColoreDaTenere(cod, cs) {
  if (!cs) return '';
  let bg = cs.sfondoRegola ? '' : cs.sfondo;
  if (bg && _xlsColoriVicini(bg, _pianoColore(cod))) bg = '';
  const fg = cs.testoRegola ? '' : cs.testo;
  return bg || fg ? bg + (fg ? '||' + fg : '') : '';
}
function _xlsNormaNome(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accenti: Nicolo = Nicolò
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/[’'`.]/g, ' ') // D'Amico = D Amico
    .replace(/\s+/g, ' ')
    .trim();
}
// NOME DEL FILE -> COLLABORATORE: nel file a volte c e prima il nome e poi il
// cognome; vale sempre il nome scritto in Gestione collaboratori (l import non
// rinomina mai nessuno). Dal riscontro piu sicuro al piu largo:
// 1. uguale; 2. stesse parole in altro ordine (Mario Rossi = Rossi Mario);
// 3. tutte le parole del file sono parole intere del nome (Marco Azevedo =
//    Azevedo Morais Marco Paulo); 4. come prima: parole contenute nel nome.
// A parita si preferisce un collaboratore attivo.
function _xlsTrovaCollab(nome, lista) {
  const n = _xlsNormaNome(nome).toLowerCase();
  if (!n) return null;
  const pn = n.split(' ');
  const chiave = (x) => x.slice().sort().join(' ');
  const livelli = [
    (cn) => cn === n,
    (cn) => chiave(cn.split(' ')) === chiave(pn),
    (cn) => pn.length > 1 && pn.every((p) => cn.split(' ').includes(p)),
    (cn) => pn.length > 1 && pn.every((p) => cn.includes(p)),
  ];
  for (const ok of livelli) {
    const trovati = (lista || []).filter((c) => ok(_xlsNormaNome(c.nome).toLowerCase()));
    if (trovati.length) return trovati.find((c) => c.attivo !== false) || trovati[0];
  }
  return null;
}

// FABBISOGNO DAL FILE DEL PIANO: sezione PIANIFICAZIONE del foglio del mese (turno nelle
// prime colonne, quantita sotto i giorni, fino a TOT). null = sezione non trovata.
// Usato dall import del fabbisogno e dall import del piano (07.10, richiesta del titolare:
// il fabbisogno si legge anche dal file del piano).
function _xlsFabbisognoDaFile(wb, ym, nGiorni, codiciValidi) {
  const foglioMese = _xlsFoglioMese(wb, ym);
  if (!foglioMese) return null;
  const nuovi = [];
  const ordine = []; // turni nell ordine delle righe del file
  const dati = XLSX.utils.sheet_to_json(wb.Sheets[foglioMese], { header: 1, defval: '', raw: true });
  let rPian = -1;
  for (let r = 0; r < dati.length; r++) {
    if ((dati[r] || []).some((v) => String(v).toUpperCase().includes('PIANIFICAZIONE'))) {
      rPian = r;
      break;
    }
  }
  if (rPian < 0) return null;
  const mappa = _xlsMappaGiorni(dati[rPian], nGiorni) || _xlsCercaMappaGiorni(dati, nGiorni, 0, 8);
  if (!mappa) return null;
  let vuoteConsecutive = 0;
  for (let r = rPian + 1; r < dati.length && vuoteConsecutive < 10; r++) {
    const riga = dati[r] || [];
    let cod = '';
    for (let c = 0; c < 6; c++) {
      const cand = String(riga[c] || '')
        .trim()
        .toUpperCase();
      if (cand === 'TOT') {
        cod = 'TOT';
        break;
      }
      if (codiciValidi.has(cand)) {
        cod = cand;
        break;
      }
    }
    if (cod === 'TOT') break;
    if (!cod) {
      vuoteConsecutive++;
      continue;
    }
    vuoteConsecutive = 0;
    if (!ordine.includes(cod)) ordine.push(cod);
    for (let g = 1; g <= nGiorni; g++) {
      const q = parseInt(riga[mappa[g]]);
      if (!isNaN(q) && q > 0)
        nuovi.push({
          data: ym + '-' + String(g).padStart(2, '0'),
          turno_codice: cod,
          quantita: q,
          reparto_dip: _pianoReparto(),
        });
    }
  }
  return { nuovi: nuovi, ordine: ordine, fonte: 'foglio "' + foglioMese + '" (sezione PIANIFICAZIONE)' };
}
// ORDINE DEI TURNI COME NEL FILE (richiesta del titolare 08/10/2026): le righe del
// fabbisogno seguono l ordine della sezione PIANIFICAZIONE del file Excel. Si salva nella
// colonna ordine dei turni del settore (10, 20, 30...); i turni che il file non ha restano
// dopo, raggruppati come prima. Senza il permesso di modificare i turni resta com era.
async function _pianoOrdineTurniDalFile(codici) {
  if (!codici || !codici.length) return;
  const cambi = [];
  _pianoTurniReparto().forEach((t) => {
    const i = codici.indexOf(String(t.codice).toUpperCase());
    if (i < 0) return;
    const voluto = (i + 1) * 10;
    if (parseInt(t.ordine) !== voluto) cambi.push({ t: t, ordine: voluto });
  });
  if (!cambi.length) return;
  try {
    for (const c of cambi) {
      await secPatch('piano_turni', 'id=eq.' + c.t.id, { ordine: c.ordine });
      c.t.ordine = c.ordine;
    }
    logAzione('Piano: ordine dei turni dal file', _pianoReparto() + ' · ' + cambi.length + ' turni');
  } catch (e) {
    console.warn('ordine dei turni non salvato', e);
  }
}
// FABBISOGNO DEL MESE DOPO L IMPORT DEL PIANO: dal file (sezione PIANIFICAZIONE) o, se il
// file non l ha, dai turni del piano importato (quante persone per turno ogni giorno).
// Mese senza fabbisogno: si carica da solo; diverso da quello del programma: si chiede.
async function _pianoFabbisognoDopoImport(wb, ym) {
  // serve il permesso "Modificare il fabbisogno": senza, l import del piano resta com era
  if (typeof puoAzioniAutoPiano === 'function' && !puoAzioniAutoPiano('fabbisogno')) return;
  const nGiorni = _pianoUltimoGiorno(ym);
  const rep = _pianoReparto();
  const codiciRep = new Set(_pianoTurniReparto().map((t) => t.codice.toUpperCase()));
  const dalFile = _xlsFabbisognoDaFile(wb, ym, nGiorni, codiciRep);
  if (dalFile) await _pianoOrdineTurniDalFile(dalFile.ordine);
  let nuovi = dalFile ? dalFile.nuovi : [];
  let fonte = dalFile ? dalFile.fonte : '';
  const fine = ym + '-' + String(nGiorni).padStart(2, '0');
  const esistenti =
    (await secGet(
      'piano_fabbisogni?data=gte.' + ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + rep + '&limit=3000',
    )) || [];
  if (!nuovi.length) {
    // nessuna sezione nel file: dai turni del piano appena importato, solo se il mese non
    // ha ancora un fabbisogno (non si sostituisce quello impostato a mano)
    if (esistenti.length) return;
    const righe = (await secGet('piano?data=gte.' + ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + rep + '')) || [];
    const conta = {};
    righe.forEach((r) => {
      const c = String(r.codice || '').toUpperCase();
      if (!codiciRep.has(c)) return;
      const k = String(r.data).substring(0, 10) + '|' + c;
      conta[k] = (conta[k] || 0) + 1;
    });
    nuovi = Object.keys(conta).map((k) => ({
      data: k.split('|')[0],
      turno_codice: k.split('|')[1],
      quantita: conta[k],
      reparto_dip: rep,
    }));
    if (!nuovi.length) return;
    if (
      !(await chiediConferma(
        'Il mese ' +
          ym +
          ' (' +
          repartoLabel(rep) +
          ') non ha un fabbisogno e il file non ha la sezione PIANIFICAZIONE.\n\nLo creo dai turni del piano importato (quante persone per turno ogni giorno: ' +
          nuovi.length +
          ' celle)? Serve per generare, migliorare e per l Organico; si corregge poi in Piano > Fabbisogno.',
        { titolo: 'Fabbisogno del mese', ok: 'Crea il fabbisogno' },
      ))
    )
      return;
    fonte = 'turni del piano importato';
  } else if (esistenti.length) {
    const firma = (l) =>
      l
        .map((f) => f.data.substring(0, 10) + '|' + String(f.turno_codice).toUpperCase() + '|' + f.quantita)
        .sort()
        .join(';');
    if (firma(esistenti) === firma(nuovi)) return; // uguale: niente da fare
    if (
      !(await chiediConferma(
        'Il file contiene anche il fabbisogno di ' +
          ym +
          ' (' +
          fonte +
          ', ' +
          nuovi.length +
          ' celle), diverso da quello nel programma (' +
          esistenti.length +
          ' celle).\n\nSostituisco il fabbisogno del programma con quello del file?',
        { titolo: 'Fabbisogno del mese', ok: 'Sostituisci' },
      ))
    )
      return;
  }
  // in un colpo solo: con la rete caduta a meta resta il fabbisogno di prima
  await secSostituisci('piano_fabbisogni', 'data=gte.' + ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + rep, nuovi);
  logAzione('Fabbisogno dal file del piano', ym + ' ' + rep + ' · ' + nuovi.length + ' celle · ' + fonte);
  toast('Fabbisogno di ' + ym + ' caricato: ' + nuovi.length + ' celle (' + fonte + ')', 6000);
}
async function importaFabbisognoExcel(input) {
  if (!_pianoAzioneAutoConsentita('import')) return; // azione automatica: permesso apposito
  if (!_pianoAzioneAutoConsentita('fabbisogno')) return; // scrive il fabbisogno
  if (!(await assicuraLibreria('xlsx'))) return;
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!window.XLSX) {
    toast('Libreria Excel non caricata: controlla la connessione e ricarica');
    return;
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const codiciValidi = new Set(pianoTurniCache.map((t) => t.codice.toUpperCase()));
    const nuovi = [];
    let errori = 0;
    let fonte = '';
    // 1) file REALE (PIANO SLOTS/VALET): foglio del mese + sezione PIANIFICAZIONE
    const foglioMese = _xlsFoglioMese(wb, ym);
    const dalFile = _xlsFabbisognoDaFile(wb, ym, nGiorni, codiciValidi);
    let smartOk = !!dalFile;
    const ordineFile = [];
    if (dalFile) {
      dalFile.nuovi.forEach((x) => nuovi.push(x));
      dalFile.ordine.forEach((x) => ordineFile.push(x));
      fonte = dalFile.fonte;
    }
    // 2) ripiego: formato semplice (prima colonna = turno, colonne = giorni 1..N)
    if (!smartOk) {
      const dati = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      let inizio = 0;
      const prima = String((dati[0] || [])[0] || '').toUpperCase();
      if (prima === 'TURNO' || prima === 'CODICE' || prima === 'SHIFT' || prima === '') inizio = 1;
      for (const riga of dati.slice(inizio)) {
        const cod = String(riga[0] || '')
          .trim()
          .toUpperCase();
        if (!cod) continue;
        if (!codiciValidi.has(cod)) {
          errori++;
          continue;
        }
        if (!ordineFile.includes(cod)) ordineFile.push(cod);
        for (let g = 1; g <= nGiorni; g++) {
          const q = parseInt(riga[g]);
          if (!isNaN(q) && q > 0)
            nuovi.push({
              data: ym + '-' + String(g).padStart(2, '0'),
              turno_codice: cod,
              quantita: q,
              reparto_dip: _pianoReparto(),
            });
        }
      }
      fonte = 'formato semplice (turno + giorni)';
    }
    // l ordine delle righe del file vale anche se le quantita non si leggono
    if (ordineFile.length) {
      await _pianoOrdineTurniDalFile(ordineFile);
      renderPiano();
    }
    if (!nuovi.length) {
      toast(
        'Nessuna quantità riconosciuta nel file' +
          (foglioMese ? '' : ' · manca il foglio del mese selezionato') +
          (errori ? ' (' + errori + ' codici turno sconosciuti)' : ''),
      );
      return;
    }
    const MESI_L = MESI_FULL || [];
    const lbl = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
    if (
      !(await chiediConferma(
        'Importare il fabbisogno di ' +
          lbl +
          '?\n\n• Letto da: ' +
          fonte +
          '\n• ' +
          nuovi.length +
          ' celle da caricare' +
          (errori ? '\n• ' + errori + ' righe con codice turno sconosciuto (saltate)' : '') +
          '\n\nATTENZIONE: il fabbisogno esistente del mese viene SOSTITUITO.',
      ))
    )
      return;
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    await secSostituisci(
      'piano_fabbisogni',
      'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto(),
      nuovi,
    );
    logAzione('Fabbisogno importato', ym + ' · ' + nuovi.length + ' celle');
    toast('Fabbisogno importato: ' + nuovi.length + ' celle');
    renderPiano();
  } catch (e) {
    console.error(e);
    toastErrore('Fabbisogno non importato: ' + ((e && e.message) || e) + '. Il fabbisogno di prima e rimasto.', 10000);
  }
}
// IMPORT PIANO da Excel/CSV (come l'import del foglio PIANO SLOTS in
// Turnivo): prima colonna = collaboratore, colonne successive = giorni
// 1..N con le sigle. Le celle esistenti NON vengono toccate; sigle
// sconosciute e nomi non riconosciuti vengono scartati e conteggiati.
// L'ordine delle righe resta quello predefinito (SUP, BO, poi gli
// altri) e si può sempre riordinare trascinando i nomi.
async function importaPianoExcel(input) {
  if (!_pianoAzioneAutoConsentita('import')) return; // azione automatica: permesso apposito
  if (!(await assicuraLibreria('xlsx'))) return;
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  const ym = _pianoMeseSel;
  let wb;
  try {
    wb = XLSX.read(await file.arrayBuffer(), { bookFiles: true }); // file interni: servono per i colori delle celle
  } catch (e) {
    toast('Errore lettura file piano');
    return;
  }
  const esito = {};
  await _importaPianoDaWb(wb, ym, esito);
  // import annullato dall utente: il mese in corso non si propone
  if (esito.annullato) return;
  // ANCHE IL MESE IN CORSO (07.10, richiesta del titolare): importando il mese dopo, se il
  // file ha anche il foglio del mese in corso (con i cambi fatti nel file), si confronta e,
  // se ci sono differenze, si propone di aggiornarlo con le stesse regole (giorni chiusi,
  // malattie, celle bloccate e altri settori restano come sono)
  const meseOggi = oggiLocale().substring(0, 7);
  if (meseOggi !== ym && _xlsFoglioMese(wb, meseOggi)) {
    const prima = _pianoMeseSel;
    try {
      _pianoMeseSel = meseOggi;
      await renderPiano();
      await _importaPianoDaWb(wb, meseOggi, { meseInCorso: true });
    } finally {
      _pianoMeseSel = prima;
      renderPiano();
    }
  }
}
// COMMENTO DEL FILE CHE BLOCCA LA CELLA: una visita medica (o un controllo medico)
// scritta nel commento della cella diventa un lucchetto con quel motivo, come
// "Blocca questa cella (con motivo)" fatto a mano: scambi, cerca cambio, coperture e
// strumenti automatici non la toccano. Ritorna il motivo o null.
function _pianoMotivoBloccoDaNota(nota) {
  const t = String(nota || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  return /\bvisit[ae]\b|\bmedic[oaie]\b|controll[oi] medic|certificat[oi] medic/i.test(t) ? t.slice(0, 200) : null;
}
// opz.meseInCorso: secondo giro sul mese in corso dello stesso file (si chiede prima)
async function _importaPianoDaWb(wb, ym, opz) {
  opz = opz || {};
  const nGiorni = _pianoUltimoGiorno(ym);
  try {
    const collabs = collaboratoriCache.filter((c) => c.attivo !== false);
    // match nomi robusto: maiuscole/minuscole, ordine parole, refusi tipo 0/O e 1/I
    const trova = (nome) => _xlsTrovaCollab(nome, collabs);
    // layout: file REALE (foglio del mese, giorni da riga seriale, nomi nella
    // colonna con più riscontri) oppure formato semplice (nome + giorni 1..N)
    const foglioMese = _xlsFoglioMese(wb, ym);
    let dati, mappa, colNome, inizio, fonte;
    if (foglioMese) {
      dati = XLSX.utils.sheet_to_json(wb.Sheets[foglioMese], { header: 1, defval: '', raw: true });
      mappa = _xlsCercaMappaGiorni(dati, nGiorni, 0, 8);
    }
    const wsCommenti = foglioMese ? wb.Sheets[foglioMese] : null;
    const coloreCella = foglioMese ? _xlsColoriFoglio(wb, foglioMese) : () => null;
    // colori che le regole di Excel danno alle sigle (per proporli ai turni) e
    // colore che la vecchia lettura dava alla cella (per ripulire i colori sbagliati)
    const coloriSigla = {};
    const coloreLettoPrima = {};
    const commentoCella = (rIdx, cIdx) => {
      if (!wsCommenti) return '';
      try {
        const cel = wsCommenti[XLSX.utils.encode_cell({ r: rIdx, c: cIdx })];
        if (!cel || !cel.c || !cel.c.length) return '';
        // il nome dell autore all inizio ("Musa:" e a capo) si toglie; prima si tagliava
        // tutto fino al primo ":" e una nota con un orario ("Visita medica ore 10:00",
        // "DALLE 14:30") perdeva il testo
        return String(
          cel.c
            .map((x) => {
              let t = String(x.t || '');
              if (x.a && t.startsWith(x.a + ':')) t = t.slice(x.a.length + 1);
              else t = t.replace(/^[^:\n]{1,40}:[ \t]*\r?\n/, '');
              return t;
            })
            .join(' '),
        )
          .replace(/\r/g, '')
          .replace(/\n+/g, ' ')
          .trim();
      } catch (e) {
        return '';
      }
    };
    if (foglioMese && mappa) {
      const primoGiornoCol = mappa[1];
      let rIntest = 0;
      for (let r = 0; r <= 8; r++) if (_xlsMappaGiorni(dati[r], nGiorni)) rIntest = r;
      // colonna nomi = quella a sinistra dei giorni con più collaboratori riconosciuti
      colNome = 1;
      let bestHit = -1;
      for (let c = 0; c < primoGiornoCol; c++) {
        let hit = 0;
        for (let r = rIntest + 1; r < Math.min(dati.length, rIntest + 80); r++) if (trova((dati[r] || [])[c])) hit++;
        if (hit > bestHit) {
          bestHit = hit;
          colNome = c;
        }
      }
      inizio = rIntest + 1;
      fonte = 'foglio "' + foglioMese + '"';
    } else {
      dati = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      mappa = null;
      colNome = 0;
      inizio = 0;
      const prima = String((dati[0] || [])[0] || '').toLowerCase();
      if (!prima || prima.includes('collaborator') || prima.includes('nome')) inizio = 1;
      fonte = 'formato semplice';
    }
    // match anche sui DISATTIVATI (in memoria ci sono solo gli attivi: si leggono dal
    // database, ogni volta, cosi chi e disattivato non viene ricreato come nuovo)
    let inattivi = [];
    try {
      inattivi = ((await secGet('collaboratori?attivo=eq.false&select=id,nome,reparto_dip,attivo')) || []).map((c) =>
        Object.assign({}, c, { attivo: false }),
      );
    } catch (e) {}
    const tuttiCollabs = collaboratoriCache.concat(
      inattivi.filter((x) => !collaboratoriCache.some((c) => c.id === x.id)),
    );
    const trovaTutti = (nome) => _xlsTrovaCollab(nome, tuttiCollabs);
    // nome di un collaboratore NUOVO come e scritto nel file (accenti e apostrofi
    // compresi), con le iniziali maiuscole
    const titolo = (str) =>
      String(str || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/(^|[\s.'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    const righeCollab = []; // {nome, celle:[{g,cod}], stato:'ok'|'riattiva'|'nuovo', funzione, percentuale, ref}
    const saltatiDisattivati = []; // disattivati con soli riposi nel file: righe di riempimento, non si importano
    const nomiOk = new Set();
    let sigleScartate = 0;
    dati.slice(inizio).forEach((riga, idxRiga) => {
      const raw = String(riga[colNome] || '').trim();
      if (!raw || raw.length < 4 || /^\d/.test(raw)) return;
      const celle = [];
      for (let g = 1; g <= nGiorni; g++) {
        const cod = String(riga[mappa ? mappa[g] : g] || '')
          .trim()
          .toUpperCase();
        if (!cod) continue;
        if (!_pianoTurnoInfo(cod) && !_pianoCodiceInfo(cod)) {
          sigleScartate++;
          continue;
        }
        const commento = mappa ? commentoCella(inizio + idxRiga, mappa[g]) : '';
        const cs = mappa ? coloreCella(inizio + idxRiga, mappa[g]) : null;
        if (cs && cs.sfondoRegola) {
          const k = (coloriSigla[cod] = coloriSigla[cod] || {});
          k[cs.sfondo] = (k[cs.sfondo] || 0) + 1;
        }
        // JG (codici con orario): se la nota della cella dice l orario intero
        // ("DALLE 14:30 ALLE 21:30") si prende; altrimenti si aggiunge dopo, con
        // doppio clic sul JG
        const csO = _pianoCodiceInfo(cod);
        const or =
          csO && csO.richiede_orario && commento && typeof _pianoOrarioDaNota === 'function'
            ? _pianoOrarioDaNota(commento)
            : null;
        celle.push({
          g: g,
          cod: cod,
          commento: commento,
          colore: _xlsColoreDaTenere(cod, cs),
          coloreVecchio: cs ? cs.diretto : '',
          ora_inizio: or && or.ini && or.fin ? or.ini : null,
          ora_fine: or && or.ini && or.fin ? or.fin : null,
          // JG con piu fasce nella nota ("dalle 10 alle 12 e dalle 19 alle 3")
          fasce: or && or.fasce && or.fasce.length > 1 ? or.fasce : null,
        });
      }
      const hit = trovaTutti(raw);
      if (hit && hit.attivo !== false) {
        if (!celle.length) return;
        righeCollab.push({ nome: hit.nome, celle: celle, stato: 'ok' });
        nomiOk.add(hit.nome);
      } else if (hit) {
        if (!celle.length) return;
        // disattivato con SOLI riposi nel file: e' la riga di riempimento del
        // foglio HR (es. tutto C dopo che ha smesso), non va importata,
        // altrimenti il collaboratore riappare nel piano con mesi di sole C
        const soloRiposi = celle.every((c) => {
          if (c.cod === 'C' || c.cod === 'V' || c.cod === 'WD') return true;
          const cs = _pianoCodiceInfo(c.cod);
          return !!(cs && cs.is_riposo);
        });
        if (soloRiposi) {
          saltatiDisattivati.push(hit.nome);
          return;
        }
        // DISATTIVATO presente nel file (07.10, richiesta del titolare): resta disattivato e
        // le sue celle non si importano (prima si proponeva di riattivarlo). Per farlo
        // tornare: Impostazioni > Gestione collaboratori
        saltatiDisattivati.push(hit.nome);
        return;
      } else if (celle.length >= 3 && celle.some((c) => c.cod !== 'C')) {
        // collaboratore NUOVO trovato nel file: funzione e % dalle colonne
        // accanto (chi ha solo congedo C non viene creato)
        // Solo nel foglio del piano (colonne dei giorni riconosciute) le due colonne dopo il
        // nome sono funzione e percentuale; nel formato semplice sono gia i giorni 1 e 2 e
        // prima ogni persona nuova diventava jolly HOST. Percentuale come 0.8, 80 o 80%.
        const giorniCol = mappa ? new Set(Object.values(mappa)) : null;
        const colInfo = (k) => (giorniCol && !giorniCol.has(colNome + k) ? riga[colNome + k] : null);
        const fz = String(colInfo(1) || '')
          .trim()
          .toUpperCase();
        const funzioni = _pianoFunzioniDi(_pianoReparto());
        let pct = parseFloat(String(colInfo(2) == null ? '' : colInfo(2)).replace(',', '.'));
        if (pct > 1 && pct <= 100) pct = pct / 100;
        const pctLetta = !isNaN(pct) && pct > 0 && pct <= 1;
        righeCollab.push({
          nome: titolo(raw),
          celle: celle,
          stato: 'nuovo',
          // funzione non riconosciuta: HOST nelle Slot (come prima), vuota negli altri settori
          funzione: funzioni.includes(fz) ? fz : _pianoReparto() === 'slots' ? 'HOST' : '',
          percentuale: pctLetta ? pct : 1,
          // jolly = nel foglio del piano la colonna della percentuale e vuota (come nel file
          // HR); nel formato semplice non si sa: fisso al 100%, da controllare nella scheda
          isJolly: !!giorniCol && !pctLetta,
          daControllare: !giorniCol || !funzioni.includes(fz),
        });
      }
    });
    const nuoviCollab = righeCollab.filter((r) => r.stato === 'nuovo');
    const nuove = [];
    // FINE CONTRATTO: dopo l ultimo giorno di lavoro le celle del file non si importano
    const dopoFine = {}; // nome -> numero di celle saltate
    righeCollab.forEach((rc) => {
      const fine = typeof _pianoFineRapporto === 'function' ? _pianoFineRapporto(rc.nome) : '';
      if (!fine) return;
      const prima = rc.celle.length;
      rc.celle = rc.celle.filter((c) => ym + '-' + String(c.g).padStart(2, '0') <= fine);
      if (rc.celle.length < prima) dopoFine[rc.nome] = prima - rc.celle.length;
    });
    righeCollab.forEach((rc) =>
      rc.celle.forEach((c) => {
        coloreLettoPrima[rc.nome + '|' + ym + '-' + String(c.g).padStart(2, '0')] = c.coloreVecchio || '';
        nuove.push({
          collaboratore: rc.nome,
          data: ym + '-' + String(c.g).padStart(2, '0'),
          codice: c.cod,
          protetto: true,
          generato: false,
          commento: c.commento || null,
          motivo_blocco: _pianoMotivoBloccoDaNota(c.commento),
          colore: c.colore || null,
          ora_inizio: c.ora_inizio,
          ora_fine: c.ora_fine,
          fasce: c.fasce || null,
          reparto_dip: _pianoReparto(),
        });
      }),
    );
    if (!nuove.length) {
      toast('Nessuna cella riconosciuta nel file');
      return;
    }
    const MESI_L = MESI_FULL || [];
    const lbl = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
    // CONFRONTO CON IL PIANO: il file aggiornato deve poter correggere le celle
    // gia presenti (prima venivano aggiunte solo le celle nuove e le correzioni
    // del file si perdevano senza avviso). Restano com erano solo i casi in cui
    // il file non puo sapere di piu del programma.
    const rep = _pianoReparto();
    const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7);
    const nomiFile = [...new Set(nuove.map((x) => x.collaboratore))];
    const esistenti =
      (await secGet(
        'piano?collaboratore=in.(' +
          nomiFile.map((n) => encodeURIComponent(n)).join(',') +
          ')&data=gte.' +
          ym +
          '-01&data=lte.' +
          ym +
          '-' +
          String(nGiorni).padStart(2, '0'),
      )) || [];
    const perChiave = {};
    esistenti.forEach((r) => (perChiave[r.collaboratore + '|' + String(r.data).substring(0, 10)] = r));
    const MAL = ['M', 'M1', 'I', 'I1'];
    const nuoveCelle = [];
    const cambiate = [];
    const tenute = { malattia: [], chiuso: [], bloccata: [], altroSettore: [] };
    let uguali = 0;
    const coloriDiversi = []; // stessa sigla, colore del file diverso da quello della cella nel piano
    // colore che la cella deve avere dopo l import (grassetto e corsivo restano):
    // - il colore che Excel mostra davvero, se e diverso da quello della sigla;
    // - un colore messo da un import di prima che leggeva solo il colore dato a
    //   mano, quando nel file una regola lo copre (Excel non lo mostra), si toglie
    //   (es. V con verde sotto: Excel le fa blu);
    // - un colore dato nel programma resta.
    const coloreVoluto = (r, x) => {
      const ora = r.colore || '';
      const st = _stileCella(ora);
      if (x.colore) {
        const n = _stileCella(x.colore);
        st.c = n.c;
        st.t = n.t;
      } else {
        const vecchio = coloreLettoPrima[x.collaboratore + '|' + x.data];
        if (!vecchio || ora.split('|')[0] !== vecchio.split('|')[0]) return ora;
        st.c = '';
        if (_stileCella(vecchio).t === st.t) st.t = '';
      }
      const nuovo = _stileStr(st) || '';
      // stesso colore scritto in modo diverso ('#FFFF00' e '#FFFF00|'): non cambia
      return nuovo === (_stileStr(_stileCella(ora)) || '') ? ora : nuovo;
    };
    const orariNuovi = []; // JG gia nel piano senza orario, con l orario nella nota del file
    const lucchettiNuovi = []; // stessa sigla, nel file un commento di visita medica: si blocca
    nuove.forEach((x) => {
      const r = perChiave[x.collaboratore + '|' + x.data];
      if (!r) {
        nuoveCelle.push(x);
        return;
      }
      const cod = String(r.codice || '').toUpperCase();
      if (cod === x.codice) {
        // JG gia nel piano senza orario: l orario della nota del file si aggiunge
        if (x.ora_inizio && !r.ora_inizio && (r.reparto_dip || 'slots') === rep) orariNuovi.push({ riga: r, nuovo: x });
        if (x.motivo_blocco && !r.motivo_blocco && (r.reparto_dip || 'slots') === rep)
          lucchettiNuovi.push({ riga: r, nuovo: x });
        const voluto = coloreVoluto(r, x);
        if (
          voluto !== (r.colore || '') &&
          (r.reparto_dip || 'slots') === rep &&
          !(_pianoGiornoBloccato(x.data) && !_pianoGiornoSbloccato(x.data))
        )
          coloriDiversi.push({ riga: r, nuovo: x, colore: voluto || null });
        else uguali++;
        return;
      }
      const voce = x.collaboratore + ' ' + gg(x.data) + ': ' + cod + ' (file ' + x.codice + ')';
      // cella scritta dal piano di un altro settore: la decide quel settore
      if ((r.reparto_dip || 'slots') !== rep) tenute.altroSettore.push(voce);
      // malattia registrata (dal Diario o a mano): vale la malattia, non il turno del file
      else if (MAL.includes(cod) && !MAL.includes(x.codice)) tenute.malattia.push(voce);
      // giorno chiuso: si corregge solo sbloccandolo, con motivo
      else if (_pianoGiornoBloccato(x.data) && !_pianoGiornoSbloccato(x.data)) tenute.chiuso.push(voce);
      // cella bloccata con un motivo (es. C dedicato alle vacanze)
      else if (r.motivo_blocco) tenute.bloccata.push(voce + ' · ' + r.motivo_blocco);
      else cambiate.push({ riga: r, nuovo: x });
    });
    // CELLE TOLTE NEL FILE (decisione del 07.10): una cella che nel file e vuota, per una
    // persona presente nel file e in un giorno in cui il file ha dati, si svuota anche nel
    // programma (prima restava senza avviso). Restano: malattie, ND, congedi non pagati,
    // celle con lucchetto o compleanno, vacanze, giorni chiusi, riposi messi dal programma
    // (C della bozza e attorno alle vacanze) e celle di altri settori.
    const svuotate = [];
    {
      const fileChiave = new Set(nuove.map((x) => x.collaboratore + '|' + x.data));
      const giorniFile = new Set(nuove.map((x) => x.data));
      esistenti.forEach((r) => {
        const d = String(r.data).substring(0, 10);
        if (!giorniFile.has(d) || fileChiave.has(r.collaboratore + '|' + d)) return;
        if ((r.reparto_dip || 'slots') !== rep) return;
        const cod = String(r.codice || '').toUpperCase();
        if (!cod || MAL.includes(cod) || cod === 'ND' || cod === 'CNP' || /^V/.test(cod)) return;
        if (_pianoCellaRiservata(r) || /^Piano vacanze/.test(String(r.commento || ''))) return;
        if (_pianoGiornoBloccato(d) && !_pianoGiornoSbloccato(d)) return;
        if (r.generato && !_pianoTurnoInfo(cod)) return;
        svuotate.push(r);
      });
    }
    // colori delle sigle: quello che le regole di Excel danno piu spesso alla
    // sigla, se diverso dal colore del turno nel programma (lo cambia l admin,
    // come nella tabella dei turni)
    const coloriTurni = [];
    Object.keys(coloriSigla).forEach((cod) => {
      const t = _pianoTurniReparto().find((x) => x.codice === cod);
      if (!t) return;
      const col = Object.entries(coloriSigla[cod]).sort((a, b) => b[1] - a[1])[0][0];
      if (!_xlsColoriVicini(col, t.colore)) coloriTurni.push({ turno: t, colore: col });
    });
    const nTenute = Object.values(tenute).reduce((t, l) => t + l.length, 0);
    const righeTenute = [
      [tenute.malattia, 'malattie registrate (vale il Diario)'],
      [tenute.chiuso, 'giorni chiusi (si sbloccano con motivo)'],
      [tenute.bloccata, 'celle bloccate con motivo'],
      [tenute.altroSettore, 'celle del piano di un altro settore'],
    ]
      .filter((x) => x[0].length)
      .map((x) => '   ' + x[0].length + ' ' + x[1] + (x[0].length <= 3 ? ': ' + x[0].join('; ') : ''));
    // mese in corso: se nel file e uguale al programma non si chiede niente
    if (opz.meseInCorso && !nuoveCelle.length && !cambiate.length && !lucchettiNuovi.length && !svuotate.length) {
      toast(lbl + ' nel file e uguale al piano: niente da aggiornare');
      return;
    }
    const scelta = await chiediModulo(
      (opz.meseInCorso
        ? 'Il file contiene anche il MESE IN CORSO (' + lbl + ') con differenze dal piano. Aggiorno anche ' + lbl + '?'
        : 'Importare il piano di ' + lbl + '?') +
        '\n\n• Letto da: ' +
        fonte +
        '\n• ' +
        nomiOk.size +
        ' collaboratori riconosciuti' +
        '\n• ' +
        nuoveCelle.length +
        ' celle nuove' +
        '\n• ' +
        cambiate.length +
        ' celle diverse dal piano' +
        (cambiate.length
          ? ': ' +
            cambiate
              .slice(0, 8)
              .map((c) => c.nuovo.collaboratore + ' ' + gg(c.nuovo.data) + ' ' + c.riga.codice + ' > ' + c.nuovo.codice)
              .join('; ') +
            (cambiate.length > 8 ? ' e altre ' + (cambiate.length - 8) : '')
          : '') +
        (coloriDiversi.length
          ? '\n• ' + coloriDiversi.length + ' celle con il colore da allineare al file (stessa sigla)'
          : '') +
        (orariNuovi.length ? '\n• ' + orariNuovi.length + ' JG con l orario preso dalla nota del file' : '') +
        (svuotate.length
          ? '\n• ' +
            svuotate.length +
            ' celle vuote nel file, da svuotare anche nel piano: ' +
            svuotate
              .slice(0, 10)
              .map((r) => r.collaboratore + ' ' + gg(String(r.data).substring(0, 10)) + ' ' + r.codice)
              .join('; ') +
            (svuotate.length > 10 ? ' e altre ' + (svuotate.length - 10) : '')
          : '') +
        (lucchettiNuovi.length || nuoveCelle.some((x) => x.motivo_blocco) || cambiate.some((c) => c.nuovo.motivo_blocco)
          ? '\n• ' +
            (lucchettiNuovi.length +
              nuoveCelle.filter((x) => x.motivo_blocco).length +
              cambiate.filter((c) => c.nuovo.motivo_blocco).length) +
            ' celle bloccate con lucchetto per il commento del file (visita medica): ' +
            lucchettiNuovi
              .map((c) => c.nuovo)
              .concat(
                nuoveCelle.filter((x) => x.motivo_blocco),
                cambiate.filter((c) => c.nuovo.motivo_blocco).map((c) => c.nuovo),
              )
              .slice(0, 6)
              .map((x) => x.collaboratore + ' ' + gg(x.data))
              .join('; ')
          : '') +
        (coloriTurni.length
          ? '\n• Colore delle sigle nel file diverso dal programma: ' +
            coloriTurni.map((c) => c.turno.codice + ' ' + (c.turno.colore || 'bianco') + ' > ' + c.colore).join('; ') +
            (isAdmin() ? '' : ' (li cambia l amministratore nella tabella dei turni)')
          : '') +
        '\n• ' +
        uguali +
        ' celle già uguali' +
        (nTenute ? '\n• ' + nTenute + ' celle diverse che restano come sono:\n' + righeTenute.join('\n') : '') +
        (sigleScartate ? '\n• ' + sigleScartate + ' sigle sconosciute scartate' : '') +
        (nuoviCollab.length
          ? '\n• NUOVI collaboratori da creare: ' +
            nuoviCollab
              .map(
                (x) =>
                  x.nome +
                  ' (' +
                  x.funzione +
                  ', ' +
                  (x.isJolly ? 'jolly' : Math.round(x.percentuale * 100) + '%') +
                  (x.daControllare ? ', da controllare nella scheda' : '') +
                  ')',
              )
              .join(', ')
          : '') +
        (saltatiDisattivati.length
          ? '\n• Disattivati presenti nel file: restano disattivati, le loro celle non si importano: ' +
            saltatiDisattivati.join(', ')
          : '') +
        (Object.keys(dopoFine).length
          ? '\n• Dopo la fine del contratto (celle non importate): ' +
            Object.keys(dopoFine)
              .map((n) => n + ' (' + dopoFine[n] + ')')
              .join(', ')
          : '') +
        '\n• Ordine dei collaboratori nel calendario: come nel file' +
        '\n\nSi può annullare con Annulla del piano.',
      [
        {
          titolo: 'Come importare',
          campi: [
            {
              id: 'modo',
              tipo: 'scelta',
              valore: 'aggiorna',
              opzioni: [
                {
                  valore: 'aggiorna',
                  etichetta:
                    'Aggiorna dal file: ' +
                    cambiate.length +
                    ' celle corrette, ' +
                    nuoveCelle.length +
                    ' nuove' +
                    (svuotate.length ? ', ' + svuotate.length + ' svuotate' : '') +
                    (coloriDiversi.length ? ', ' + coloriDiversi.length + ' colori' : ''),
                },
                { valore: 'nuove', etichetta: 'Solo le ' + nuoveCelle.length + ' celle nuove' },
              ],
            },
          ],
        },
      ].concat(
        coloriTurni.length && isAdmin()
          ? [
              {
                titolo: 'Colore delle sigle',
                nota: 'Il colore della sigla vale per tutte le sue celle, in tutti i mesi del settore. Si cambia di nuovo dalla tabella dei turni.',
                campi: [
                  {
                    id: 'colsigle',
                    tipo: 'scelta',
                    valore: 'file',
                    opzioni: [
                      { valore: 'file', etichetta: 'Come nel file (' + coloriTurni.length + ' sigle)' },
                      { valore: 'tieni', etichetta: 'Tieni i colori del programma' },
                    ],
                  },
                ],
              },
            ]
          : [],
      ),
      { titolo: 'Importa piano da Excel', ok: 'Importa' },
    );
    if (!scelta) {
      opz.annullato = true; // chi chiama non propone il mese in corso
      return;
    }
    const aggiorna = scelta.modo !== 'nuove';
    // CONTROLLO PRIMA DI SCRIVERE (v374), come il file Excel di controllo del titolare:
    // riposo minimo e giorni di fila, con la fine del mese prima, sul mese come sara
    // DOPO l import (celle del file, celle che restano, scelta aggiorna/solo nuove)
    let erroriBase = [];
    let correggiDopo = false;
    {
      const finale = {};
      const metti = (r) =>
        ((finale[r.collaboratore] = finale[r.collaboratore] || {})[String(r.data).substring(0, 10)] = {
          cod: r.codice,
          ini: r.ora_inizio,
          fin: r.ora_fine,
        });
      const d0 = new Date(ym + '-01T12:00:00');
      d0.setDate(d0.getDate() - 14);
      const primaMese =
        (await secGet(
          'piano?collaboratore=in.(' +
            nomiFile.map((n) => encodeURIComponent(n)).join(',') +
            ')&data=gte.' +
            dataLocaleISO(d0) +
            '&data=lt.' +
            ym +
            '-01',
        )) || [];
      primaMese.forEach((r) => metti(r));
      (esistenti || []).forEach((r) => metti(r));
      const sostituite = new Set((aggiorna ? cambiate : []).map((c) => c.riga.id));
      const esistentePer = {};
      (esistenti || []).forEach((r) => (esistentePer[r.collaboratore + '|' + String(r.data).substring(0, 10)] = r));
      nuove.forEach((x) => {
        const r = esistentePer[x.collaboratore + '|' + x.data];
        if (!r || sostituite.has(r.id)) metti(x);
      });
      erroriBase = _pianoControlloBase(ym, finale);
      if (erroriBase.length) {
        const persone = new Set(erroriBase.map((e) => e.nome)).size;
        const sc = await _pianoFinestraControllo(
          'Controllo del piano prima dell import',
          lbl +
            ' (' +
            repartoLabel(_pianoReparto()) +
            '): ' +
            erroriBase.length +
            (erroriBase.length === 1 ? ' errore' : ' errori') +
            ' di riposo o giorni di fila (' +
            persone +
            (persone === 1 ? ' persona' : ' persone') +
            '), contando anche la fine del mese prima. Nessuna cella e ancora stata scritta.',
          erroriBase,
        );
        if (!sc) {
          opz.annullato = true; // chi chiama non propone il mese in corso
          toast('Import annullato: il piano non e stato modificato');
          return;
        }
        correggiDopo = sc === 'correggi';
      }
    }
    if (scelta.colsigle === 'file' && isAdmin())
      for (const c of coloriTurni) {
        const prima = c.turno.colore || '';
        await secPatch('piano_turni', 'id=eq.' + c.turno.id, { colore: c.colore });
        c.turno.colore = c.colore;
        logAzione('Colore sigla da import piano', c.turno.codice + ': ' + (prima || 'bianco') + ' > ' + c.colore);
      }
    for (const nc of nuoviCollab) {
      const nuovo = {
        nome: nc.nome,
        attivo: true,
        reparto_dip: _pianoReparto(),
        funzione: nc.funzione,
        percentuale: nc.percentuale,
        is_jolly: !!nc.isJolly,
      };
      // turni bloccati di partenza (es. S1, S3): non a chi nel file fa gia turni di
      // tutti i reparti richiesti (sala, reception, cassa)
      if (
        typeof _pianoRequisitiMancanti === 'function' &&
        pianoBloccatiDiPartenza(_pianoReparto()) &&
        !_pianoRequisitiMancanti(
          null,
          _pianoReparto(),
          (nc.celle || []).map((x) => x.cod),
        ).length
      )
        nuovo.turni_bloccati = null;
      const creato = await secPost('collaboratori', nuovo);
      if (creato && creato[0]) collaboratoriCache.push(creato[0]);
      logAzione('Collaboratore creato da import piano', nc.nome + ' (' + nc.funzione + ')');
    }
    // proposta di disattivazione: chi è attivo ma NON compare nel file,
    // oppure compare ma ha SOLO congedo (tutto il mese a C, nessun turno
    // né malattia)
    const lavoranti = new Set(righeCollab.filter((x) => x.celle.some((c) => c.cod !== 'C')).map((x) => x.nome));
    // solo se il file e davvero il piano del mese: con un mese vuoto o a meta nel
    // file (es. novembre non ancora compilato) proponeva di disattivare tutti
    const attiviSettore = collaboratoriCache.filter(
      (c) => c.attivo !== false && (c.reparto_dip || 'slots') === _pianoReparto(),
    ).length;
    const fileCompleto = lavoranti.size >= Math.max(3, attiviSettore * 0.6);
    const daDisattivare = !fileCompleto
      ? []
      : collaboratoriCache.filter(
          (c) =>
            c.attivo !== false &&
            (c.reparto_dip || 'slots') === _pianoReparto() &&
            !lavoranti.has(c.nome) &&
            !String(c.reparti_extra || '').trim(), // i multi-reparto lavorano altrove
        );
    if (!fileCompleto && lavoranti.size && !opz.meseInCorso)
      toast('Nel file il mese e compilato solo in parte: nessuna proposta di disattivare collaboratori');
    // chi non e nel file: FINE CONTRATTO all ultimo giorno del mese prima (la storia resta),
    // non piu disattivato del tutto; chi ha gia una fine contratto non si propone
    const ultimoPrima = (() => {
      const d = new Date(ym + '-01T12:00:00');
      d.setDate(d.getDate() - 1);
      return dataLocaleISO(d);
    })();
    const daFermare = opz.meseInCorso ? [] : daDisattivare.filter((c) => !c.data_fine_rapporto);
    if (
      daFermare.length &&
      (await chiediConferma(
        'Questi collaboratori attivi NON hanno turni nel file (assenti o con solo congedo C). Segno la fine del contratto al ' +
          ultimoPrima.split('-').reverse().join('.') +
          '?\n\n' +
          daFermare.map((x) => '• ' + x.nome).join('\n') +
          '\n\nFino a quel giorno resta tutto (piano, ore, storico); dal giorno dopo non sono più nel piano e nelle ore dovute. La data si cambia in Gestione collaboratori > Disattiva o nella scheda > Storico HR. Annulla = restano come sono.',
      ))
    ) {
      for (const c of daFermare) {
        await secPatch('collaboratori', 'id=eq.' + c.id, { data_fine_rapporto: ultimoPrima });
        c.data_fine_rapporto = ultimoPrima;
        if (typeof _insertHrEvento === 'function')
          await _insertHrEvento(
            c.nome,
            'cessazione',
            'Fine contratto: ultimo giorno ' +
              ultimoPrima.split('-').reverse().join('.') +
              ' (assente dal piano ' +
              ym +
              ')',
            ultimoPrima,
          );
        logAzione(
          'Fine contratto da import piano',
          c.nome + ' · ultimo giorno ' + ultimoPrima + ' (assente dal file ' + ym + ')',
        );
      }
    }
    // fotografia per Annulla, poi celle nuove e celle corrette
    // ORDINE DEI COLLABORATORI come nel file (nel settore del piano importato):
    // chi non e nel file resta dopo, nell ordine che aveva
    {
      const rep = _pianoReparto();
      const ordineFile = [...new Set(righeCollab.map((x) => x.nome))];
      const tutto = window._pianoOrdineCollab || {};
      const prima = Array.isArray(tutto[rep]) ? tutto[rep] : [];
      const nuovo = ordineFile.concat(prima.filter((n) => !ordineFile.includes(n)));
      if (ordineFile.length && nuovo.join('|') !== prima.join('|')) {
        const copia = Object.assign({}, tutto, { [rep]: nuovo });
        if (await salvaImp('piano_ordine_collab', JSON.stringify(copia))) {
          window._pianoOrdineCollab = copia;
          logAzione('Piano: ordine collaboratori dal file', rep + ' · ' + ym);
        }
      }
    }
    _pianoUndoSnap('importa piano ' + ym);
    const r = nuoveCelle.length
      ? await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuoveCelle })
      : { inserite: 0 };
    let aggiornate = 0;
    if (aggiorna) {
      const op = getOperatore();
      const ora = new Date().toISOString();
      for (let i = 0; i < cambiate.length; i += 10)
        await Promise.all(
          cambiate.slice(i, i + 10).map(async (c) => {
            const patch = {
              codice: c.nuovo.codice,
              protetto: true,
              generato: false,
              ora_inizio: c.nuovo.ora_inizio || null,
              fasce: c.nuovo.fasce || null,
              ora_fine: c.nuovo.ora_fine || null,
              operatore: op,
              updated_at: ora,
            };
            // la nota del file sostituisce quella vecchia solo se c e
            if (c.nuovo.commento) patch.commento = c.nuovo.commento;
            if (c.nuovo.motivo_blocco) patch.motivo_blocco = c.nuovo.motivo_blocco;
            const voluto = coloreVoluto(c.riga, c.nuovo);
            if (voluto !== (c.riga.colore || '')) patch.colore = voluto || null;
            await secPatch('piano', 'id=eq.' + c.riga.id, patch);
            aggiornate++;
          }),
        );
      for (const c of orariNuovi)
        await secPatch('piano', 'id=eq.' + c.riga.id, {
          ora_inizio: c.nuovo.ora_inizio,
          ora_fine: c.nuovo.ora_fine,
          fasce: c.nuovo.fasce || null,
          operatore: op,
          updated_at: ora,
        });
      for (const r of svuotate) await secDel('piano', 'id=eq.' + r.id);
      for (const c of lucchettiNuovi)
        await secPatch('piano', 'id=eq.' + c.riga.id, {
          motivo_blocco: c.nuovo.motivo_blocco,
          commento: c.nuovo.commento || c.riga.commento || null,
          operatore: op,
          updated_at: ora,
        });
      for (let i = 0; i < coloriDiversi.length; i += 10)
        await Promise.all(
          coloriDiversi
            .slice(i, i + 10)
            .map((c) => secPatch('piano', 'id=eq.' + c.riga.id, { colore: c.colore, operatore: op, updated_at: ora })),
        );
    }
    const inserite = (r && r.inserite) || 0;
    logAzione(
      'Piano importato da Excel',
      ym +
        ' · ' +
        inserite +
        ' nuove, ' +
        aggiornate +
        ' corrette, ' +
        (aggiorna ? svuotate.length : 0) +
        ' svuotate, ' +
        (aggiorna ? coloriDiversi.length : 0) +
        ' colori, ' +
        uguali +
        ' uguali, ' +
        nTenute +
        ' tenute (malattie, giorni chiusi, bloccate, altri settori)' +
        (aggiorna ? '' : ' · modo: solo nuove'),
    );
    toast(
      'Piano importato: ' +
        inserite +
        ' celle nuove' +
        (aggiorna ? ', ' + aggiornate + ' corrette' : '') +
        (nTenute ? ', ' + nTenute + ' tenute come erano' : ''),
    );
    // il fabbisogno del mese dallo stesso file (o dai turni importati se il file non l ha)
    try {
      if (!opz.meseInCorso) await _pianoFabbisognoDopoImport(wb, ym);
    } catch (e) {
      toastErrore('Fabbisogno non caricato dal file: ' + ((e && e.message) || e));
    }
    _pianoViolCelle = {};
    _pianoViolLista = null;
    const fatto = renderPiano();
    setTimeout(async () => {
      await _pianoProponiCertificazioniBulk(
        nuove.map((x) => ({ nome: x.collaboratore, codice: x.codice, commento: x.commento || '' })),
      );
      await controllaFormazioniCompletate(true);
      // CONTROLLO DELLE REGOLE del mese importato (ogni settore): il file e il piano
      // ufficiale e si importa com e; qui si dice subito cosa non rispetta le regole
      try {
        await fatto;
      } catch (e) {}
      // correzioni proposte per riposi e giorni di fila, se scelte prima dell import
      if (correggiDopo && typeof pianoProponiCorrezioniImport === 'function')
        await pianoProponiCorrezioniImport(ym, erroriBase);
      if (typeof pianoRiepilogoViolazioni === 'function')
        await pianoRiepilogoViolazioni(ym, 'Controllo del piano importato');
    }, 400);
  } catch (e) {
    console.error(e);
    toast('Errore lettura file piano');
  }
}

// come fabbisogno.elimina di Turnivo: cancella tutto il fabbisogno del mese
async function eliminaFabbisognoMese() {
  if (!_pianoAzioneAutoConsentita('cancella')) return; // azione automatica: permesso apposito
  if (!_pianoAzioneAutoConsentita('fabbisogno')) return; // scrive il fabbisogno
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const n = _pianoFabbCache.length;
  if (!n) {
    toast('Nessun fabbisogno da eliminare per ' + ym);
    return;
  }
  if (
    !(await chiediConferma(
      'Eliminare TUTTO il fabbisogno di ' +
        ym +
        ' (' +
        repartoLabel(_pianoReparto()) +
        ')?\n\n' +
        n +
        ' celle verranno rimosse. Il piano già generato NON viene toccato.',
    ))
  )
    return;
  try {
    const nG = _pianoUltimoGiorno(ym);
    await secDel(
      'piano_fabbisogni',
      'data=gte.' +
        ym +
        '-01&data=lte.' +
        ym +
        '-' +
        String(nG).padStart(2, '0') +
        '&reparto_dip=eq.' +
        _pianoReparto(),
    );
    logAzione('Fabbisogno eliminato', ym + ' · ' + n + ' celle');
    toast('Fabbisogno eliminato: ' + n + ' celle');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione fabbisogno');
  }
}
// PROFILO DI UN GIORNO per il fabbisogno: quello che conta non e' il numero del
// giorno ma che giornata e'. Un venerdi ha piu' gente di un martedi, la domenica
// ha il suo assetto, e i festivi seguono la domenica mentre le vigilie seguono
// il sabato perche' si chiude alle 5.
function _pianoProfiloGiorno(dstr) {
  const fest = pianoFestiviCache.find((f) => f.data === dstr);
  if (fest) return 'FESTIVO';
  const dow = new Date(dstr + 'T12:00:00').getDay();
  if (dow === 0) return 'FESTIVO'; // la domenica e il festivo hanno lo stesso assetto
  const ch = typeof _pianoChiusuraGiorno === 'function' ? _pianoChiusuraGiorno(dstr) : null;
  if (ch && ch.marcatore) return 'CHIUSURA5'; // venerdi, sabato, vigilie di festivita
  if (dow === 5 || dow === 6) return 'CHIUSURA5';
  return 'D' + dow; // lunedi..giovedi restano distinti
}
async function copiaFabbisognoMese() {
  // il fabbisogno si modifica solo con il permesso Modificare il fabbisogno (v359)
  if (!_pianoAzioneAutoConsentita('fabbisogno')) return;
  if (!puoGestirePiano()) return;
  const p = _pianoMeseSel.split('-');
  const dPrec = new Date(parseInt(p[0]), parseInt(p[1]) - 2, 15);
  const ymPrec = dPrec.getFullYear() + '-' + String(dPrec.getMonth() + 1).padStart(2, '0');
  const daP = ymPrec + '-01';
  const aP = ymPrec + '-' + String(_pianoUltimoGiorno(ymPrec)).padStart(2, '0');
  const prec =
    (await secGet(
      'piano_fabbisogni?data=gte.' + daP + '&data=lte.' + aP + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
  if (!prec.length) {
    toast('Nessun fabbisogno nel mese precedente (' + ymPrec + ')');
    return;
  }
  // I FESTIVI DEI DUE MESI: servono a riconoscere i giorni che seguono la
  // domenica e le vigilie che chiudono alle 5.
  await _pianoCaricaFestivita(parseInt(p[0]));
  await _pianoCaricaFestivita(dPrec.getFullYear());
  const nGiorni = _pianoUltimoGiorno(_pianoMeseSel);
  const giaPresenti = new Set(_pianoFabbCache.map((f) => f.data + '|' + f.turno_codice));
  // MODELLO PER TIPO DI GIORNATA, non per numero del giorno. Copiare il 7 sul 7
  // spostava i venerdi sui lunedi e faceva saltare tutto: qui si prende, per
  // ogni tipo di giornata, l'assetto piu' ricorrente del mese di partenza.
  const perData = {};
  prec.forEach((f) => {
    perData[f.data] = perData[f.data] || {};
    perData[f.data][f.turno_codice] = f.quantita;
  });
  const perProfilo = {};
  Object.keys(perData).forEach((d) => {
    const pr = _pianoProfiloGiorno(d);
    const firma = JSON.stringify(
      Object.keys(perData[d])
        .sort()
        .map((k) => k + ':' + perData[d][k]),
    );
    perProfilo[pr] = perProfilo[pr] || {};
    perProfilo[pr][firma] = perProfilo[pr][firma] || { n: 0, celle: perData[d] };
    perProfilo[pr][firma].n++;
  });
  const modello = {};
  Object.keys(perProfilo).forEach((pr) => {
    let best = null;
    Object.keys(perProfilo[pr]).forEach((f) => {
      if (!best || perProfilo[pr][f].n > best.n) best = perProfilo[pr][f];
    });
    if (best) modello[pr] = best.celle;
  });
  const nuovi = [];
  const riepilogo = {};
  for (let g = 1; g <= nGiorni; g++) {
    const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
    const pr = _pianoProfiloGiorno(dstr);
    const m = modello[pr];
    riepilogo[pr] = (riepilogo[pr] || 0) + 1;
    if (!m) continue;
    Object.keys(m).forEach((cod) => {
      if (giaPresenti.has(dstr + '|' + cod)) return;
      nuovi.push({ data: dstr, turno_codice: cod, quantita: m[cod], reparto_dip: _pianoReparto() });
    });
  }
  if (!nuovi.length) {
    toast('Fabbisogno già presente per tutte le celle del mese');
    return;
  }
  const nomiProfilo = {
    FESTIVO: 'domeniche e festivi',
    CHIUSURA5: 'venerdì, sabato e vigilie (chiusura alle 5)',
    D1: 'lunedi',
    D2: 'martedi',
    D3: 'mercoledi',
    D4: 'giovedi',
  };
  const senzaModello = Object.keys(riepilogo).filter((k) => !modello[k]);
  if (
    !(await chiediConferma(
      'Copiare il fabbisogno da ' +
        ymPrec +
        ' a ' +
        _pianoMeseSel +
        '?\n\nNon si copia giorno per giorno ma per tipo di giornata, così i venerdì\nrestano venerdì: ' +
        Object.keys(riepilogo)
          .filter((k) => modello[k])
          .map((k) => (nomiProfilo[k] || k) + ' (' + riepilogo[k] + ')')
          .join(', ') +
        '.\nI festivi prendono l assetto della domenica, le vigilie quello del sabato.\n\n' +
        nuovi.length +
        ' celle da scrivere. Le celle già impostate non vengono toccate.' +
        (senzaModello.length
          ? '\n\nAttenzione: per ' +
            senzaModello.map((k) => nomiProfilo[k] || k).join(', ') +
            ' non c e un giorno di riferimento nel mese precedente: restano vuoti.'
          : ''),
    ))
  )
    return;
  try {
    for (let i = 0; i < nuovi.length; i += 10) {
      await Promise.all(nuovi.slice(i, i + 10).map((f) => secPost('piano_fabbisogni', f)));
    }
    logAzione(
      'Piano: fabbisogno copiato per tipo di giornata',
      ymPrec + ' → ' + _pianoMeseSel + ' (' + nuovi.length + ' celle)',
    );
    toast('Fabbisogno copiato per tipo di giornata (' + nuovi.length + ' celle)');
    renderPiano();
  } catch (e) {
    toast('Errore copia fabbisogno');
  }
}

// ---- Card TURNI (admin) ----
// ===== CONTROLLO DEL SUPPLEMENTO NOTTURNO NELLE DURATE DEI TURNI =====
// Chi lavora nella fascia notturna matura il 10% di quelle ore in piu': il
// supplemento e' compreso nella DURATA del turno, quindi entra da solo nelle
// ore del mese e nel saldo. Qui si verifica turno per turno che la durata
// dichiarata corrisponda a "ore effettive + 10% delle ore notturne".
function _pianoDurataAttesa(t) {
  const i = _pianoOra(t.ora_inizio);
  let f = _pianoOra(t.ora_fine);
  if (i == null || f == null) return null;
  if (f <= i) f += 24;
  const eff = f - i;
  const nott = _pianoOreNotturneTurno(t);
  return Math.round((eff + _pianoNotteRecupero(nott)) * 100) / 100;
}
// Ore decimali scritte come le legge una persona: 8.5 -> "8h30".
// Serve a controllare i turni in sessantesimi, che e' come si ragiona sui turni.
function _pianoOreHm(ore) {
  const v = parseFloat(ore);
  if (isNaN(v)) return '-';
  const segno = v < 0 ? '-' : '';
  const min = Math.round(Math.abs(v) * 60);
  return segno + Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
}
// Durata dall'orologio: differenza fra entrata e uscita, senza supplementi
function _pianoDurataOrologio(t) {
  const e = _pianoOra(t.ora_inizio);
  const u = _pianoOra(t.ora_fine);
  if (e == null || u == null) return null;
  return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
}
async function pianoVerificaDurateNotte() {
  if (!isAdmin()) return;
  const tutti = pianoTurniCache.filter((t) => t.attivo !== false && t.ora_inizio && t.ora_fine);
  const perc = parseFloat(_pianoRegolaVal('notte_percentuale')) || 10;
  const problemi = [];
  tutti.forEach((t) => {
    // si controllano TUTTI i turni con orario, anche quelli senza ore notturne:
    // una durata sbagliata di un turno diurno vale come una di un notturno
    const nott = _pianoOreNotturneTurno(t);
    const attesa = _pianoDurataAttesa(t);
    const dich = parseFloat(t.durata_ore);
    if (attesa == null || isNaN(dich)) return;
    const diff = Math.round((attesa - dich) * 100) / 100;
    // si segnala QUALUNQUE scarto che valga almeno mezzo minuto: un turno fatto
    // 200 volte in un anno con un minuto di troppo sono piu' di tre ore nel
    // saldo di qualcuno, quindi gli arrotondamenti di uno o due minuti non si
    // lasciano passare
    if (Math.abs(diff) * 60 >= 0.5) problemi.push({ t: t, nott: nott, attesa: attesa, dich: dich, diff: diff });
  });
  const conNotte = tutti.length;
  const b = document.getElementById('pwd-modal-content');
  let h =
    '<h3>Supplemento notturno del ' +
    perc +
    '%</h3><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Fascia notturna ' +
    (parseFloat(_pianoRegolaVal('notte_inizio')) || 23) +
    ':00-' +
    (parseFloat(_pianoRegolaVal('notte_fine')) || 6) +
    ':00. Turni con orario: <b>' +
    conNotte +
    '</b>, di cui <b>' +
    problemi.length +
    '</b> con durata da sistemare (qualunque scarto, anche di un solo minuto).</p>';
  if (!problemi.length) {
    h +=
      '<p style="font-size:var(--fs-md,.875rem);color:var(--c-verde,#2c6e49);font-weight:700">Tutte le durate comprendono correttamente il supplemento notturno.</p>';
  } else {
    h +=
      '<div style="max-height:48vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:var(--fs-sm,.8125rem)"><thead><tr><th style="text-align:left">Turno</th><th>Orario</th><th title="Dall entrata all uscita">Durata reale</th><th>Ore notturne</th><th title="10% delle ore notturne">Supplemento</th><th>Durata scritta ora</th><th>Durata corretta</th><th>Differenza</th></tr></thead><tbody>';
    problemi.forEach((p) => {
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        escP(p.t.codice) +
        ' <span style="font-weight:400;color:var(--muted)">' +
        escP(repartoLabel(p.t.reparto_dip || 'slots')) +
        '</span></td><td>' +
        (p.t.ora_inizio || '').substring(0, 5) +
        '-' +
        (p.t.ora_fine || '').substring(0, 5) +
        '</td><td>' +
        _pianoOreHm(_pianoDurataOrologio(p.t)) +
        '</td><td>' +
        _pianoOreHm(p.nott) +
        '</td><td>' +
        _pianoOreHm(_pianoNotteRecupero(p.nott)) +
        '</td><td>' +
        _pianoOreHm(p.dich) +
        ' <span style="color:var(--muted)">(' +
        p.dich +
        ')</span></td><td style="font-weight:700">' +
        _pianoOreHm(p.attesa) +
        ' <span style="font-weight:400;color:var(--muted)">(' +
        p.attesa +
        ')</span></td><td style="font-weight:700;color:' +
        (p.diff > 0 ? 'var(--c-rosso,#c0392b)' : 'var(--c-oro,#8b6914)') +
        '">' +
        (p.diff > 0 ? '+' : '') +
        Math.round(p.diff * 60) +
        ' min</td></tr>';
    });
    h += '</tbody></table></div>';
    h +=
      '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:8px">In rosso i turni in cui manca il supplemento (le ore andrebbero aumentate), in giallo quelli che ne hanno più del previsto. Controlla prima di correggere: un turno può avere una durata diversa per accordi particolari (per esempio pause non pagate).</p>';
    h +=
      '<div class="pwd-modal-btns" style="margin-top:12px;flex-wrap:wrap;gap:6px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button>' +
      '<button class="btn-modal-ok" onclick="pianoCorreggiDurateNotte()">Correggi tutte le durate</button></div>';
    window._pianoDurateDaFixare = problemi.map((p) => ({ id: p.t.id, codice: p.t.codice, attesa: p.attesa }));
    b.innerHTML = h;
    document.getElementById('pwd-modal').classList.remove('hidden');
    return;
  }
  h +=
    '<div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function pianoCorreggiDurateNotte() {
  if (!isAdmin()) return;
  const lista = window._pianoDurateDaFixare || [];
  if (!lista.length) return;
  if (
    !(await chiediConferma(
      'Aggiorno la durata di ' +
        lista.length +
        ' turni con il supplemento notturno compreso?\n\nLe ore già salvate nei piani non cambiano da sole: il nuovo valore vale dai prossimi conteggi.',
    ))
  )
    return;
  document.getElementById('pwd-modal').classList.add('hidden');
  let fatti = 0;
  try {
    for (const x of lista) {
      await secPatch('piano_turni', 'id=eq.' + x.id, { durata_ore: x.attesa });
      const t = pianoTurniCache.find((y) => y.id === x.id);
      if (t) t.durata_ore = x.attesa;
      fatti++;
    }
    logAzione('Turni: durate con supplemento notturno', fatti + ' turni aggiornati');
    toast(fatti + ' durate aggiornate');
    window._pianoDurateDaFixare = [];
    renderPiano();
  } catch (e) {
    toast('Errore: aggiornati ' + fatti + ' su ' + lista.length);
  }
}
// ===== BENESSERE DEI COLLABORATORI =====
// Fotografia oggettiva di come e' distribuito il carico di lavoro nell'anno,
// separata tra personale fisso e ausiliario perche' hanno regole diverse.
// Il punteggio (0-100) lo calcola il motore PianoRegole.indiceBenessere: qui
// si raccolgono solo i dati dal piano.
