# Genera QUESTIONARIO_VERIFICA_REGOLE_<versione>.html: tutte le regole e i
# valori del programma, riga per riga, con Vero / Falso / Non so e nota,
# divisi per chi deve rispondere. Dati letti da dati_q.json (esportazione DB).
import json, html, datetime, sys
E = html.escape
DATI = json.load(open(sys.argv[1]))
VERS = sys.argv[2] if len(sys.argv) > 2 else 'v262'
imp = DATI['imp']
J = lambda k, d=None: json.loads(imp[k]) if k in imp else d

blocchi = []  # (id, titolo, destinatario, [sezioni]) ; sezione = (titolo, intro, voci) ; voce = (testo, esempio) | ('TABELLA', intestazioni, righe)
def blocco(id_, titolo, dest): blocchi.append([id_, titolo, dest, []]); return blocchi[-1][3]
def sez(lista, titolo, intro, voci): lista.append((titolo, intro, voci))
def firma_html(id_, titolo):
    return ('<div class="firme" data-blocco="%s"><h4>Firme · %s</h4><div class="firme-lista"></div><button type="button" class="firma-add no-stampa" onclick="firmaAggiungi(\'%s\')">+ Aggiungi un firmatario</button></div>' % (id_, titolo, id_))
def T(intest, righe): return ('TABELLA', intest, righe)

regole = {r['nome']: r for r in DATI['regole']}
def rv(n): return regole[n]['valore'] if n in regole else '?'
def rs(n): return ' (regola ' + n + ' = ' + rv(n) + (', spenta' if n in regole and not regole[n]['attivo'] else '') + ')'

# ====================== BLOCCO 1 · HR / PAGHE ======================
B = blocco('hr', 'Blocco 1 · Ore, turni, festivi, vacanze, congedi, anzianita', 'Da compilare da HR e paghe')
sez(B, 'A · Ore dovute e saldo ore', 'Come il programma calcola le ore che ogni collaboratore deve fare e il suo saldo.', [
 ('Le ore dovute del mese: giorni del mese diviso 7, per 41 ore settimanali, per la percentuale di impiego (impostazione ore settimanali = 41).', 'Ottobre (31 giorni), 100%: 31/7 × 41 = 181.6 ore. All 80%: 145.3 ore.'),
 ('Le ore pianificate del mese sono la somma delle durate dei turni piu le ore dei codici speciali (vacanza, malattia, CGF, permessi), con il prolungamento nei giorni di chiusura tardi.', 'C0 (8.33) × 15 + V (5.857) × 5 = 154.2 ore.'),
 ('Saldo del mese = ore pianificate (o ore reali, se scritte) meno ore dovute, arrotondato a un decimale; si modifica solo dalla colonna "Saldo mese".', '154.2 − 181.6 = −27.4.'),
 ('Precedenza: ore reali scritte a mano, poi timbrature del mese, poi piano.', 'Piano 181, timbrato 178, scritto 180: vale 180.'),
 ('Saldo dell anno = riporto iniziale (con la sua data) piu i saldi dei mesi non compresi nel riporto, compresi i mesi futuri gia pianificati.', 'Riporto +5 al 31.08, settembre −3, ottobre +2: +4.'),
 ('Il saldo annuo e in rosso oltre +15 o sotto −15 ore' + rs('saldo_ore_max') + rs('saldo_ore_min') + '.', 'Saldo +18: rosso.'),
 ('Il validatore segnala il mese quando le ore pianificate si scostano dalle dovute di oltre 15 ore' + rs('tolleranza_ore') + '. Le regole separate sopra/sotto (10 ore) esistono ma sono spente' + rs('tolleranza_ore_sopra') + '.', '181.6 dovute: da 166.6 a 196.6 va bene.'),
 ('Gli ausiliari non hanno ore dovute: nessun saldo, un trattino.', 'Jolly con 60 ore: solo le ore fatte.'),
 ('Per gli ausiliari i codici V e V1 valgono zero ore (indennita gia nel salario orario)' + rs('jolly_codici_gia_pagati') + '.', 'Jolly con 3 V: 0 ore.'),
 ('I giorni di congedo non pagato (CNP) non contano fra le ore dovute.', '31 giorni con 10 CNP: 21/7 × 41 = 123 ore dovute.'),
 ('Il recupero ore (scostamento giornaliero) entra nel saldo del mese, solo per i fissi, e non si scrive sui mesi chiusi senza sblocco.', '+1.5 il 12 ottobre: saldo ottobre +1.5.'),
 ('Il riporto del saldo ore ha una data: i mesi fino a quella data non si sommano una seconda volta (i 26 riporti importati hanno data 31.08.2026).', 'Riporto al 31.08: gennaio-agosto grigi, da settembre si somma.'),
])
turni_rows = [[t['settore'], t['codice'], (t['ora_inizio'] or '')[:5], (t['ora_fine'] or '')[:5], str(t['durata_ore']), t['tipo'] or '', t['gruppo'] or ''] for t in DATI['turni']]
sez(B, 'B · Turni: durate e orari', 'La durata e l orario da orologio piu il 10% delle ore fra le 23:00 e le 06:00; le pause sono pagate. Per ogni turno: durata giusta? (Settore, sigla, inizio, fine, ore in centesimi, tipo, gruppo. 8.33 = 8h20.)', [
 ('La durata di un turno e l orario da orologio piu il 10% delle ore comprese fra le 23:00 e le 06:00 (supplemento notturno gia dentro la durata)' + rs('notte_inizio') + rs('notte_fine') + '.', 'Z8 19:45-04:30 = 8h45 + 33 min = 9h18 = 9.30.'),
 ('Le pause sono pagate e non si tolgono dalla durata; niente arrotondamenti di uno o due minuti.', 'C0 11:40-20:00 = 8h20 = 8.33.'),
 ('Un turno e notturno se inizia dalle 15:00 in poi o finisce dopo le 23:00; PRESTO e il tipo dei turni del mattino (L1, 9).', 'S1 14:00-21:00 diurno; S5 17:00-02:00 notturno.'),
 ('I turni con durata zero (63, 8C, CLB3, 61) sono sigle importate dai fogli Excel da completare con orario e durata.', '63 usato 62 volte nel piano Tavoli con 0 ore.'),
 T(['Settore', 'Sigla', 'Inizio', 'Fine', 'Ore', 'Tipo', 'Gruppo'], turni_rows),
])
sez(B, 'C · Codici speciali (assenze e congedi): ore che valgono', 'Ore = valore nel saldo; "scala %" = si moltiplica per la percentuale di impiego; "riposo" = conta come giorno libero.', [
 T(['Codice', 'Descrizione', 'Ore', 'Formula', 'Scala %', 'Riposo', 'Protetto'], [[c['codice'], c['descrizione'] or '', str(c['ore']), c['formula'] or '', 'si' if c['scala_percentuale'] else 'no', 'si' if c['is_riposo'] else 'no', 'si' if c['protetto'] else 'no'] for c in DATI['codici']]),
 ('Vacanza V = 41/7 = 5.857 ore al giorno (scalata per la percentuale); malattia M = 41/4.667 = 8.787 ore; CGF = 8.5 ore fisse non scalate.', 'Un 80% in V: 4.686 ore.'),
 ('Il corso CS vale 3 ore e il corso LRD 2 ore (il foglio Excel conta 2 per entrambi: si e deciso di lasciare 3 per CS, modificabile).', 'Giornata CS: 3 ore nel saldo.'),
 ('Il congedo C vale 0 ore e conta come riposo; CNP (congedo non pagato) vale 0 ore, e protetto e riduce le ore dovute.', 'C il sabato: giorno libero.'),
])
sez(B, 'D · Orari di chiusura', 'Da qui dipendono le ore dei turni prolungati.', [
 ('Chiusura alle 04:00 nei giorni normali, 05:00 il venerdi, il sabato e la notte prima di un festivo, 07:00 la notte del 31 dicembre' + rs('chiusura_ora_normale') + rs('chiusura_ora_tardi') + rs('chiusura_ora_fine_anno') + rs('chiusura_giorni_tardi') + '.', 'Domenica 05.04 (vigilia Lunedi di Pasqua): 05:00.'),
 ('Il marcatore CH5 va il giorno prima del festivo e non compare se e gia venerdi o sabato; nei giorni di chiusura tardi i turni di chiusura si prolungano (Z0 finisce alle 20:30 quando c e Z12).', 'Festivo di lunedi: CH5 sulla domenica.'),
 ('Una festivita puo avere un orario di chiusura proprio scritto nella sua scheda; se c e, vale per la notte precedente.', 'Festa con chiusura 06:00: la vigilia chiude alle 6.'),
 T(['Data 2026', 'Festivita (chiusura tardi la vigilia)', 'Ora chiusura propria'], [[f['data'], f['nome'], str(f['ora_chiusura'] or 'standard 05:00')] for f in DATI['festivita']]),
])
sez(B, 'E · Riposi, giorni consecutivi, domeniche', 'Legge sul lavoro e regole aziendali.', [
 ('Almeno 11 ore di riposo fra due turni' + rs('min_riposo_ore') + '; il giorno dopo si aggiunge solo se il turno finisce dopo la mezzanotte.', 'Z8 finisce alle 04:30: il turno dopo non prima delle 15:30.'),
 ('Al massimo 5 giorni di lavoro consecutivi' + rs('max_consecutivi') + '.', 'Sei turni di fila: il sesto e segnalato.'),
 ('Vietato il pattern 4 giorni di lavoro, 1 di riposo, poi lavoro' + rs('no_4w1c1w') + '.', 'Lun-gio lavoro, ven riposo, sab lavoro: segnalato.'),
 ('12 domeniche libere all anno' + rs('domeniche_libere_anno') + '; una domenica conta come libera solo se il sabato prima si finisce entro le 23' + rs('turno_prima_domenica_libera') + '.', 'Sabato Z8 fino alle 04:30: la domenica non conta.'),
 ('Domenica in vacanza o in malattia: ne libera ne lavorata, in tutte le schermate.', 'Domenica in V: fuori dal conteggio.'),
 ('Se le domeniche rimaste nell anno non bastano a raggiungere 12, la tabella lo segna in rosso.', 'A novembre 7 libere e 5 domeniche rimaste: rosso.'),
 ('Il giorno prima delle vacanze il turno deve essere diurno' + rs('diurno_prima_vacanza') + '.', 'Vacanza da lunedi: la domenica niente notte.'),
])
festivi_rows = [[f['data'], f['descrizione'], ('si' if f['cgf'] and datetime.date.fromisoformat(f['data']).weekday()!=6 and f['descrizione'].strip().lower() in ('capodanno','epifania','lunedì di pasqua','lunedi di pasqua','ascensione','festa nazionale','1 agosto','assunzione','ognissanti','natale','santo stefano') else 'no') + (' (domenica)' if datetime.date.fromisoformat(f['data']).weekday()==6 else '')] for f in DATI['festivi']]
sez(B, 'F · Festivi e recuperi (CGF)', 'Regolamento aziendale 4.3 e Allegato 1.', [
 T(['Data 2026', 'Festivo', 'Da CGF ai fissi'], festivi_rows),
 ('Il CGF spetta solo al personale fisso; gli ausiliari mai.', 'Jolly il 1 agosto: nessun CGF.'),
 ('Il CGF matura solo sui nove festivi parificati alla domenica (Capodanno, Epifania, Lunedi di Pasqua, Ascensione, 1 Agosto, Assunzione, Ognissanti, Natale, Santo Stefano)' + rs('cgf_solo_parificati') + '; gli altri sei festivi cantonali no; il festivo di domenica no.', 'Turno il 19 marzo: 0 CGF. Il 15 agosto: 1 CGF.'),
 ('Il festivo matura solo se lavorato davvero: turno in cella e nessuna malattia quel giorno.', 'Turno a Natale ma malato: nessun credito.'),
 ('Il recupero del festivo del mese va nei giorni dopo il festivo nello stesso mese; se non c e spazio passa al mese dopo.', 'Festivo il 25.10: CGF fra il 26 e il 31.'),
 ('Il credito conta solo il passato e il mese aperto; i CGF gia pianificati nei mesi futuri non contano.', '5 maturati, 4 goduti: resta 1.'),
 ('Massimo 2 recuperi automatici a persona al mese' + rs('cgf_max_mese') + ', ad almeno 5 giorni uno dall altro' + rs('cgf_distanza_giorni') + ', mai il giorno prima o dopo una vacanza' + rs('cgf_non_con_vacanze') + '.', 'Tre crediti: due a ottobre, uno a novembre.'),
 ('CGF caduto in malattia: non goduto, il credito resta.', 'CGF il 10, malattia il 10: si ridara.'),
 ('CGF gia messo per un festivo poi saltato per malattia: diventa C con la nota "CGF tolto: festivo non lavorato".', 'Malattia il 25.10 dal Diario: il CGF del 27 diventa C.'),
 ('Riporto dei recuperi dall anno precedente per persona nella scheda Festivi; con riporto registrato l anno prima non si conta.', 'Peraino riporto 2026 +1, Sapio −2.'),
 ('Ausiliari: supplemento del 50% sul salario orario per i nove festivi parificati (anche di domenica), niente sugli altri; 10% delle ore notturne come tempo libero pagato' + rs('notte_percentuale') + '.', 'Jolly a Natale: 50%.'),
])
sez(B, 'G · Vacanze', 'Diritto, scaglioni, settimane.', [
 ('28 giorni nei primi due anni di contratto, 35 dal compimento dei due anni' + rs('vacanze_giorni_primi2anni') + rs('vacanze_giorni_base') + '.', 'Assunto 01.03.2025: 28 nel 2025-2026, 35 dal 2027 con pro rata nel 2027.'),
 ('Nell anno del passaggio: mesi prima dell anniversario a 28/12, dopo a 35/12.', 'Anniversario a marzo: 2 × 28/12 + 10 × 35/12 = 33.8.'),
 ('Giorni in piu NON cumulativi: 10 anni +1, 15 anni +2, 20 anni +3, 25 anni +4' + rs('vacanze_bonus_10anni') + rs('vacanze_bonus_15anni') + rs('vacanze_bonus_20anni') + rs('vacanze_bonus_25anni') + '.', 'A 15 anni: 37, non 38.'),
 ('Il giorno in piu spetta dal giorno dopo l anniversario: anniversario il 31.12 vale dall anno seguente.', '10 anni il 31.12.2026: +1 dal 2027.'),
 ('Arrotondamento al giorno pieno a favore del collaboratore da 0.35 in su' + rs('vacanze_arrotonda_da') + '.', '32.37 → 33; 32.2 → 32.'),
 ('Ausiliari: nessun diritto in giorni, indennita 8.33% (4 settimane) o 10.65% (5 settimane)' + rs('jolly_indennita_vacanze_4sett') + rs('jolly_indennita_vacanze_5sett') + '; tredicesima 8.33%' + rs('jolly_indennita_tredicesima') + '.', '1000 ore: 83.3 ore di indennita vacanze.'),
 ('Le vacanze si pianificano a settimane (7 giornate) per settore; "Applica al piano" mette le V; "Restano" conta le settimane di tutto l anno.', 'Settimana 32: V dal 3 al 9 agosto.'),
 ('Congedi attorno alle vacanze' + rs('c_prima_dopo_vacanza') + ': prima 1 giorno per i fissi e 2 per gli ausiliari' + rs('c_prima_fissi') + rs('c_prima_jolly') + '; dopo 1 al 100%, 2 all 80%, 3 al 60%, 4 al 40% o meno' + rs('c_dopo_100') + rs('c_dopo_80') + rs('c_dopo_60') + rs('c_dopo_40') + '; 4 giorni diurni forzati (WD) prima' + rs('wd_prima_vacanza') + '.', 'Al 80%: C prima, 2 C dopo.'),
 ('Le vacanze dei jolly valgono zero ore.', 'Jolly in V una settimana: 0 ore.'),
 ('Congedo non pagato oltre 10 giorni: diritto vacanze dell anno ridotto in proporzione' + rs('congedo_np_giorni_vacanze') + '.', '35 giorni, 73 di congedo: 35 × 292/365 = 28.'),
])
giub = J('giubileo_config', [])
sez(B, 'H · Congedi non pagati, giubilei, anzianita', 'Regolamento aziendale 5.5 e 5.14.', [
 ('Congedo non pagato: data inizio, fine, motivo, chi lo ha autorizzato; nel piano i giorni diventano CNP (0 ore, protetti).', 'Dal 10 al 20 novembre: 11 CNP.'),
 ('Fino a 6 mesi il congedo non interrompe l anzianita; oltre, l anzianita si sposta in avanti di tutta la durata' + rs('congedo_np_mesi_anzianita') + '.', 'Congedo di 8 mesi: giubilei 8 mesi dopo.'),
 T(['Anni di servizio', 'Premio (CHF)'], [[str(g['anni']), str(g['importo'])] for g in giub]),
 ('Dai 10 anni il premio si accompagna ai giorni di vacanza in piu (1, 2, 3, 4, 5 come da regolamento; il programma applica 1/2/3/4 fino a 25 anni).', '20 anni: 2000 CHF e 3 giorni.'),
 ('HR riceve l avviso 60 giorni prima del giubileo (impostazione giubileo_preavviso = ' + str(imp.get('giubileo_preavviso','60')) + ').', 'Giubileo 01.06: avviso dal 02.04.'),
 ('L anzianita parte dalla data di assunzione in anagrafica; senza data niente vacanze ne giubilei. I giubilei gia maturati prima del programma sono segnati "regolato prima".', 'Oggi 76 attivi su 119 senza data di assunzione.'),
 ('Il passaggio a nuova attivita o settore non interrompe l anzianita.', 'Da Valet a Slots: stessa data.'),
 ('La data di nascita serve per il compleanno (basta giorno e mese).', 'Nascita 12.01: C Compleanno il 12 gennaio.'),
])
sez(B, 'I · Conservazione dei dati', 'Regolamento aziendale.', [
 ('I dati del personale si conservano almeno 5 anni (impostazione conservazione_anni = ' + str(imp.get('conservazione_anni','5')) + '); le voci vecchie non si eliminano definitivamente, restano nel Cestino. Le voci recenti si possono cancellare entro ' + str(imp.get('conservazione_giorni_grazia','30')) + ' giorni (correzione errori).', 'Registrazione 2024: non cancellabile.'),
 ('Backup completo dall applicazione, da rifare prima di ogni consegna all IT; il programma girera su server interno.', 'Backup JSON con tutte le tabelle.'),
])

# ====================== BLOCCO 2 · RESPONSABILE / SUPERVISOR ======================
B = blocco('resp', 'Blocco 2 · Piano di lavoro: calendario, bozza, cambi, coperture, briefing', 'Da compilare dal Responsabile FoBoSlot, dal Sostituto e dai Supervisor')
sez(B, 'J · Compleanni, celle bloccate, giorni chiusi', '', [
 ('Il giorno del compleanno il programma riserva C con la nota "Compleanno" prima di turni e recuperi, anche per chi lavora in due settori.', '12 gennaio: C Compleanno in entrambi i piani.'),
 ('Una cella si blocca con un motivo (visita medica, corso): lucchetto rosso, motivo visibile; scambi, cerca cambio, coperture e bozza la saltano; bloccare un giorno vuoto crea una C bloccata; la malattia scioglie il blocco.', 'C bloccata "visita" il 15: nessuno la propone.'),
 ('Le celle importate da Excel sono protette (si sovrascrivono con conferma) ma senza lucchetto; "Sblocca" compare solo sulle bloccate con motivo.', 'Cella importata: menu "Blocca con motivo".'),
 ('Passata la giornata di gioco, il giorno resta modificabile fino a mezzogiorno del giorno dopo' + rs('blocco_ora_limite') + rs('blocco_giorni_chiusi') + '; poi solo con il permesso "Giorni chiusi" e un motivo, tracciato. Vale per ogni strada (cella, bozza, incolla, scambi, coperture); non per timbrature e recupero ore.', 'Il 10 alle 14: il 9 e chiuso.'),
 ('Una sigla inesistente viene rifiutata con avviso rosso e suggerimento della sigla piu vicina; la cella torna com era.', '"CO" → "Forse intendevi C0?"'),
 ('Ogni modifica del piano si salva subito; "Annulla" torna indietro fino a 15 passaggi (colori, orari e blocchi compresi); "Annulla tutto" riporta il mese a inizio sessione.', 'Bozza annullata: nessuna cella cambiata.'),
])
sez(B, 'K · Cambi turno, coperture, restituzioni', '', [
 ('"Cambia turno con..." scambia due turni dello stesso giorno fra colleghi dello stesso settore, con restituzione facoltativa anche in un altro mese; controlla riposo, consecutivi e idoneita per entrambi; chi non aveva nulla nel giorno di restituzione riceve C.', 'Scambio 28.09, restituzione 03.10.'),
 ('"Cerca cambio, giorno libero" propone i colleghi liberi quel giorno (non chi lavora in un altro settore, non le celle bloccate) e le date di restituzione possibili; il primo nome e il richiedente.', 'Mario in BU il 15: non libero per WL.'),
 ('Limite cambi richiesti al mese: ' + str(imp.get('piano_max_cambi_mese','0')) + ' (0 = illimitati); chi accetta non consuma; il responsabile puo autorizzare oltre e la deroga si registra a scambio fatto.', 'Al quarto cambio serve autorizzazione.'),
 ('Ogni cambio produce il formulario da firmare, finisce nel registro e si ristampa dalla cella.', 'Ristampa foglio del 28.09.'),
 ('"Copertura malattia" cerca sostituti liberi giorno per giorno, anche con una mossa a catena sul giorno prima dentro il mese; scrive M protetta al malato e propone di togliere la malattia dal Diario se gia registrata.', 'Malato 10-12: tre sostituti.'),
 ('"Cambio per esigenze operative" cambia il turno con motivo, rispetta i giorni chiusi e chiede conferma sulle celle bloccate.', 'Da C0 a C23 per esigenze.'),
 ('"Scambia settimane" di vacanza controlla i giorni chiusi prima di toccare il piano e produce il modulo.', 'Settimane 32 e 35 scambiate.'),
])
sez(B, 'L · Bozza automatica', 'Come il generatore decide.', [
 ('Ordine: vacanze applicate, poi compleanni e recuperi arretrati, turni sul fabbisogno giorno per giorno, recuperi dei festivi del mese, congedi C nei vuoti. I giorni chiusi non si toccano. Solo collaboratori del settore; "Completa con coperture" usa chi e abilitato da altri settori.', 'Mese meta passato: solo i giorni aperti.'),
 ('I turni vanno a chi e piu lontano dal proprio obiettivo ore (tolleranze comprese), prima i fissi poi gli ausiliari, e chi copre da un altro settore solo se non c e nessun altro; vacanze, malattie e CGF contano ore anche per la bozza.', 'Chi ha 10 V non viene caricato fino al pieno.'),
 ('Ausiliari: obiettivo 80% di un tempo pieno solo per la bozza' + rs('jolly_percentuale_piano') + '; non disponibilita entro il giorno 3' + rs('nd_jolly_giorno') + '.', 'Ottobre: obiettivo 145 ore.'),
 ('Preferenze: blocchi compatti di 4 giorni' + rs('blocchi_compatti') + rs('pattern_lavoro') + ', evita il riposo isolato' + rs('penalita_riposo_isolato') + ', evita notte-riposo-mattino' + rs('no_notte_riposo_presto') + ', equilibra notti e diurni' + rs('equilibrio_notti') + rs('equilibrio_diurni_notturni') + ', domeniche distribuite.', 'Chi ha piu notti viene dopo.'),
 ('Se per un posto nessuno e idoneo, resta scoperto e viene elencato: la bozza non forza mai una violazione; "Migliora ore" riequilibra dopo.', '"Z8 giorno 12" negli scoperti.'),
 ('Preferenze personali dalla scheda (solo diurni, turni vietati, settori abilitati, copertura di altri settori con gruppi e tetto mensile, accompagnamento) sono rispettate da bozza, validatore e cambi.', 'Solo diurni: mai una notte.'),
 ('Le mappature funzione → turni (Principale, Ammesso, Preferito) sono per settore, limitano i turni della funzione e danno priorita ai preferiti; una sigla che nel settore non esiste viene rifiutata.', 'Slots, SUP: Z0, Z8, Z12, L1, 9 principali.'),
 T(['Settore', 'Funzione', 'Turno', 'Tipo'], [[m.get('reparto_dip', 'slots'), m['funzione'], m['turno_codice'], m['tipo']] for m in DATI['mappature']]),
])
sez(B, 'M · Regole di gruppo e "chi fa cosa"', 'Per settore; gruppo "*" = tutti i gruppi.', [
 T(['Settore', 'Gruppo', 'Tipo', 'Valore', 'Attiva'], [[r['settore'], r['gruppo'], r['tipo_regola'], r['valore'], 'si' if r['attivo'] else 'no'] for r in DATI['regole_gruppo']]),
 ('Negli Slots L1 e 9 sono riservati a BO, SUP e RESP; da lunedi a giovedi i SUP fanno solo turni Z (o L1, 9); venerdi e sabato anche i turni S.', 'SUP con C0 di martedi nella bozza: mai.'),
 ('Le funzioni SUP e RESP a mano possono fare qualsiasi turno (il livello alto comprende quelli sotto)' + rs('funzioni_fanno_tutto') + '; nessun avviso; la bozza segue le regole del settore.', 'C0 scritto a mano a un SUP: accettato.'),
 ('"Funzioni ammesse nel gruppo": chi ha la funzione fa i turni del gruppo anche senza averlo fra i settori; chi non ce l ha deve avere il gruppo fra i settori (o la competenza certificata in Formazione, tramite la mappatura competenze → gruppi).', 'HOST con Cassa certificata: idoneo a CASSA.'),
 ('Le funzioni disponibili sono ' + ', '.join(J('piano_funzioni', [])) + '; i giorni evidenziati come weekend sono ' + str(J('piano_giorni_weekend', [5, 6])) + ' (5 venerdi, 6 sabato).', 'Colonne verdi ven-sab.'),
 ('Ogni regola con valore numerico o Si/No vale per tutti i settori e puo avere un valore proprio per un settore; un valore fuori scala o senza senso per quel settore viene rifiutato con la spiegazione.', 'Riposo 11 ovunque, 12 ai Tavoli.'),
])
sez(B, 'N · Timbrature, recupero ore, statistiche', '', [
 ('Le timbrature importate si confrontano con il piano usando le stesse ore del calendario; le ore timbrate del mese sostituiscono il piano nel saldo.', 'Pianificate 181.6, timbrate 178: −3.6.'),
 ('Il recupero ore si registra per settore con la selezione come nel calendario, si aggiorna ogni giorno, senza ausiliari.', 'Scostamento +0.5 il 12.'),
 ('Le Statistiche del piano sono un filtro per mese sull anno (senza ricaricare); CGF e domeniche seguono gli stessi criteri del calendario.', 'Clic su marzo: solo marzo.'),
 ('Benessere: indice per persona sui mesi completi (domeniche, weekend, notti, riposi isolati, serie massima, vacanze); la malattia non toglie punti; card domeniche libere con diritto 12.', 'Serie massima 6: penalita.'),
])
corsi = J('piano_corsi_orari', {})
cd = J('piano_cd_config', {}).get('coppie', [])
sez(B, 'O · Briefing, pause, corsi', 'Slots.', [
 ('Il briefing del giorno si compila dal piano (entrata, uscita, nome, turno, numero cassa CD, uscita, firma); i numeri cassa seguono la rotazione (chi chiude riapre il giorno dopo); un numero scritto a mano non viene sovrascritto.', 'Chi chiude con CD 5 riapre con CD 5.'),
 T(['Coppia CD', 'Apre con', 'Chiude con'], [[' / '.join(c['cd']), c['apre'], c['chiude']] for c in cd]),
 ('Le pause si generano dal briefing con durate per fascia (6h, 7h...) e competenze S/R/C; il foglio pause usa i numeri cassa delle coppie configurate.', 'Cassa principale = coppia che apre con C23.'),
 ('I corsi (' + ', '.join(J('piano_corsi_lista', ['CS','LRD','ANTINCENDIO'])) + ') si inseriscono nel piano con data, orario e partecipanti; chi ha un turno compatibile lo tiene con nota; orari predefiniti ' + ', '.join(k + ' ' + (v or 'da definire') for k, v in corsi.items()) + '.', 'CS 14:30-17:30.'),
 ('Le evidenziazioni: una cella colorata nel piano evidenzia il nome nel briefing secondo la mappa colori del settore.', 'Cella gialla → nome evidenziato.'),
])

# ====================== BLOCCO 3 · COMPLIANCE ======================
B = blocco('compliance', 'Blocco 3 · Permessi per figura e dati personali', 'Da compilare da Compliance (con HR e Direzione)')
matrice = {
 'rapporto':['V','M','M','M','-'],'note_collega':['V','V','M','M','-'],'statistiche':['V','M','M','M','V'],'moduli':['V','M','M','M','V'],'formazione':['V','M','M','V','V'],'piano':['V','M','M','M','M'],'assistente':['M','M','M','M','M'],'consegna':['-','M','M','M','-'],'promemoria':['V','M','M','M','V'],'maison':['V','M','M','M','-'],'inventario':['V','M','M','M','M'],'registro':['-','-','-','-','-'],
 'ricerca_globale':['M','M','M','M','M'],'alert_cassa':['-','M','M','M','-'],'alert_rischio':['-','M','M','M','-'],'alert_compleanni':['V','M','M','M','V'],'template_rapidi':['-','M','M','M','-'],'firma_digitale':['-','M','M','M','-'],'qr_code':['V','M','M','V','V'],'ai_moduli':['-','M','M','M','-'],
 'ptab_calendario':['V','M','M','M','V'],'ptab_briefing':['V','M','M','M','-'],'ptab_vacanze':['V','M','M','V','V'],'ptab_saldo':['V','M','M','V','M'],'ptab_recupero':['-','M','M','V','-'],'ptab_timbrature':['V','M','M','M','M'],'ptab_statistiche':['V','M','M','V','V'],'ptab_benessere':['V','M','M','V','V'],'ptab_storico':['-','M','M','V','-'],'ptab_formulari':['V','M','M','V','V'],'ptab_turni':['V','M','M','V','M'],'ptab_regole':['V','M','M','V','M'],'ptab_festivi':['V','M','M','V','M'],'ptab_impostazioni':['-','M','M','V','M'],'ptab_guida':['V','V','V','V','V'],
 'ptabmod_calendario':['V','M','M','M','V'],'ptabmod_briefing':['V','M','M','M','-'],'ptabmod_vacanze':['V','M','M','V','V'],'ptabmod_saldo':['V','M','M','V','M'],'ptabmod_recupero':['-','M','M','V','-'],'ptabmod_timbrature':['V','M','M','M','M'],'ptabmod_turni':['V','M','M','V','M'],'ptabmod_regole':['V','M','M','V','M'],'ptabmod_festivi':['V','M','M','V','M'],'ptabmod_impostazioni':['-','M','M','V','M'],
 'gestione_punti':['V','M','M','V','M'],'gestione_impiego':['V','M','M','V','M'],'gestione_categorie':['V','M','M','-','-'],'vista_categorie':['V','V','V','-','-'],'gestione_competenze':['V','M','M','V','V'],'gestione_valutazioni':['V','M','M','V','V'],'gestione_formazioni':['V','M','M','V','V'],'gestione_piano':['V','M','M','M','V'],'gestione_corsi':['V','M','M','M','M'],'gestione_briefing':['-','M','M','M','-'],'storico_hr':['V','V','V','V','M'],'gestione_regole':['-','M','M','-','M'],'gestione_festivi':['V','M','M','V','M'],'sblocco_piano_chiuso':['V','M','M','V','M'],'vista_malattie_pct':['V','V','V','-','V'],
}
etich = {'rapporto':'Rapporto','note_collega':'Note Colleghi (chat)','statistiche':'Statistiche','moduli':'Moduli disciplinari','formazione':'Formazione','piano':'Piano di lavoro','assistente':'Assistente AI','consegna':'Consegna Turno','promemoria':'Promemoria','maison':'Costi Maison','inventario':'Inventario','registro':'Registro attivita (solo amministratore)','ricerca_globale':'Ricerca globale','alert_cassa':'Alert cassa','alert_rischio':'Alert rischio','alert_compleanni':'Compleanni Maison','template_rapidi':'Template rapidi','firma_digitale':'Firma digitale','qr_code':'QR Code su PDF','ai_moduli':'AI (genera e migliora testo)','gestione_punti':'Punti e premi: assegnare incentivi','gestione_impiego':'Impiego: assegnare Jolly / Fisso','gestione_categorie':'Categorie: assegnare la categoria professionale','vista_categorie':'Categorie: vedere la categoria','gestione_competenze':'Competenze: certificare in matrice','gestione_valutazioni':'Valutazioni: inserire e importare','gestione_formazioni':'Formazioni: registrare sessioni','gestione_piano':'Piano: modificare la griglia turni','gestione_festivi':'Festivi e CGF','gestione_corsi':'Corsi nel piano','gestione_briefing':'Briefing: compilazione','storico_hr':'Storico HR (inizio contratto, categorie, premi, allegati)','gestione_regole':'Regole del piano: modificare i valori','sblocco_piano_chiuso':'Giorni chiusi: sbloccare con motivo','vista_malattie_pct':'Malattie: pattern e percentuale','ptab_calendario':'Piano · Calendario','ptab_briefing':'Piano · Briefing','ptab_vacanze':'Piano · Vacanze','ptab_saldo':'Piano · Saldo','ptab_recupero':'Piano · Recupero ore','ptab_timbrature':'Piano · Timbrature','ptab_statistiche':'Piano · Statistiche','ptab_benessere':'Piano · Benessere','ptab_storico':'Piano · Storico','ptab_formulari':'Piano · Formulari','ptab_turni':'Piano · Turni','ptab_regole':'Piano · Regole','ptab_festivi':'Piano · Festivi','ptab_impostazioni':'Piano · Impostazioni','ptab_guida':'Piano · Guida','ptabmod_calendario':'Piano · Calendario (modifica)','ptabmod_briefing':'Piano · Briefing (compilazione)','ptabmod_vacanze':'Piano · Vacanze (import e applica)','ptabmod_saldo':'Piano · Saldo (ore reali)','ptabmod_recupero':'Piano · Recupero ore (scostamenti)','ptabmod_timbrature':'Piano · Timbrature (inserimento)','ptabmod_turni':'Piano · Turni (durate e orari)','ptabmod_regole':'Piano · Regole (valori)','ptabmod_festivi':'Piano · Festivi (calendario)','ptabmod_impostazioni':'Piano · Impostazioni'}
gruppi_m = [('Pagine del programma', ['rapporto','note_collega','statistiche','moduli','formazione','piano','assistente','consegna','promemoria','maison','inventario','registro']),
 ('Funzioni', ['ricerca_globale','alert_cassa','alert_rischio','alert_compleanni','template_rapidi','firma_digitale','qr_code','ai_moduli']),
 ('Piano di lavoro: schede visibili', [k for k in matrice if k.startswith('ptab_')]),
 ('Piano di lavoro: schede modificabili', [k for k in matrice if k.startswith('ptabmod_')]),
 ('Permessi delegabili', ['gestione_punti','gestione_impiego','gestione_categorie','vista_categorie','gestione_competenze','gestione_valutazioni','gestione_formazioni','gestione_piano','gestione_corsi','gestione_briefing','storico_hr','gestione_regole','gestione_festivi','sblocco_piano_chiuso','vista_malattie_pct'])]
profili = ['Direzione','Resp. FoBoSlot','Sostituto','Supervisor','HR']
sez(B, 'P · Regole generali degli accessi', '', [
 ('Ogni operatore ha un profilo (Direzione, Responsabile FoBoSlot, Sostituto, Supervisor, HR) e "Applica i profili" riscrive i suoi permessi; chi non ha profilo non viene toccato; i singoli permessi restano modificabili a mano.', 'Nuovo supervisor: profilo Supervisor.'),
 ('L amministratore (password master) vede e modifica tutto, incluso il Registro attivita, che gli altri non vedono.', 'Solo admin svuota il registro.'),
 ('Ogni operatore accede solo ai settori assegnati (uno, piu di uno o tutti); un settore "extra" puo essere di sola lettura; le pagine possono essere nascoste per settore (es. Maison nel Valet).', 'Operatore Valet: niente Maison.'),
 ('La chat fra colleghi e cifrata; i dati personali non vanno mai all assistente AI esterno (nomi sostituiti, foto non inviate).', '"Rossi" → "[COLLABORATORE]".'),
 ('Le impostazioni di configurazione le salva solo l amministratore, verificato dal server; ogni salvataggio fallito e segnalato.', 'Operatore dalla console: rifiutato.'),
])
sez(B, 'MATRICE', 'V = vede, M = modifica, − = non accede. Per ogni riga: la combinazione e giusta? Se Falso, scrivere quella corretta (es. "HR: M").', [('MATRICE', gruppi_m, matrice, etich, profili)])
dati_sens = [
 ('Data di nascita (compleanno)','La vede chi apre la scheda del collaboratore; la inserisce chi gestisce l anagrafica o la scheda.'),
 ('Data di assunzione e anzianita','Nella scheda e nello Storico HR; la modifica chi ha storico_hr o l amministratore.'),
 ('Giubilei e premi di fedelta','HR riceve gli avvisi; visibili nella scheda a chi vede lo Storico HR.'),
 ('Malattie: giorni, episodi e pattern','Giorni nella scheda per chi la apre; pattern e percentuale solo con vista_malattie_pct (Direzione, Resp, Sostituto, HR).'),
 ('Valutazioni annuali','Inserite da chi ha gestione_valutazioni; visibili a chi vede Formazione.'),
 ('Moduli disciplinari (Allineamento, RDI)','Pagina Moduli: Resp, Sostituto, Supervisor modificano; Direzione e HR vedono.'),
 ('Categoria professionale (5a-1a)','Vista: Direzione, Resp, Sostituto. Assegnazione: Direzione, Resp, Sostituto.'),
 ('Percentuale di impiego, Jolly/Fisso, funzione','Chi ha gestione_impiego; visibile nel piano e nella scheda.'),
 ('Congedi non pagati','Registrati nel Piano da chi gestisce il piano; visibili nella scheda.'),
 ('Saldo ore, recupero ore, timbrature','Secondo le schede del Piano nella matrice.'),
 ('Allegati HR (schede, PDF, immagini)','Chi ha storico_hr o gestione_formazioni.'),
 ('Fascicolo completo del collaboratore','Si apre da ogni tabella; il contenuto dipende dai permessi sopra.'),
 ('Punti incentivi e premi','Chi ha gestione_punti assegna; i movimenti sono visibili a chi vede Formazione.'),
 ('Registro attivita (chi ha fatto cosa)','Solo amministratore.'),
]
sez(B, 'DATI', 'Per ogni dato e per ciascuna figura scegliere: nessuno (non lo vede), vede, gestisce (inserisce e modifica). "Oggi nel programma" descrive lo stato attuale.', [('DATI', dati_sens, profili)])

# ====================== BLOCCO 4 · TUTTI ======================
B = blocco('tutti', 'Blocco 4 · Formazione, incentivi, disciplinari, Diario, Maison, sicurezza', 'Da compilare dal Responsabile con HR')
comp = J('competenze_config', {})
punti = J('punti_config', {})
sez(B, 'Q · Formazione e livelli', 'Multidisciplinarita.', [
 T(['Settore', 'Livello', 'Competenza'], [[s, str(x['livello']), x['label']] for s in comp for x in comp[s]]),
 ('Il livello di un collaboratore e il piu alto fra le competenze certificate; le competenze si certificano in matrice da chi ha il permesso; chi aveva BO o SUP ha ricevuto anche Accoglienza (L4).', 'Cassa certificata: L3.'),
 ('Dopo ' + str(imp.get('piano_giorni_formazione','5')) + ' giorni di affiancamento scritti nei commenti del piano il programma propone la certificazione.', '5 commenti "affiancamento cassa": proposta.'),
 ('Lo storico HR (inizio contratto, categorie, premi, formazioni, allegati fino a 2 MB) e riservato a chi ha il permesso; l import Excel della valutazione conserva il file originale.', 'Scheda ufficiale importata e archiviata.'),
])
sez(B, 'R · Incentivi', 'Sistema punti, accensione globale = ' + ('si' if punti.get('attivo') else 'no') + ', notifiche "' + str(punti.get('notifiche','')) + '", equita su ' + str(imp.get('equita_mesi','12')) + ' mesi.', [
 T(['Azione', 'Punti', 'Attiva'], [[a['label'], str(a['punti']), 'si' if a.get('attiva', True) else 'no'] for a in punti.get('azioni', [])]),
 T(['Soglia punti', 'Premio'], [[str(s['punti']), s['premio']] for s in punti.get('soglie', [])]),
 T(['Livello raggiunto', 'Premio di livello'], [[k, v] for k, v in (punti.get('premi_livello') or {}).items()]),
 ('Gli incentivi richiedono sempre la conferma di un supervisore; con incentivi spenti il premio non viene registrato da nessuna parte; il limite mensile e l inventario premi sono gestiti nella configurazione.', 'Popup copertura: conferma del supervisor.'),
 ('La valutazione annuale ha 11 aree (9 HR piu Versatilita e Affidabilita e disponibilita); il suggerimento di Versatilita segue la scala del settore (100% al livello massimo).', 'L3 su 6: 70%.'),
])
sa = J('soglie_alert', {}) or {}; sd = J('soglie_disciplinari', {}) or {}
sez(B, 'S · Moduli disciplinari e alert', '', [
 ('Moduli: Allineamento e Richiesta di intervento (RDI); la scadenza compare una volta sola; frase di chiusura fissa; un modulo senza Non conformita o Obiettivo chiede conferma; RDI senza frase di chiusura (come l originale).', 'Scadenza vuota: "A partire da subito".'),
 ('Il responsabile di settore sui moduli si imposta per settore (Slots: Sig.ra Fertitta Lara; Tavoli, Valet, Cleaning da compilare).', 'Modulo Slots firmato Fertitta Lara.'),
 ('Alert cassa: differenza fino a ' + str(sa.get('allineamento', 90)) + ' CHF suggerisce un Allineamento, oltre ' + str(sa.get('rdi', 500)) + ' CHF una RDI.', 'Differenza 120: allineamento.'),
 ('Alert rischio: ' + str(sd.get('amm', 2)) + ' ammonimenti, ' + str(sd.get('recidiva', 3)) + ' allineamenti con lo stesso motivo (recidiva) o ' + str(sd.get('accumulo', 3)) + ' in accumulo fanno scattare il suggerimento RDI.', 'Terzo allineamento uguale: "Recidiva".'),
 ('La ristampa di un modulo firmato digitalmente contiene le firme; ogni modulo va nel fascicolo e nel registro.', 'RDI ristampata: firme presenti.'),
 ('Una malattia registrata nel Diario (un giorno o un periodo) allinea subito il piano: i giorni con un turno diventano M protetta (8.787 ore, era il turno), i giorni di congedo C restano C e si vedono come MC (0 ore, era gia riposo), un CGF resta a credito (MCG); i recuperi automatici in piu tornano C. Correggere il periodo toglie le M dei giorni non piu coperti da nessuna registrazione.', 'Malattia 1-10 con turni 1-7 e C 8-10: sette M da 8.787 ore, tre MC da 0 ore; la scheda conta 10 giorni.'),
])
buoni = J('buono_valori', {})
sez(B, 'T · Diario, rapporto, Maison, consegne, promemoria', '', [
 ('Il Diario registra eventi per tipo (predefiniti e personalizzati) con nome verificato contro l anagrafica (suggerimento del nome simile), follow-up e scadenze.', '"Damico" → "D Amico?"'),
 ('Il rapporto giornaliero e per settore e giorno con campi configurabili; la Home mostra lo stato del settore aperto; il parser assenze riconosce singolari e plurali per nome e segnala cio che non capisce.', '"Rossi e Bianchi assenti": due righe.'),
 T(['Buono', 'Valore CHF'], [[k, str(v)] for k, v in buoni.items()]),
 ('Maison: quando un ospite ha il buono, il valore del buono va a lui e il resto del costo agli altri; le quote sommano sempre al costo della riga; il budget cliente e mensile e lo speso confrontato e quello del mese corrente in tutte le schermate.', '360 CHF, Aili BL: 40 e 320.'),
 ('Le consegne di turno si segnano lette con "Letta" o aprendole al login; i promemoria ripetitivi mensili tengono l ultimo giorno del mese; i push arrivano ogni ora (promemoria e compleanni).', '31 gennaio mensile → 28 febbraio.'),
 ('Inventario buoni e sigarette per Slots e Tavoli con categorie personalizzabili; il pareggio buoni collega un pre-assegno a una riga Maison uno a uno.', 'Pre-assegno BU pareggiato con una riga.'),
])
sez(B, 'U · Sicurezza e sessioni', '', [
 ('Ogni postazione ha la sua sessione (24 ore, rinnovo automatico); piu postazioni aperte insieme restano tutte dentro; se il rinnovo non riesce si rientra con la password. Il programma sara usato solo dai PC interni; 5 tentativi di accesso sbagliati bloccano per 30 secondi.', 'Due PC aperti insieme: entrambi dentro.'),
 ('Password: minimo 4 caratteri, cambio forzato al primo accesso e dopo un reset; password master separata con codice di recupero.', 'Nuovo operatore: cambio al primo accesso.'),
 ('Ogni salvataggio fallito mostra un avviso rosso; il programma non dice mai "salvato" senza aver scritto; ogni azione importante finisce nel Registro attivita.', 'Sessione scaduta: "esci e rientra".'),
 ('Uscita automatica dopo 8 ore di inattivita.', '8 ore senza tocco: fuori.'),
])

# ====================== HTML ======================
oggi = datetime.date.today().strftime('%d.%m.%Y')
out = []
n = 0
def opz(k):
    return ''.join('<label><input type="radio" name="%s" value="%s">%s</label>' % (k, v, l) for v, l in (('vero','Vero'),('falso','Falso'),('nonso','Non so')))
out.append('''<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verifica regole</title>
<style>
:root{--ink:#1c1a17;--paper:#fbf8f2;--paper2:#f1ece2;--line:#d7cfbf;--muted:#6c655a;--oro:#b8912f;--ok:#2c6e49;--no:#c0392b}
*{box-sizing:border-box}body{margin:0;font-family:Georgia,"Times New Roman",serif;color:var(--ink);background:var(--paper2);font-size:15px;line-height:1.45}
header{background:var(--ink);color:var(--paper);padding:22px 28px}header h1{margin:0;font-size:1.5rem;letter-spacing:.04em;font-weight:600}header p{margin:6px 0 0;color:#d9d0bd;font-size:.92rem;max-width:960px}
.barra{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--line);padding:10px 28px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.barra button,.barra a{font:inherit;font-size:.88rem;padding:7px 12px;border:1px solid var(--ink);background:var(--paper);color:var(--ink);cursor:pointer;border-radius:2px;text-decoration:none}.barra button.prim{background:var(--ink);color:var(--paper)}.barra .prog{margin-left:auto;font-size:.88rem;color:var(--muted)}
main{max-width:1200px;margin:0 auto;padding:22px 28px 60px}
.intest{background:var(--paper);border:1px solid var(--line);padding:16px 20px;margin-bottom:22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.intest label{display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.intest input{width:100%;font:inherit;padding:7px 9px;border:1px solid var(--line);background:#fff}
.legenda{font-size:.9rem;background:var(--paper);border-left:4px solid var(--oro);padding:12px 16px;margin-bottom:22px}
.blocco{margin:34px 0 14px;padding:16px 20px;background:var(--ink);color:var(--paper);border-left:6px solid var(--oro)}.blocco h2{margin:0;font-size:1.2rem;font-weight:600;letter-spacing:.04em}.blocco p{margin:4px 0 0;color:#d9d0bd;font-size:.9rem}
section{background:var(--paper);border:1px solid var(--line);margin-bottom:18px}section h3{margin:0;padding:11px 18px;font-size:.98rem;letter-spacing:.06em;text-transform:uppercase;background:var(--paper2);border-bottom:1px solid var(--line);font-weight:700}
section .intro{padding:9px 18px;color:var(--muted);font-size:.88rem;border-bottom:1px solid var(--line)}
.voce{display:grid;grid-template-columns:52px 1fr 250px;gap:12px;padding:11px 18px;border-bottom:1px solid var(--line);align-items:start}.voce:last-child{border-bottom:0}
.voce .num{font-weight:700;color:var(--oro)}.voce .testo{font-size:.96rem}.voce .es{display:block;margin-top:4px;color:var(--muted);font-size:.85rem}.voce .es b{color:var(--ink);font-weight:600}
.risp{display:flex;flex-direction:column;gap:6px}.risp .opz{display:flex;gap:6px}
.opz label{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--line);padding:6px 4px;cursor:pointer;font-size:.85rem;background:#fff;user-select:none}
.opz input{margin:0}body.solo-falsi .voce:not(.e-falso),body.solo-falsi tr[data-k]:not(.e-falso){display:none}body.solo-falsi tr.grp{display:none}.opz label.on-vero{background:#e3f0e8;border-color:var(--ok);font-weight:700}.opz label.on-falso{background:#f8e1de;border-color:var(--no);font-weight:700}.opz label.on-nonso{background:#efe9d9;border-color:var(--oro);font-weight:700}
.risp textarea{font:inherit;font-size:.85rem;width:100%;min-height:36px;padding:5px 7px;border:1px solid var(--line);background:#fff;resize:vertical}
table.mat{width:100%;border-collapse:collapse;font-size:.85rem}table.mat th,table.mat td{border:1px solid var(--line);padding:5px 7px;text-align:center;vertical-align:top}table.mat th{background:var(--paper2);font-weight:700}table.mat td.lbl{text-align:left}
table.mat tr.grp td{background:var(--paper2);font-weight:700;text-align:left;letter-spacing:.04em}
.mat .risp{flex-direction:row;align-items:start}.mat .risp .opz{min-width:186px}.mat .risp textarea{min-height:30px;min-width:130px}
.tab{padding:8px 18px 12px}select{font:inherit;font-size:.85rem;padding:4px 6px;border:1px solid var(--line);background:#fff}
.firma{background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--oro);padding:12px 16px;margin:10px 0 26px;display:grid;grid-template-columns:1fr 1fr 1fr 440px;gap:10px;align-items:end}.firme{margin:10px 0 26px}.firme h4{margin:0 0 6px;font-size:.9rem;letter-spacing:.06em;text-transform:uppercase}.firma-add{font:inherit;font-size:.82rem;padding:5px 10px;border:1px solid var(--line);background:var(--paper2);cursor:pointer;margin-top:6px}.firma select{width:100%;font:inherit;padding:6px 8px;border:1px solid var(--line);background:#fff}.firma h4{grid-column:1/-1;margin:0 0 2px;font-size:.9rem;letter-spacing:.06em;text-transform:uppercase}.firma label{display:block;font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.firma input{width:100%;font:inherit;padding:6px 8px;border:1px solid var(--line);background:#fff}.firma .pad{position:relative}.firma canvas{width:100%;height:120px;border:1px solid #888;background:#fff;touch-action:none;cursor:crosshair;display:block}.firma .pad small{display:block;color:var(--muted);font-size:.72rem;margin-top:3px}.firma .pad button{position:absolute;top:4px;right:4px;font:inherit;font-size:.72rem;padding:2px 7px;border:1px solid var(--line);background:var(--paper2);cursor:pointer}
@media print{.firma-add,.no-stampa{display:none}.firma select{border:0;border-bottom:1px solid #444;-webkit-appearance:none;appearance:none;background:#fff}.firma{grid-template-columns:1fr 1fr 1fr 300px;border:0;border-top:1px solid #000;padding:6px 0;break-inside:avoid}.firma input{border:0;border-bottom:1px solid #444}.firma canvas{height:70px;border:0;border-bottom:1px solid #000}.firma .pad button,.firma .pad small{display:none}}
@media print{body{background:#fff;font-size:11px}.barra,.no-stampa{display:none}main{max-width:none;padding:0}section{break-inside:auto;border:0;margin-bottom:8px}.voce{grid-template-columns:30px 1fr 190px;padding:5px 0;break-inside:avoid;gap:8px}
.opz label{border:1px solid #444;padding:2px 3px;font-size:10px}.opz input{-webkit-appearance:none;appearance:none;width:10px;height:10px;border:1px solid #444;margin:0;border-radius:0}.opz input:checked{background:#444}.risp textarea{min-height:30px;border:1px solid #444;font-size:10px}
header{background:#fff;color:#000;border-bottom:2px solid #000;padding:6px 0}header p{color:#333}.blocco{background:#fff;color:#000;border:0;border-bottom:2px solid #000;border-left:0;padding:8px 0;break-before:page}.blocco p{color:#333}section h3{background:#fff;border-bottom:1px solid #000;padding:6px 0}
.intest{grid-template-columns:repeat(3,1fr);border:0;padding:6px 0}.intest input{border:0;border-bottom:1px solid #444}.legenda{border-left:2px solid #000}table.mat{font-size:9.5px}table.mat th,table.mat td{padding:2px 4px;border-color:#666}.mat .risp .opz{min-width:150px}.mat .risp textarea{min-width:90px;min-height:24px}}
</style></head><body>
<header><h1>Diario Collaboratori · verifica di tutte le regole</h1><p>Ogni riga dice come il programma si comporta oggi, con un esempio. Chi conosce il regolamento segna <b>Vero</b> se e giusto, <b>Falso</b> se e sbagliato (scrivendo nella nota come dovrebbe essere), <b>Non so</b> se non e di sua competenza. Le risposte restano salvate in questo browser; alla fine <b>Salva copia compilata</b> crea il questionario completo con le risposte dentro, da rinviare: chi lo riceve lo apre e vede tutto, e con <b>Mostra solo i Falso</b> legge subito i punti da correggere. <b>Stampa</b> produce la versione su carta o PDF, un blocco per pagina.</p></header>
<div class="barra no-stampa"><button class="prim" onclick="salvaCopia()">Salva copia compilata (da inviare)</button><button onclick="salvaRisposte()">Salva solo le risposte (.json)</button><button onclick="document.getElementById('carica').click()">Carica risposte</button><button id="btn-falsi" onclick="soloFalsi()">Mostra solo i Falso</button><input type="file" id="carica" accept=".json" style="display:none" onchange="caricaRisposte(this)"><button onclick="window.print()">Stampa / PDF</button><button onclick="azzera()">Azzera</button>''' + ''.join('<a href="#b-%s">%s</a>' % (b[0], E(b[1].split('·')[0].strip())) for b in blocchi) + '''<span class="prog" id="prog"></span></div>
<main>
<div class="intest"><div><label>Compilato da</label><input data-meta="nome"></div><div><label>Funzione</label><input data-meta="funzione"></div><div><label>Data</label><input data-meta="data" value="''' + oggi + '''"></div><div><label>Versione del programma</label><input value="''' + VERS + ''' · ''' + oggi + '''" readonly></div></div>
<div class="legenda"><b>Come leggere.</b> Ogni voce e una regola o un valore cosi come il programma lo applica oggi. I nomi fra parentesi (regola ...) sono modificabili dalla scheda Regole senza toccare il programma: se e sbagliato solo il numero, scriverlo nella nota. Le tabelle (turni, codici, festivi, punti...) chiedono una risposta per riga. I quattro blocchi sono indipendenti: ognuno compila il suo.</div>''')
for bid, btit, bdest, sezioni in blocchi:
    out.append('<div class="blocco" id="b-%s"><h2>%s</h2><p>%s</p></div>' % (bid, E(btit), E(bdest)))
    for titolo, intro, voci in sezioni:
        out.append('<section>' + ('<h3>%s</h3>' % E(titolo) if titolo not in ('MATRICE','DATI') else '<h3>%s</h3>' % ('Permessi per figura: cosa vede e cosa modifica' if titolo=='MATRICE' else 'Dati personali: chi puo vederli e chi puo gestirli')) + ('<div class="intro">%s</div>' % E(intro) if intro else ''))
        for v in voci:
            if v[0] == 'TABELLA':
                _, intest, righe = v
                out.append('<div class="tab"><table class="mat"><thead><tr>%s<th style="min-width:330px">Verifica</th></tr></thead><tbody>' % ''.join('<th>%s</th>' % E(c) for c in intest))
                for r in righe:
                    n += 1; k = 'v%03d' % n
                    out.append('<tr data-k="%s">%s<td><div class="risp"><div class="opz">%s</div><textarea data-nota="%s" placeholder="Nota"></textarea></div></td></tr>' % (k, ''.join('<td%s>%s</td>' % (' class="lbl"' if i == 0 or i == 1 else '', E(str(c))) for i, c in enumerate(r)), opz(k), k))
                out.append('</tbody></table></div>')
            elif v[0] == 'MATRICE':
                _, gm, mat, et, prof = v
                out.append('<div class="tab"><table class="mat"><thead><tr><th style="text-align:left">Voce</th>%s<th style="min-width:330px">Verifica</th></tr></thead><tbody>' % ''.join('<th>%s</th>' % E(p) for p in prof))
                for gt, keys in gm:
                    out.append('<tr class="grp"><td colspan="%d">%s</td></tr>' % (len(prof) + 2, E(gt)))
                    for k2 in keys:
                        n += 1; k = 'v%03d' % n
                        out.append('<tr data-k="%s"><td class="lbl">%d · %s <span style="color:var(--muted);font-size:.76rem">(%s)</span></td>%s<td><div class="risp"><div class="opz">%s</div><textarea data-nota="%s" placeholder="Nota"></textarea></div></td></tr>' % (k, n, E(et.get(k2, k2)), k2, ''.join('<td>%s</td>' % x for x in mat[k2]), opz(k), k))
                out.append('</tbody></table></div>')
            elif v[0] == 'DATI':
                _, ds, prof = v
                out.append('<div class="tab"><table class="mat"><thead><tr><th style="text-align:left">Dato</th><th style="text-align:left;min-width:220px">Oggi nel programma</th>%s<th>Nota</th></tr></thead><tbody>' % ''.join('<th>%s</th>' % E(p) for p in prof))
                for i, (d, oggi_t) in enumerate(ds):
                    kk = 'd%02d' % i
                    out.append('<tr><td class="lbl"><b>%s</b></td><td class="lbl" style="font-size:.8rem;color:var(--muted)">%s</td>%s<td><textarea data-nota="%s" placeholder="Nota" style="min-width:140px"></textarea></td></tr>' % (E(d), E(oggi_t), ''.join('<td><select data-sel="%s-%d"><option value="">?</option><option value="nessuno">nessuno</option><option value="vede">vede</option><option value="gestisce">gestisce</option></select></td>' % (kk, j) for j in range(len(prof))), kk))
                out.append('</tbody></table></div><div class="voce"><div class="num">*</div><div class="testo">Altre figure o casi particolari (Compliance stessa, revisori esterni, un supervisor che vede solo il proprio settore): scrivere qui.</div><div class="risp"><textarea data-nota="dxx" style="min-height:70px" placeholder="Note"></textarea></div></div>')
            else:
                testo, es = v
                n += 1; k = 'v%03d' % n
                out.append('<div class="voce" data-k="%s"><div class="num">%d</div><div class="testo">%s<span class="es"><b>Esempio:</b> %s</span></div><div class="risp"><div class="opz">%s</div><textarea placeholder="Nota (se Falso: come dovrebbe essere)" data-nota="%s"></textarea></div></div>' % (k, n, E(testo), E(es), opz(k), k))
        out.append('</section>')
    out.append(firma_html(bid, btit.split('·')[0].strip() + ' (' + bdest.replace('Da compilare da ', '') + ')'))
out.append('''<section><h3>Osservazioni generali</h3><div class="voce"><div class="num">*</div><div class="testo">Regole o situazioni che nel programma mancano del tutto, oppure che andrebbero fatte in un altro modo.</div><div class="risp"><textarea data-nota="gen" style="min-height:110px" placeholder="Scrivi qui"></textarea></div></div></section>''' + firma_html('generale', 'Osservazioni generali') + '''</main>
<script>
const CH='diario_verifica_regole_''' + VERS + '''';
function stato(){const s={meta:{},risposte:{},note:{},dati:{}};document.querySelectorAll('[data-meta]').forEach(i=>s.meta[i.dataset.meta]=i.value);document.querySelectorAll('input[type=radio]:checked').forEach(r=>s.risposte[r.name]=r.value);document.querySelectorAll('textarea[data-nota]').forEach(t=>{if(t.value.trim())s.note[t.dataset.nota]=t.value});document.querySelectorAll('select[data-sel]').forEach(x=>{if(x.value)s.dati[x.dataset.sel]=x.value});firmeStato(s);return s}
// FIRME: per ogni blocco uno o piu firmatari (ruolo, nome, data, firma
// disegnata con mouse o dito). Le firme finiscono nelle risposte e nella
// copia compilata; in stampa restano ruolo, nome, data e la firma o la riga.
const RUOLI_FIRMA=["HR", "Direzione", "Responsabile FoBoSlot", "Sostituto FoBoSlot", "Supervisor", "Compliance", "Altro"];
function firmaBox(bl,i,dati){dati=dati||{};const id=bl+'-'+i;const opts=RUOLI_FIRMA.map(r=>'<option'+(dati.ruolo===r?' selected':'')+'>'+r+'</option>').join('');return '<div class="firma" data-fid="'+id+'"><div><label>Chi firma</label><select data-fr="'+id+'"><option value="">scegli</option>'+opts+'</select></div><div><label>Nome e cognome</label><input data-fn="'+id+'" value="'+(dati.nome||'').replace(/"/g,'&quot;')+'"></div><div><label>Data</label><input data-fd="'+id+'" value="'+(dati.data||'')+'" placeholder="gg.mm.aaaa"></div><div class="pad"><canvas data-firma="'+id+'"></canvas><button type="button" class="no-stampa" onclick="firmaPulisci(this)">Cancella firma</button><button type="button" class="no-stampa" style="right:96px" onclick="firmaRimuovi(this)">Togli</button><small>Firma con il mouse o con il dito; su carta, firma sulla riga.</small></div></div>'}
function firmaAggiungi(bl,dati){const c=document.querySelector('.firme[data-blocco="'+bl+'"] .firme-lista');if(!c)return null;const i=c.children.length;c.insertAdjacentHTML('beforeend',firmaBox(bl,i,dati));const box=c.lastElementChild;firmaInitCanvas(box.querySelector('canvas'));return box}
function firmaRimuovi(id){if(id&&id.closest)id=id.closest('.firma').dataset.fid;const box=document.querySelector('.firma[data-fid="'+id+'"]');if(!box)return;const lista=box.parentNode;if(lista.children.length<=1){firmaPulisci(id);box.querySelector('select').value='';box.querySelectorAll('input').forEach(i=>i.value='');salvaLocale();return}box.remove();salvaLocale()}
function firmaInitCanvas(cv){cv.width=880;cv.height=240;const ctx=cv.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#1c1a17';let giu=false,ux=0,uy=0;const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};cv.addEventListener('pointerdown',e=>{giu=true;[ux,uy]=pos(e);cv.setPointerCapture(e.pointerId);const d=cv.closest('.firma').querySelector('input[data-fd]');if(d&&!d.value)d.value=new Date().toLocaleDateString('it-IT')});cv.addEventListener('pointermove',e=>{if(!giu)return;const[x,y]=pos(e);ctx.beginPath();ctx.moveTo(ux,uy);ctx.lineTo(x,y);ctx.stroke();ux=x;uy=y;cv.dataset.firmata='1'});const fine=()=>{if(giu){giu=false;salvaLocale()}};cv.addEventListener('pointerup',fine);cv.addEventListener('pointerleave',fine)}
function firmaInit(){document.querySelectorAll('.firme').forEach(b=>{if(!b.querySelector('.firma'))firmaAggiungi(b.dataset.blocco)})}
function firmaPulisci(id){if(id&&id.closest)id=id.closest('.firma').dataset.fid;const cv=document.querySelector('canvas[data-firma="'+id+'"]');if(!cv)return;cv.getContext('2d').clearRect(0,0,cv.width,cv.height);delete cv.dataset.firmata;salvaLocale()}
function firmeStato(s){s.firme={};document.querySelectorAll('.firme').forEach(b=>{s.firme[b.dataset.blocco]=[...b.querySelectorAll('.firma')].map(box=>{const cv=box.querySelector('canvas');return{ruolo:box.querySelector('select').value,nome:box.querySelector('input[data-fn]').value,data:box.querySelector('input[data-fd]').value,img:cv.dataset.firmata?cv.toDataURL('image/png'):''}}).filter(f=>f.ruolo||f.nome||f.data||f.img)})}
function firmeApplica(s){Object.keys((s&&s.firme)||{}).forEach(bl=>{const lista=(s.firme[bl]||[]);if(!lista.length)return;const c=document.querySelector('.firme[data-blocco="'+bl+'"] .firme-lista');if(!c)return;c.innerHTML='';lista.forEach(f=>{const box=firmaAggiungi(bl,f);if(box&&f.img){const cv=box.querySelector('canvas');const im=new Image();im.onload=()=>{cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);cv.dataset.firmata='1'};im.src=f.img}})})}

function applica(s){if(!s)return;Object.keys(s.meta||{}).forEach(k=>{const i=document.querySelector('[data-meta="'+k+'"]');if(i)i.value=s.meta[k]});Object.keys(s.risposte||{}).forEach(k=>{const r=document.querySelector('input[name="'+k+'"][value="'+s.risposte[k]+'"]');if(r)r.checked=true});Object.keys(s.note||{}).forEach(k=>{const t=document.querySelector('textarea[data-nota="'+k+'"]');if(t)t.value=s.note[k]});Object.keys(s.dati||{}).forEach(k=>{const x=document.querySelector('select[data-sel="'+k+'"]');if(x)x.value=s.dati[k]});firmeApplica(s);colora();progresso()}
function colora(){document.querySelectorAll('.opz label').forEach(l=>{l.classList.remove('on-vero','on-falso','on-nonso');const i=l.querySelector('input');if(i&&i.checked)l.classList.add('on-'+i.value)});document.querySelectorAll('[data-k]').forEach(el=>{const r=el.querySelector('input[type=radio]:checked');el.classList.toggle('e-falso',!!(r&&r.value==='falso'))})}
function soloFalsi(){document.body.classList.toggle('solo-falsi');document.getElementById('btn-falsi').textContent=document.body.classList.contains('solo-falsi')?'Mostra tutto':'Mostra solo i Falso'}
function salvaCopia(){const s=stato();s.versione=CH;s.salvatoIl=new Date().toISOString();const tagS='<'+'script id="risposte-incorporate">';const tagE='<'+'/script>';let html=document.documentElement.outerHTML;const i1=html.indexOf(tagS);if(i1>=0){const i2=html.indexOf(tagE,i1);html=html.slice(0,i1)+html.slice(i2+tagE.length)}const json=JSON.stringify(s).split('</').join('<'+String.fromCharCode(92)+'/');html='<!DOCTYPE html>'+String.fromCharCode(10)+html.replace('</body>',tagS+'window.__RISPOSTE='+json+';'+tagE+'</body>');const b=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='questionario_compilato_'+(s.meta.nome||'compilato').replace(/[^a-z0-9]+/gi,'_')+'.html';a.click()}
function progresso(){const tot=document.querySelectorAll('.opz').length;const fatte=new Set([...document.querySelectorAll('input[type=radio]:checked')].map(r=>r.name)).size;const falsi=[...document.querySelectorAll('input[type=radio]:checked')].filter(r=>r.value==='falso').length;document.getElementById('prog').textContent='Compilate '+fatte+' su '+tot+(falsi?' · Falso: '+falsi:'')}
function salvaLocale(){try{localStorage.setItem(CH,JSON.stringify(stato()))}catch(e){}}
document.addEventListener('change',()=>{colora();progresso();salvaLocale()});document.addEventListener('input',salvaLocale);
function salvaRisposte(){const s=stato();const mancanti=[...document.querySelectorAll('input[type=radio][value=falso]:checked')].filter(r=>!(s.note[r.name]||'').trim());if(mancanti.length&&!confirm(mancanti.length+' risposte Falso senza nota: salvo lo stesso?'))return;s.versione=CH;s.salvatoIl=new Date().toISOString();const b=new Blob([JSON.stringify(s,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='verifica_regole_'+(s.meta.nome||'compilato').replace(/[^a-z0-9]+/gi,'_')+'.json';a.click()}
function caricaRisposte(inp){const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{applica(JSON.parse(r.result));salvaLocale()}catch(e){alert('File non valido')}};r.readAsText(f);inp.value=''}
function azzera(){if(!confirm('Cancellare tutte le risposte?'))return;localStorage.removeItem(CH);location.reload()}
firmaInit();if(window.__RISPOSTE){applica(window.__RISPOSTE)}else{try{applica(JSON.parse(localStorage.getItem(CH)||'null'))}catch(e){}}progresso();
</script></body></html>''')
open('QUESTIONARIO_VERIFICA_REGOLE_%s.html' % VERS, 'w').write('\n'.join(out))
print('voci con Vero/Falso:', n)
