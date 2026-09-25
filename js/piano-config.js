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
};
// NOMI SEMPLICI, GRUPPO E TIPO DI OGNI REGOLA. La scheda Regole parla la
// lingua di chi la usa: niente HARD/SOFT/peso, ma "cosa fa", "dove agisce",
// "da dove viene". tipo: 'sino' (interruttore), 'numero', 'testo'.
const PIANO_REGOLE_GUIDA = {
  min_riposo_ore: {
    g: 'Riposo e giorni di lavoro',
    n: 'Ore minime di riposo fra due turni',
    t: 'numero',
    d: 'Validatore, bozza, cambi turno, coperture',
  },
  max_consecutivi: {
    g: 'Riposo e giorni di lavoro',
    n: 'Giorni di lavoro consecutivi al massimo',
    t: 'numero',
    d: 'Validatore, bozza, cambi turno, coperture',
  },
  no_4w1c1w: {
    g: 'Riposo e giorni di lavoro',
    n: 'Vietato: 4 giorni di lavoro, 1 di riposo, poi di nuovo lavoro',
    t: 'sino',
    d: 'Validatore e bozza',
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
    d: 'Validatore, tabella Domeniche, Benessere, bozza',
  },
  turno_prima_domenica_libera: {
    g: 'Domeniche',
    n: 'La domenica libera vale solo se il sabato finisce entro le 23',
    t: 'sino',
    d: 'Validatore, tabella Domeniche, Benessere',
  },
  tolleranza_ore: {
    g: 'Ore e saldo',
    n: 'Scarto accettato dalle ore dovute del mese (piu o meno)',
    t: 'numero',
    d: 'Validatore, bozza, Migliora ore',
  },
  tolleranza_ore_sopra: {
    g: 'Ore e saldo',
    n: 'Ore massime sopra le dovute del mese (se attiva vince sulla precedente)',
    t: 'numero',
    d: 'Validatore, bozza, Migliora ore',
  },
  tolleranza_ore_sotto: {
    g: 'Ore e saldo',
    n: 'Ore massime sotto le dovute del mese (se attiva vince sulla precedente)',
    t: 'numero',
    d: 'Validatore',
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
    n: 'Percentuale di riferimento degli ausiliari solo per generare (0.8 = 80%)',
    t: 'numero',
    d: 'Bozza',
  },
  jolly_ore_max: {
    g: 'Ausiliari (jolly)',
    n: 'Ore massime al mese per gli ausiliari senza percentuale',
    t: 'numero',
    d: 'Validatore e bozza',
  },
  jolly_ore_min: {
    g: 'Ausiliari (jolly)',
    n: 'Ore minime al mese per gli ausiliari senza percentuale',
    t: 'numero',
    d: 'Validatore (solo avviso)',
  },
  jolly_codici_gia_pagati: {
    g: 'Ausiliari (jolly)',
    n: 'Codici che per gli ausiliari valgono zero ore (indennita gia pagata)',
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
    n: 'Giorno del mese entro cui gli ausiliari consegnano le non disponibilita',
    t: 'numero',
    d: 'Formulario non disponibilita',
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
    n: 'Giorni in piu dopo 10 anni di servizio (in tutto, non si sommano)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_15anni: {
    g: 'Vacanze',
    n: 'Giorni in piu dopo 15 anni di servizio (in tutto)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_20anni: {
    g: 'Vacanze',
    n: 'Giorni in piu dopo 20 anni di servizio (in tutto)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_bonus_25anni: {
    g: 'Vacanze',
    n: 'Giorni in piu dopo 25 anni di servizio (in tutto)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_arrotonda_da: {
    g: 'Vacanze',
    n: 'Da questa frazione in su i giorni si arrotondano al giorno pieno (0.35: 32.37 diventa 33)',
    t: 'numero',
    d: 'Scheda Vacanze (diritto)',
  },
  vacanze_giorni_anno: { g: 'Vacanze', n: 'Giorni di vacanza per l indice di benessere', t: 'numero', d: 'Benessere' },
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
  diurno_prima_vacanza: { g: 'Vacanze', n: 'Turno diurno il giorno prima della vacanza', t: 'sino', d: 'Validatore' },
  funzioni_fanno_tutto: {
    g: 'Funzioni e turni',
    n: 'Funzioni che a mano possono fare qualsiasi turno (il livello alto comprende quelli sotto, come in Formazione)',
    t: 'testo',
    d: 'Scrittura manuale, validatore, cambi turno e coperture (la bozza automatica segue le regole del settore)',
  },
  chiusura_ora_normale: {
    g: 'Orari di chiusura',
    n: 'Ora di chiusura nei giorni normali',
    t: 'numero',
    d: 'Calendario, ore dei turni prolungati, briefing',
  },
  chiusura_ora_tardi: {
    g: 'Orari di chiusura',
    n: 'Ora di chiusura il venerdi, il sabato e la notte prima di un festivo',
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
    n: 'Giorni della settimana che chiudono tardi (0 domenica, 5 venerdi, 6 sabato)',
    t: 'testo',
    d: 'Calendario, ore dei turni prolungati, briefing',
  },
  congedo_np_giorni_vacanze: {
    g: 'Congedi non pagati',
    n: 'Oltre questi giorni di congedo il diritto vacanze dell anno si riduce in proporzione',
    t: 'numero',
    d: 'Scheda Vacanze (diritto), scheda Congedi',
  },
  congedo_np_mesi_anzianita: {
    g: 'Congedi non pagati',
    n: 'Oltre questi mesi di congedo l anzianita si sposta in avanti (giubilei e scaglioni)',
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
  max_consecutivi: [1, 7],
  pattern_lavoro: [1, 7],
  domeniche_libere_anno: [0, 52],
  tolleranza_ore: [0, 60],
  tolleranza_ore_sopra: [0, 60],
  tolleranza_ore_sotto: [0, 60],
  saldo_ore_max: [0, 200],
  saldo_ore_min: [-200, 0],
  jolly_percentuale_piano: [0.1, 1],
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
  if (/^jolly_|^c_prima_jolly$/.test(nome) && settore && !ctx.jolly)
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
    const note = new Set(
      (Array.isArray(window._pianoFunzioni) ? window._pianoFunzioni : []).map((f) => String(f).toUpperCase()),
    );
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
    '<select onchange="window._pianoRegoleSettoreVista=this.value;renderPiano()" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a"><option value=""' +
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
    '<details style="margin-bottom:12px;background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:8px 12px"><summary style="cursor:pointer;font-weight:700;font-size:.9rem">Come si usano le regole (guida in 6 punti)</summary>' +
    '<ol style="font-size:.85rem;margin:8px 0 4px 18px;line-height:1.5">' +
    '<li><b>Cambia il valore</b> nella casella e premi Invio o clicca fuori: si salva da solo e vale subito in tutto il programma. La colonna "Dove agisce" dice in quali schermate la regola conta.</li>' +
    '<li><b>Si / No</b> accende o spegne una preferenza. La casella <b>Attiva</b> spegne qualsiasi regola senza perdere il valore: spenta, e come se non esistesse.</li>' +
    '<li><b>Un valore diverso per un settore</b>: scegli il settore nel menu in alto e cambia il numero. Nasce l eccezione per quel settore; gli altri tengono il valore generale. "Torna al generale" la toglie. Esempio: riposo 11 ore ovunque, 12 ai Tavoli.</li>' +
    '<li><b>Regole nuove sui gruppi di lavoro</b> (chi puo fare cassa, quanti Supervisor al giorno, una funzione richiesta): si creano nella scheda <b>Regole di gruppo</b> qui sotto scegliendo il tipo dall elenco. Non serve scrivere codice.</li>' +
    '<li><b>Preferenze di una persona</b> (solo diurni, turni vietati, settori abilitati, copertura di altri settori): nella sua scheda in Gestione collaboratori. Bozza e validatore le rispettano.</li>' +
    '<li><b>Fonte</b>: sotto ogni regola normativa c e il riferimento (RAP, legge sul lavoro, direttiva). Se cambia il regolamento, cambia il numero qui: il programma non va toccato. Ogni modifica finisce nel Registro attivita.</li>' +
    '</ol></details>';
  if (vista)
    h +=
      '<p style="font-size:.82rem;color:#8b6914;margin-bottom:8px">Stai vedendo i valori validi per <b>' +
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
  h += '<div style="overflow-x:auto"><table class="piano-table" style="min-width:760px;font-size:.85rem">';
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
            ? '<span style="color:#8b6914;font-weight:700">eccezione</span> <button class="btn-del-tipo" style="font-size:.8rem;padding:1px 6px" onclick="eliminaPianoRegolaSettore(' +
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
          '</b><br><span style="font-size:.78rem;color:var(--muted)">' +
          escP(nome) +
          (PIANO_REGOLE_FONTE[nome] ? ' · ' + escP(PIANO_REGOLE_FONTE[nome]) : '') +
          '</span></td><td>' +
          valoreInput(r, g.t, onch) +
          '</td><td style="text-align:left;font-size:.8rem">' +
          colSett +
          '</td><td><input type="checkbox"' +
          (r.attivo !== false ? ' checked' : '') +
          ' onchange="' +
          onAtt +
          '"></td><td style="font-size:.82rem;text-align:left;color:#2c6e49">' +
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
        '<br><span style="font-size:.78rem;color:var(--muted)">' +
        escP(r.descrizione || '') +
        '</span></td><td>' +
        escP(r.valore || '') +
        '</td><td colspan="2" style="text-align:left;font-size:.8rem;color:var(--muted)">nessun effetto</td><td style="font-size:.8rem;text-align:left"><button class="btn-del-tipo" onclick="eliminaPianoRegola(' +
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
    !confirm(
      'Togliere il valore proprio di "' +
        r.nome +
        '" per ' +
        _pianoRegolaSettori(r).map(repartoLabel).join(', ') +
        "?\n\nTornera' a valere il valore generale.",
    )
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
  if (!confirm('Eliminare la regola "' + r.nome + '"? Il programma non la usa: non cambia nulla nei calcoli.')) return;
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
  const sett = prompt(
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
  const val = prompt('Valore di "' + nome + '" per ' + pulito + ':', gen.valore || '');
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
    toast('Errore: esiste gia\' una regola "' + nome + '" per quei settori');
  }
}
// Cambia i settori di una regola specifica (vuoto = torna generale)
async function pianoRegolaSettoriEdit(id) {
  if (!isAdmin()) return;
  const r = pianoRegoleCache.find((x) => x.id === id);
  if (!r) return;
  const sett = prompt(
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
  const esistente = _pianoFabbCache.find(
    (f) => f.turno_codice === codice && f.data === dstr && (f.reparto_dip || 'slots') === _pianoReparto(),
  );
  const attuale = esistente ? esistente.quantita : 0;
  let q;
  if (qDiretta != null) {
    q = qDiretta;
  } else {
    const v = prompt(
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
function fabbisognoInline(codice, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('fabb', el);
    return;
  }
  if (!puoGestirePiano() || !el || el.querySelector('input')) return;
  _pianoBloccoPulisci();
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
  inp.select();
  let chiuso = false;
  const conferma = async () => {
    if (chiuso) return;
    chiuso = true;
    const v = inp.value.trim();
    const q = v === '' ? 0 : parseInt(v);
    if (q === attuale || (v !== '' && isNaN(q))) {
      el.innerHTML = vecchio;
      if (v !== '' && isNaN(q)) toast('Inserisci un numero tra 0 e 99');
      return;
    }
    await setPianoFabbisogno(codice, dstr, q);
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      conferma();
    } else if (e.key === 'Escape') {
      chiuso = true;
      el.innerHTML = vecchio;
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
function _xlsNormaNome(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
}

async function importaFabbisognoExcel(input) {
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
    let smartOk = false;
    if (foglioMese) {
      const dati = XLSX.utils.sheet_to_json(wb.Sheets[foglioMese], { header: 1, defval: '', raw: true });
      let rPian = -1;
      for (let r = 0; r < dati.length; r++) {
        if ((dati[r] || []).some((v) => String(v).toUpperCase().includes('PIANIFICAZIONE'))) {
          rPian = r;
          break;
        }
      }
      if (rPian >= 0) {
        const mappa = _xlsMappaGiorni(dati[rPian], nGiorni) || _xlsCercaMappaGiorni(dati, nGiorni, 0, 8);
        if (mappa) {
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
          smartOk = true;
          fonte = 'foglio "' + foglioMese + '" (sezione PIANIFICAZIONE)';
        }
      }
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
      !confirm(
        'Importare il fabbisogno di ' +
          lbl +
          '?\n\n• Letto da: ' +
          fonte +
          '\n• ' +
          nuovi.length +
          ' celle da caricare' +
          (errori ? '\n• ' + errori + ' righe con codice turno sconosciuto (saltate)' : '') +
          '\n\nATTENZIONE: il fabbisogno esistente del mese viene SOSTITUITO.',
      )
    )
      return;
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    await secDel('piano_fabbisogni', 'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto());
    for (let i = 0; i < nuovi.length; i += 10)
      await Promise.all(nuovi.slice(i, i + 10).map((f) => secPost('piano_fabbisogni', f)));
    logAzione('Fabbisogno importato', ym + ' · ' + nuovi.length + ' celle');
    toast('Fabbisogno importato: ' + nuovi.length + ' celle');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file fabbisogno');
  }
}
// IMPORT PIANO da Excel/CSV (come l'import del foglio PIANO SLOTS in
// Turnivo): prima colonna = collaboratore, colonne successive = giorni
// 1..N con le sigle. Le celle esistenti NON vengono toccate; sigle
// sconosciute e nomi non riconosciuti vengono scartati e conteggiati.
// L'ordine delle righe resta quello predefinito (SUP, BO, poi gli
// altri) e si può sempre riordinare trascinando i nomi.
async function importaPianoExcel(input) {
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const collabs = collaboratoriCache.filter((c) => c.attivo !== false);
    // match nomi robusto: maiuscole/minuscole, ordine parole, refusi tipo 0/O e 1/I
    const trova = (nome) => {
      const n = _xlsNormaNome(nome).toLowerCase();
      if (!n) return null;
      return (
        collabs.find((c) => {
          const cn = _xlsNormaNome(c.nome).toLowerCase();
          return cn === n || (n.split(' ').length > 1 && n.split(' ').every((p) => cn.includes(p)));
        }) || null
      );
    };
    // layout: file REALE (foglio del mese, giorni da riga seriale, nomi nella
    // colonna con più riscontri) oppure formato semplice (nome + giorni 1..N)
    const foglioMese = _xlsFoglioMese(wb, ym);
    let dati, mappa, colNome, inizio, fonte;
    if (foglioMese) {
      dati = XLSX.utils.sheet_to_json(wb.Sheets[foglioMese], { header: 1, defval: '', raw: true });
      mappa = _xlsCercaMappaGiorni(dati, nGiorni, 0, 8);
    }
    const wsCommenti = foglioMese ? wb.Sheets[foglioMese] : null;
    const commentoCella = (rIdx, cIdx) => {
      if (!wsCommenti) return '';
      try {
        const cel = wsCommenti[XLSX.utils.encode_cell({ r: rIdx, c: cIdx })];
        if (!cel || !cel.c || !cel.c.length) return '';
        return String(cel.c.map((x) => x.t || '').join(' '))
          .replace(/^[^:\n]{0,20}:\s*/, '')
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
    // match anche sui DISATTIVATI (da riattivare) e raccolta dei NUOVI
    const tuttiCollabs = collaboratoriCache;
    const trovaTutti = (nome) => {
      const nrm = _xlsNormaNome(nome).toLowerCase();
      if (!nrm) return null;
      return (
        tuttiCollabs.find((c) => {
          const cn = _xlsNormaNome(c.nome).toLowerCase();
          return cn === nrm || (nrm.split(' ').length > 1 && nrm.split(' ').every((p) => cn.includes(p)));
        }) || null
      );
    };
    const titolo = (str) =>
      _xlsNormaNome(str)
        .toLowerCase()
        .replace(/(^|[\s.'-])(\w)/g, (m, a, b) => a + b.toUpperCase());
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
        celle.push({ g: g, cod: cod, commento: mappa ? commentoCella(inizio + idxRiga, mappa[g]) : '' });
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
        righeCollab.push({ nome: hit.nome, celle: celle, stato: 'riattiva', ref: hit });
      } else if (celle.length >= 3 && celle.some((c) => c.cod !== 'C')) {
        // collaboratore NUOVO trovato nel file: funzione e % dalle colonne
        // accanto (chi ha solo congedo C non viene creato)
        const fz = String(riga[colNome + 1] || '')
          .trim()
          .toUpperCase();
        const funzioni = window._pianoFunzioni || ['RESP', 'SOSTRESP', 'SUP', 'BO', 'HOST'];
        const pct = parseFloat(riga[colNome + 2]);
        righeCollab.push({
          nome: titolo(raw),
          celle: celle,
          stato: 'nuovo',
          funzione: funzioni.includes(fz) ? fz : 'HOST',
          percentuale: !isNaN(pct) && pct > 0 && pct <= 1 ? pct : 1,
          isJolly: isNaN(pct) || !pct,
        });
      }
    });
    const nuoviCollab = righeCollab.filter((r) => r.stato === 'nuovo');
    const daRiattivare = righeCollab.filter((r) => r.stato === 'riattiva');
    const nuove = [];
    righeCollab.forEach((rc) =>
      rc.celle.forEach((c) =>
        nuove.push({
          collaboratore: rc.nome,
          data: ym + '-' + String(c.g).padStart(2, '0'),
          codice: c.cod,
          protetto: true,
          generato: false,
          commento: c.commento || null,
          reparto_dip: _pianoReparto(),
        }),
      ),
    );
    if (!nuove.length) {
      toast('Nessuna cella riconosciuta nel file');
      return;
    }
    const MESI_L = MESI_FULL || [];
    const lbl = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
    if (
      !confirm(
        'Importare il piano di ' +
          lbl +
          '?\n\n• Letto da: ' +
          fonte +
          '\n• ' +
          nomiOk.size +
          ' collaboratori riconosciuti\n• ' +
          nuove.length +
          ' celle da importare (protette)' +
          (sigleScartate ? '\n• ' + sigleScartate + ' sigle sconosciute scartate' : '') +
          (nuoviCollab.length
            ? '\n• NUOVI collaboratori da creare: ' +
              nuoviCollab.map((x) => x.nome + ' (' + x.funzione + ')').join(', ')
            : '') +
          (daRiattivare.length
            ? '\n• Da RIATTIVARE (disattivati ma presenti nel file): ' + daRiattivare.map((x) => x.nome).join(', ')
            : '') +
          (saltatiDisattivati.length
            ? '\n• Saltati (disattivati, nel file solo riposi): ' + saltatiDisattivati.join(', ')
            : '') +
          '\n\nLe celle già presenti NON vengono toccate.',
      )
    )
      return;
    for (const nc of nuoviCollab) {
      const creato = await secPost('collaboratori', {
        nome: nc.nome,
        attivo: true,
        reparto_dip: _pianoReparto(),
        funzione: nc.funzione,
        percentuale: nc.percentuale,
        is_jolly: !!nc.isJolly,
      });
      if (creato && creato[0]) collaboratoriCache.push(creato[0]);
      logAzione('Collaboratore creato da import piano', nc.nome + ' (' + nc.funzione + ')');
    }
    if (
      daRiattivare.length &&
      confirm(
        'Riattivo anche i collaboratori disattivati presenti nel file?\n\n' +
          daRiattivare.map((x) => '• ' + x.nome).join('\n') +
          '\n\n(Se rispondi Annulla, le loro celle vengono importate comunque ma restano disattivati)',
      )
    ) {
      for (const rc of daRiattivare) {
        await secPatch('collaboratori', 'id=eq.' + rc.ref.id, { attivo: true });
        rc.ref.attivo = true;
        logAzione('Collaboratore riattivato da import piano', rc.nome);
      }
    }
    // proposta di disattivazione: chi è attivo ma NON compare nel file,
    // oppure compare ma ha SOLO congedo (tutto il mese a C, nessun turno
    // né malattia)
    const lavoranti = new Set(righeCollab.filter((x) => x.celle.some((c) => c.cod !== 'C')).map((x) => x.nome));
    const daDisattivare = collaboratoriCache.filter(
      (c) =>
        c.attivo !== false &&
        (c.reparto_dip || 'slots') === _pianoReparto() &&
        !lavoranti.has(c.nome) &&
        !String(c.reparti_extra || '').trim(), // i multi-reparto lavorano altrove
    );
    if (
      daDisattivare.length &&
      confirm(
        'Questi collaboratori attivi NON hanno turni nel file (assenti o con solo congedo C): li disattivo?\n\n' +
          daDisattivare.map((x) => '• ' + x.nome).join('\n') +
          '\n\n(Se rispondi Annulla restano attivi)',
      )
    ) {
      for (const c of daDisattivare) {
        await secPatch('collaboratori', 'id=eq.' + c.id, { attivo: false });
        c.attivo = false;
        logAzione('Collaboratore disattivato da import piano', c.nome + ' (assente dal file ' + ym + ')');
      }
    }
    const r = await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove });
    logAzione('Piano importato da Excel', ym + ' · ' + ((r && r.inserite) || 0) + '/' + nuove.length + ' celle');
    toast('Piano importato: ' + ((r && r.inserite) || 0) + ' celle nuove');
    setTimeout(async () => {
      await _pianoProponiCertificazioniBulk(
        nuove.map((x) => ({ nome: x.collaboratore, codice: x.codice, commento: x.commento || '' })),
      );
      await controllaFormazioniCompletate(true);
    }, 400);
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file piano');
  }
}

// come fabbisogno.elimina di Turnivo: cancella tutto il fabbisogno del mese
async function eliminaFabbisognoMese() {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const n = _pianoFabbCache.length;
  if (!n) {
    toast('Nessun fabbisogno da eliminare per ' + ym);
    return;
  }
  if (
    !confirm(
      'Eliminare TUTTO il fabbisogno di ' +
        ym +
        ' (' +
        repartoLabel(_pianoReparto()) +
        ')?\n\n' +
        n +
        ' celle verranno rimosse. Il piano già generato NON viene toccato.',
    )
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
    CHIUSURA5: 'venerdi, sabato e vigilie (chiusura alle 5)',
    D1: 'lunedi',
    D2: 'martedi',
    D3: 'mercoledi',
    D4: 'giovedi',
  };
  const senzaModello = Object.keys(riepilogo).filter((k) => !modello[k]);
  if (
    !confirm(
      'Copiare il fabbisogno da ' +
        ymPrec +
        ' a ' +
        _pianoMeseSel +
        '?\n\nNon si copia giorno per giorno ma per tipo di giornata, cosi i venerdi\nrestano venerdi: ' +
        Object.keys(riepilogo)
          .filter((k) => modello[k])
          .map((k) => (nomiProfilo[k] || k) + ' (' + riepilogo[k] + ')')
          .join(', ') +
        '.\nI festivi prendono l assetto della domenica, le vigilie quello del sabato.\n\n' +
        nuovi.length +
        ' celle da scrivere. Le celle gia impostate non vengono toccate.' +
        (senzaModello.length
          ? '\n\nAttenzione: per ' +
            senzaModello.map((k) => nomiProfilo[k] || k).join(', ') +
            ' non c e un giorno di riferimento nel mese precedente: restano vuoti.'
          : ''),
    )
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
    '%</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Fascia notturna ' +
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
      '<p style="font-size:.9rem;color:#2c6e49;font-weight:700">Tutte le durate comprendono correttamente il supplemento notturno.</p>';
  } else {
    h +=
      '<div style="max-height:48vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:.82rem"><thead><tr><th style="text-align:left">Turno</th><th>Orario</th><th title="Dall entrata all uscita">Durata reale</th><th>Ore notturne</th><th title="10% delle ore notturne">Supplemento</th><th>Durata scritta ora</th><th>Durata corretta</th><th>Differenza</th></tr></thead><tbody>';
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
        (p.diff > 0 ? '#c0392b' : '#8b6914') +
        '">' +
        (p.diff > 0 ? '+' : '') +
        Math.round(p.diff * 60) +
        ' min</td></tr>';
    });
    h += '</tbody></table></div>';
    h +=
      '<p style="font-size:.8rem;color:var(--muted);margin-top:8px">In rosso i turni in cui manca il supplemento (le ore andrebbero aumentate), in giallo quelli che ne hanno piu\' del previsto. Controlla prima di correggere: un turno puo\' avere una durata diversa per accordi particolari (per esempio pause non pagate).</p>';
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
    !confirm(
      'Aggiorno la durata di ' +
        lista.length +
        " turni con il supplemento notturno compreso?\n\nLe ore gia' salvate nei piani non cambiano da sole: il nuovo valore vale dai prossimi conteggi.",
    )
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
