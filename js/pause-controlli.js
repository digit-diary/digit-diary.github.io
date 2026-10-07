/**
 * Diario Collaboratori · Casino Lugano SA
 * File: pause-controlli.js
 *
 * CONTROLLI DEL FOGLIO PAUSE (Slots), in funzioni PURE e testabili.
 * Riceve il foglio (contenuto: celle "riga|colonna") e le persone del giorno
 * con il loro turno e le pause che la regola prevede, e restituisce:
 *  - le pause di ogni persona, lette dal foglio;
 *  - gli avvisi: regola delle ore, distanza tra le pause, pause fuori turno,
 *    sala senza nessuno.
 * Non tocca il DOM ne il database: la prova con Node e
 * "node test/pause-controlli.test.js".
 *
 * Come si leggono le pause di una persona:
 *  1. ha una colonna propria (intestazione con il suo nome): le righe PAUSA;
 *     se ha piu colonne (es. una alternativa "ALT."), basta che una sia giusta;
 *  2. non ha colonna: le righe con la sigla del suo turno nelle colonne di chi
 *     da i cambi. Con due persone sullo stesso turno (es. due R22) le righe
 *     attaccate si dividono a turno: 15.00-15.15 alla prima, 15.15-15.30 alla
 *     seconda; con una sola persona le righe attaccate sono una pausa sola;
 *  3. il bigliettino del mattino (C4), se c e.
 * Le righe C8 sono rotazioni tra i cassieri, non cambi per la pausa: chi e
 * su C8 senza colonna propria non si controlla. Chi e su C8 e ha una colonna
 * propria solo per una parte della notte (es. CD 07 dalle 01.45) riceve le altre
 * pause da chi da le pause in cassa (righe C8 di CD 03 fuori dalla sua colonna):
 * quelle righe sono sue finche aspetta una pausa di quella durata.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.PauseControlli = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // la giornata del casino va dalle 11.00 alle 11.00 del giorno dopo:
  // un orario prima delle 11.00 e dopo mezzanotte. Se quel giorno qualcuno
  // comincia prima (es. JG dalle 10.00), la giornata parte da li: prima un JG
  // 10.00-20.00 diventava "dalle 10 alle 20 di notte" (pausa appena arrivato,
  // falsa sala vuota 04.15-10.15). Mai prima delle 07.00 (chiusura del 31.12).
  const INIZIO_GIORNATA = 660;
  let inizioOggi = INIZIO_GIORNATA;
  function impostaInizioGiornata(m) {
    inizioOggi = m != null && m >= 420 && m < INIZIO_GIORNATA ? m : INIZIO_GIORNATA;
  }
  function inizioGiornata() {
    return inizioOggi;
  }
  // distanza minima tra due pause della stessa persona (sotto: avviso)
  const DISTANZA_MIN = 60;
  // turni le cui righe nel foglio sono rotazioni, non cambi per la pausa
  const ROTAZIONE = ['C8'];

  function minuti(s) {
    const m = String(s == null ? '' : s).match(/^\s*(\d{1,2})[.:](\d{2})/);
    if (!m) return null;
    let v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if (v < inizioOggi) v += 1440;
    return v;
  }
  // stile del foglio: la fascia 24.00-24.59 si scrive 24.xx
  function ora(min) {
    let m = min;
    while (m >= 1500) m -= 1440;
    if (m >= 1440) return '24.' + String(m - 1440).padStart(2, '0');
    return String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(m % 60).padStart(2, '0');
  }
  function fascia(x) {
    return ora(x.ini) + '-' + ora(x.fin);
  }
  function intervallo(v) {
    const t = String(v == null ? '' : v);
    if (!t.includes(' - ')) return null;
    const p = t.split(' - ');
    const ini = minuti(p[0]);
    let fin = minuti(p[1]);
    if (ini == null || fin == null) return null;
    if (fin <= ini) fin += 1440;
    return { ini: ini, fin: fin };
  }
  const norm = (s) =>
    String(s == null ? '' : s)
      .toUpperCase()
      .trim();

  // colonne del foglio: intestazione (postazione + nome) e righe postazione/orario
  function blocchi(c) {
    const out = [];
    if (!c || !c.celle) return out;
    [1, 4, 7].forEach((base) => {
      let blk = null;
      for (let r = 4; r <= (c.nR || 0) + 1; r++) {
        const a = c.celle[r + '|' + base];
        const b = c.celle[r + '|' + (base + 1)];
        // intestazione: sigla marcata, oppure nome marcato con la sigla accanto
        // (fogli in cui la sigla era stata corretta a mano e aveva perso il segno)
        if ((a && a.hdr) || (a && !a.span && b && b.hdr && !b.ora)) {
          blk = {
            base: base,
            r: r,
            post: norm(a.v),
            nome: b ? String(b.v || '').trim() : '',
            personale: !!a.pers,
            opz: a.opz || '',
            righe: [],
          };
          out.push(blk);
          continue;
        }
        if (!blk || !a || !b || a.span || b.hdr) continue;
        const iv = intervallo(b.v);
        if (!iv) continue;
        blk.righe.push({
          r: r,
          pos: norm(a.v),
          ini: iv.ini,
          fin: iv.fin,
          prop: !!(a.prop || b.prop),
          per: a.per || '',
        });
      }
    });
    return out;
  }

  // pause di ogni persona. persone: [{nome, turno, ini, fin, attese:[30,15,15]}]
  // biglietti: [{righe:[{pos, nome, ini, fin}]}] (orari in minuti)
  // Righe di copertura di un turno: prima quelle scritte per qualcuno (per), poi
  // quelle che coprono esattamente una pausa di chi ha una colonna propria (sono
  // sue), il resto a chi non ha colonna: a chi aspetta ancora una pausa di quella
  // durata e da piu tempo e senza pausa (15.00-15.15 e 15.15-15.30 vanno a due persone).
  function attribuisci(c, persone, biglietti) {
    const bl = blocchi(c);
    const out = {};
    const avanzi = [];
    const fuori = {};
    const turni = {};
    persone.forEach((p) => (turni[norm(p.turno)] = 1));
    Object.keys(turni).forEach((t) => {
      const rotazione = ROTAZIONE.includes(t);
      const tutti = persone.filter((p) => norm(p.turno) === t);
      const conCol = tutti.filter((p) => bl.some((b) => norm(b.nome) === norm(p.nome)));
      if (rotazione && !conCol.length) return;
      // rotazione (C8): chi non ha colonna non si controlla, le righe non sue restano rotazioni
      const liberi = rotazione ? [] : tutti.filter((p) => !conCol.includes(p));
      const righe = [];
      // le colonne ALT. sono un alternativa a un altra colonna: non si sommano
      bl.forEach((b) => {
        if (/ALT/.test(b.post)) return;
        b.righe.forEach((x) => {
          if (x.pos === t) righe.push({ ini: x.ini, fin: x.fin, cella: x.r + '|' + b.base, per: x.per });
        });
      });
      righe.sort((a, b) => a.ini - b.ini);
      const pause = new Map(liberi.map((p) => [p, []]));
      const resto = new Map(liberi.map((p) => [p, (p.attese || []).slice()]));
      // le pause del bigliettino del mattino ci sono gia (es. la mezz ora di R22)
      (biglietti || []).forEach((bg) =>
        (bg.righe || []).forEach((x) => {
          const p = liberi.find((q) => norm(q.nome) === norm(x.nome));
          if (!p) return;
          pause.get(p).push({ ini: x.ini, fin: x.fin, biglietto: true, celle: [] });
          const r = resto.get(p);
          const k = r.indexOf(x.fin - x.ini);
          if (k >= 0) r.splice(k, 1);
        }),
      );
      const prendi = (p, x) => {
        pause.get(p).push({ ini: x.ini, fin: x.fin, cella: x.cella, celle: [x.cella], per: !!x.per });
        const r = resto.get(p);
        const k = r.indexOf(x.fin - x.ini);
        if (k >= 0) r.splice(k, 1);
      };
      const pauseCol = conCol.map((p) => {
        const l = [];
        bl.filter((q) => norm(q.nome) === norm(p.nome) && !/ALT/.test(q.post)).forEach((q) =>
          q.righe.forEach((x) => {
            if (x.pos === 'PAUSA') l.push({ ini: x.ini, fin: x.fin, usata: false });
          }),
        );
        return l;
      });
      const avanzo = [];
      // tempo coperto dalle colonne di chi ha una colonna propria: una riga con la
      // sua sigla fuori da quel tempo e una sua pausa data da un altro (es. S5 con la
      // colonna dalle 20.00 e la mezz ora alle 19.30 data da S1 o S22)
      const spanCol = conCol.map((p) => {
        const r = [];
        bl.filter((q) => norm(q.nome) === norm(p.nome) && !/ALT/.test(q.post)).forEach((q) =>
          q.righe.forEach((x) => r.push(x)),
        );
        return r;
      });
      const restoCol = conCol.map((p, k) => {
        const r = (p.attese || []).slice();
        pauseCol[k].forEach((y) => {
          const i = r.indexOf(y.fin - y.ini);
          if (i >= 0) r.splice(i, 1);
        });
        return r;
      });
      righe.forEach((x) => {
        if (x.per) {
          const p = liberi.find((q) => norm(q.nome) === norm(x.per));
          if (p) return prendi(p, x);
          if (conCol.some((q) => norm(q.nome) === norm(x.per))) return;
        }
        for (const l of pauseCol) {
          const m = l.find((y) => !y.usata && y.ini === x.ini && y.fin === x.fin);
          if (m) {
            m.usata = true;
            return;
          }
        }
        // una riga con la sigla fuori dalla colonna di chi ha una colonna propria: va a chi
        // in quel momento non ha righe nella sua colonna (es. due S5: quello con la colonna
        // del rec dalle 21.00 riceve la mezz ora delle 19.30, non quello con la colonna
        // dell intera giornata)
        // prima chi ha la colonna e aspetta ancora una pausa di quella durata (non puo
        // andare in pausa da solo), poi, se nessuno senza colonna la puo prendere, chiunque
        // abbia la colonna libera in quel momento
        const liberiOra = conCol
          .map((p, k) => ({ p: p, k: k }))
          .filter((o) => !spanCol[o.k].some((y) => y.ini < x.fin && y.fin > x.ini));
        const chiAspetta = liberiOra.find((o) => restoCol[o.k].includes(x.fin - x.ini));
        const scelto = chiAspetta || (!liberi.length && !rotazione ? liberiOra[0] : null);
        if (scelto) {
          const k = restoCol[scelto.k].indexOf(x.fin - x.ini);
          if (k >= 0) restoCol[scelto.k].splice(k, 1);
          (fuori[scelto.p.nome] = fuori[scelto.p.nome] || []).push({
            ini: x.ini,
            fin: x.fin,
            cella: x.cella,
            celle: [x.cella],
          });
          return;
        }
        avanzo.push(x);
      });
      const multi = (l) =>
        l
          .map((x) => x.fin - x.ini)
          .sort((a, b) => b - a)
          .join('+');
      const tuttiConRegola = liberi.length && liberi.every((p) => p.attese && p.attese.length);
      // una riga per volta: a chi aspetta ancora una pausa di quella durata, e
      // lontana almeno un ora dalle sue altre pause; se nessuno la aspetta e una
      // riga in piu (es. la seconda riga R22 quando c e un solo R22)
      const unaPerVolta = (conDistanza) => {
        const prova = new Map(liberi.map((p) => [p, pause.get(p).slice()]));
        const r2 = new Map(liberi.map((p) => [p, resto.get(p).slice()]));
        const scarto = [];
        avanzo.forEach((x) => {
          const d = x.fin - x.ini;
          let meglio = null;
          let punti = -Infinity;
          liberi.forEach((p) => {
            let dist = 600;
            let tocca = false;
            prova.get(p).forEach((y) => {
              if (y.ini < x.fin && y.fin > x.ini) tocca = true;
              dist = Math.min(dist, Math.abs(x.ini - y.fin), Math.abs(y.ini - x.fin));
            });
            if (tocca) return;
            if (conDistanza && (!r2.get(p).includes(d) || dist < DISTANZA_MIN)) return;
            const v = dist + (r2.get(p).includes(d) ? 1000 : 0);
            if (v > punti) {
              punti = v;
              meglio = p;
            }
          });
          if (!meglio) return scarto.push(x);
          prova.get(meglio).push({ ini: x.ini, fin: x.fin, cella: x.cella, celle: [x.cella] });
          const k = r2.get(meglio).indexOf(d);
          if (k >= 0) r2.get(meglio).splice(k, 1);
        });
        return { prova: prova, scarto: scarto };
      };
      if (liberi.length === 1 && !tuttiConRegola) {
        // una sola persona senza regola: righe attaccate = una pausa sola
        const p = liberi[0];
        avanzo.forEach((x) => {
          const l = pause.get(p);
          const u = l[l.length - 1];
          if (u && u.fin === x.ini && !u.per) {
            u.fin = x.fin;
            u.celle.push(x.cella);
          } else prendi(p, x);
        });
      } else if (liberi.length) {
        // prima si prova la lettura che rispetta la regola di tutti; se non basta,
        // per una persona sola le righe attaccate sono una pausa sola, per piu
        // persone si assegna tutto (gli avvisi diranno cosa non torna)
        const esatta = tuttiConRegola ? unaPerVolta(true) : null;
        const giusta =
          esatta &&
          liberi.every(
            (p) =>
              multi(esatta.prova.get(p)) ===
              p.attese
                .slice()
                .sort((a, b) => b - a)
                .join('+'),
          );
        if (giusta) {
          liberi.forEach((p) => pause.set(p, esatta.prova.get(p)));
          esatta.scarto.forEach((x) => avanzi.push(x.cella));
        } else if (liberi.length === 1) {
          const p = liberi[0];
          avanzo.forEach((x) => {
            const l = pause.get(p);
            const u = l[l.length - 1];
            if (u && u.fin === x.ini && !u.per) {
              u.fin = x.fin;
              u.celle.push(x.cella);
            } else prendi(p, x);
          });
        } else {
          const tutto = unaPerVolta(false);
          liberi.forEach((p) => pause.set(p, tutto.prova.get(p)));
          tutto.scarto.forEach((x) => avanzi.push(x.cella));
        }
      }
      liberi.forEach(
        (p) =>
          (out[p.nome] = pause
            .get(p)
            .filter((x) => !x.biglietto)
            .sort((a, b) => a.ini - b.ini)),
      );
    });
    return { pause: out, avanzi: avanzi, fuori: fuori };
  }
  function pausePersone(c, persone, biglietti) {
    const bl = blocchi(c);
    const res = {};
    const att = attribuisci(c, persone, biglietti);
    const coperture = att.pause;
    // pause attaccate (una riga finisce dove comincia l altra, anche in due colonne)
    // sono una pausa sola: es. R8 01.45-02.00 coperto e poi PAUSA 02.00-02.15
    const unisci = (l) => {
      const o = [];
      l.sort((a, b) => a.ini - b.ini).forEach((x) => {
        const u = o[o.length - 1];
        if (u && u.fin === x.ini) {
          u.fin = x.fin;
          u.celle = (u.celle || [u.cella]).concat(x.celle || [x.cella]);
        } else o.push(Object.assign({}, x, { celle: (x.celle || [x.cella]).slice() }));
      });
      return o;
    };
    persone.forEach((p) => {
      const nome = norm(p.nome);
      const propri = bl.filter((b) => norm(b.nome) === nome);
      if (propri.length) {
        const pauseDi = (lista) => {
          const l = [];
          lista.forEach((b) =>
            b.righe.forEach((x) => {
              if (x.pos === 'PAUSA') l.push({ ini: x.ini, fin: x.fin, cella: x.r + '|' + b.base });
            }),
          );
          (att.fuori[p.nome] || []).forEach((x) => l.push(x));
          return unisci(l);
        };
        // le colonne della stessa persona sono la sua giornata in fila; una
        // colonna ALT. e un alternativa alla sua colonna principale
        const principali = propri.filter((b) => !/ALT/.test(b.post));
        const alt = propri.filter((b) => /ALT/.test(b.post));
        const alternative = [];
        if (principali.length) alternative.push({ alt: false, pause: pauseDi(principali) });
        // solo colonne ALT. (es. "S5 tra loro"): resta valida anche la giornata nel
        // foglio, cioe le pause che riceve nelle colonne di chi da i cambi
        else alternative.push({ alt: false, pause: coperture[p.nome] || [] });
        alt.forEach((b) => alternative.push({ alt: true, pause: pauseDi([b]) }));
        res[p.nome] = { colonna: true, alternative: alternative };
      } else if (ROTAZIONE.includes(norm(p.turno))) {
        res[p.nome] = { colonna: false, rotazione: true, alternative: [] };
      } else {
        res[p.nome] = { colonna: false, alternative: [{ alt: false, pause: coperture[p.nome] || [] }] };
      }
    });
    // bigliettino del mattino: le righe con il nome della persona
    (biglietti || []).forEach((bg) =>
      (bg.righe || []).forEach((x) => {
        const p = persone.find((q) => norm(q.nome) === norm(x.nome));
        if (!p) return;
        const r = res[p.nome] || (res[p.nome] = { colonna: false, alternative: [{ alt: false, pause: [] }] });
        if (!r.alternative.length) r.alternative.push({ alt: false, pause: [] });
        // la stessa pausa gia nella sua colonna (es. S22 che da i cambi) non si conta due volte
        r.alternative.forEach((a) => {
          if (!a.pause.some((y) => y.ini === x.ini && y.fin === x.fin))
            a.pause.push({ ini: x.ini, fin: x.fin, biglietto: true });
        });
      }),
    );
    Object.keys(res).forEach((k) => res[k].alternative.forEach((a) => a.pause.sort((x, y) => x.ini - y.ini)));
    return res;
  }
  // scrive nelle celle a chi va ogni riga di copertura, cosi le modifiche
  // successive (completamento, frecce) non cambiano l attribuzione
  function fissaAttribuzioni(c, persone, biglietti) {
    const cop = attribuisci(c, persone, biglietti).pause;
    Object.keys(cop).forEach((nome) =>
      cop[nome].forEach((x) =>
        (x.celle || [x.cella]).forEach((k) => {
          if (c.celle[k] && !c.celle[k].per) c.celle[k].per = nome;
        }),
      ),
    );
  }

  // problemi di una lista di pause rispetto alla regola della persona
  function problemiPause(p, pause) {
    const out = [];
    const attese = (p.attese || []).slice().sort((a, b) => b - a);
    const fatte = pause.map((x) => x.fin - x.ini).sort((a, b) => b - a);
    const comp = (l) => (l.length ? l.join('+') : 'nessuna');
    if (attese.join('+') !== fatte.join('+'))
      out.push({
        tipo: 'ore',
        testo: 'la regola prevede ' + comp(attese) + ', nel foglio ' + comp(fatte),
      });
    for (let i = 1; i < pause.length; i++) {
      const d = pause[i].ini - pause[i - 1].fin;
      if (d < 0)
        out.push({
          tipo: 'distanza',
          testo: 'le pause ' + fascia(pause[i - 1]) + ' e ' + fascia(pause[i]) + ' si sovrappongono',
        });
      else if (d < DISTANZA_MIN)
        out.push({
          tipo: 'distanza',
          testo:
            'tra ' +
            fascia(pause[i - 1]) +
            ' e ' +
            fascia(pause[i]) +
            ' solo ' +
            d +
            ' minuti (minimo ' +
            DISTANZA_MIN +
            ')',
        });
    }
    if (p.ini != null && p.fin != null)
      pause.forEach((x) => {
        if (x.ini < p.ini || x.fin > p.fin)
          out.push({
            tipo: 'turno',
            testo: 'la pausa ' + fascia(x) + ' e fuori dal turno ' + ora(p.ini) + '-' + ora(p.fin),
          });
      });
    return out;
  }

  // dove si trova una persona in un momento: 'sala', 'pausa', 'altro', null (fuori turno)
  // reparto di una persona: quello indicato (es. JG in sala, sigla che non lo dice)
  // oppure la prima lettera della sigla (S sala, C cassa, R rec)
  function settore(p) {
    if (p.sett) return p.sett;
    const t = norm(p.turno);
    return /^[SCR]/.test(t) ? t[0] : null;
  }
  // riga di cambio per un JG: il reparto e quello scelto per il JG quel giorno
  // (sala, rec o cassa), registrato quando si leggono le persone
  function settoreJG(x) {
    const m = (typeof globalThis !== 'undefined' && globalThis._pcSettJG) || {};
    return m[norm(x.per || '')] || 'S';
  }
  function posizione(p, info, bl, t) {
    const nome = norm(p.nome);
    const propri = bl.filter((b) => norm(b.nome) === nome && !/ALT/.test(b.post));
    for (const b of propri) {
      const x = b.righe.find((y) => y.ini <= t && t < y.fin);
      if (x) {
        if (x.pos === 'PAUSA') return 'pausa';
        if (x.pos === 'JG') return settoreJG(x) === 'S' ? 'sala' : 'altro';
        return x.pos === 'SALA' || /^S\d/.test(x.pos) ? 'sala' : 'altro';
      }
    }
    if (p.ini == null || t < p.ini || t >= p.fin) return null;
    const alt = info && info.alternative[0];
    if (alt && alt.pause.some((x) => x.ini <= t && t < x.fin)) return 'pausa';
    return settore(p) === 'S' && !p.acc ? 'sala' : 'altro';
  }

  // in quale reparto e una persona in un momento, leggendo il foglio: 'S' sala,
  // 'C' cassa, 'R' rec, 'pausa', oppure null (fuori turno). La sigla della riga dice
  // dove si trova: S1 che nella sua colonna ha "S22" e in sala al posto di S22 (che e
  // in pausa); con "C0" o "R22" e in cassa o al rec, e in sala resta S22.
  function reparto(p, info, bl, t) {
    const nome = norm(p.nome);
    const propri = bl.filter((b) => norm(b.nome) === nome && !/ALT/.test(b.post));
    for (const b of propri) {
      const x = b.righe.find((y) => y.ini <= t && t < y.fin);
      if (x) {
        if (x.pos === 'PAUSA') return 'pausa';
        if (x.pos === 'SALA') return 'S';
        if (x.pos === 'REC') return 'R';
        if (x.pos === 'CASSA') return 'C';
        if (x.pos === 'JG') return settoreJG(x);
        return /^[SCR]/.test(x.pos) ? x.pos[0] : 'S';
      }
    }
    if (p.ini == null || t < p.ini || t >= p.fin) return null;
    const alt = info && info.alternative[0];
    if (alt && alt.pause.some((x) => x.ini <= t && t < x.fin)) return 'pausa';
    // l accoglienza al suo posto non e in sala
    if (p.acc) return 'A';
    return settore(p);
  }
  // quarti d ora in cui in sala non c e nessuno
  function salaVuota(c, persone, pp, biglietti) {
    const bl = blocchi(c);
    const sala = persone.filter((p) => settore(p) === 'S' && !p.acc && p.ini != null);
    if (!sala.length) return [];
    const da = Math.ceil(Math.min(...sala.map((p) => p.ini)) / 15) * 15;
    const a = Math.max(...sala.map((p) => p.fin));
    const buchi = [];
    for (let t = da; t < a; t += 15) {
      let n = 0;
      persone.forEach((p) => {
        if (posizione(p, pp[p.nome], bl, t) === 'sala') n++;
      });
      // chi dal bigliettino copre una postazione di sala (es. C4 su S22)
      (biglietti || []).forEach((bg) =>
        (bg.righe || []).forEach((x) => {
          if (x.chi && /^S/.test(norm(x.pos)) && x.ini <= t && t < x.fin) n++;
        }),
      );
      if (!n) {
        const u = buchi[buchi.length - 1];
        if (u && u.fin === t) u.fin = t + 15;
        else buchi.push({ ini: t, fin: t + 15 });
      }
    }
    return buchi;
  }

  // tutti gli avvisi del foglio
  function controlla(c, persone, opz) {
    const o = opz || {};
    const pp = pausePersone(c, persone, o.biglietti);
    const avvisi = [];
    persone.forEach((p) => {
      const info = pp[p.nome];
      // accoglienza (es. S31): si organizzano da soli, nessun controllo
      if (!info || info.rotazione || p.acc) return;
      if (!(p.attese && p.attese.length) && !info.alternative.some((a) => a.pause.length)) return;
      const esiti = info.alternative.map((a) => ({ a: a, prob: problemiPause(p, a.pause) }));
      if (esiti.some((e) => !e.prob.length)) return;
      const e = esiti.find((x) => !x.a.alt) || esiti[0];
      const celle = [];
      e.a.pause.forEach((x) => (x.celle || (x.cella ? [x.cella] : [])).forEach((k) => celle.push(k)));
      const chi = p.nome + ' (' + norm(p.turno) + (p.ini != null ? ', ' + ora(p.ini) + '-' + ora(p.fin) : '') + ')';
      e.prob.forEach((x) => avvisi.push({ tipo: x.tipo, nome: p.nome, testo: chi + ': ' + x.testo, celle: celle }));
    });
    // VENERDI E SABATO chi da le pause in cassa (colonne CD, C8...) resta in cassa: una
    // riga di una postazione di sala nella sua colonna si segnala (decisione del titolare
    // 05.10). Prima la regola valeva solo quando le pause si generavano: una riga scritta
    // a mano o un foglio vecchio non dava avviso.
    if (o.venSab) {
      const diSala = new Set(persone.filter((p) => settore(p) === 'S').map((p) => norm(p.turno)));
      blocchi(c)
        .filter((b) => /^C/.test(b.post) && !/ALT/.test(b.post) && b.nome)
        .forEach((b) =>
          b.righe.forEach((x) => {
            if (!diSala.has(x.pos)) return;
            avvisi.push({
              tipo: 'cassa',
              nome: b.nome,
              testo:
                b.nome +
                ' (' +
                b.post +
                ') copre la pausa di ' +
                x.pos +
                ' in sala alle ' +
                ora(x.ini) +
                ': il venerdi e il sabato chi da le pause in cassa resta in cassa',
              celle: [x.r + '|' + b.base],
            });
          }),
        );
    }
    attribuisci(c, persone, o.biglietti).avanzi.forEach((k) => {
      const [r, col] = k.split('|');
      const a = c.celle[k];
      const b = c.celle[r + '|' + (parseInt(col) + 1)];
      avvisi.push({
        tipo: 'riga',
        testo: 'La riga ' + (a ? a.v : '') + ' ' + (b ? b.v : '') + ' non copre la pausa di nessuno',
        celle: [k],
      });
    });
    // buchi vicini (meno di un ora fra uno e l altro) in un avviso solo
    const gruppi = [];
    salaVuota(c, persone, pp, o.biglietti).forEach((b) => {
      const g = gruppi[gruppi.length - 1];
      if (g && b.ini - g.fin < 60) {
        g.fin = b.fin;
        g.min += b.fin - b.ini;
        g.n++;
      } else gruppi.push({ ini: b.ini, fin: b.fin, min: b.fin - b.ini, n: 1 });
    });
    gruppi.forEach((g) => {
      const h = Math.floor(g.min / 60);
      const m = g.min % 60;
      const durata = h ? (h === 1 ? '1 ora' : h + ' ore') + (m ? ' e ' + m + ' minuti' : '') : m + ' minuti';
      avvisi.push({
        tipo: 'sala',
        testo:
          g.n === 1
            ? 'Dalle ' + ora(g.ini) + ' alle ' + ora(g.fin) + ' in sala non resta nessuno'
            : 'Fra le ' +
              ora(g.ini) +
              ' e le ' +
              ora(g.fin) +
              ' in sala non resta nessuno per ' +
              durata +
              ' in tutto (' +
              g.n +
              ' volte)',
        celle: [],
      });
    });
    return avvisi;
  }

  return {
    INIZIO_GIORNATA,
    impostaInizioGiornata,
    inizioGiornata,
    DISTANZA_MIN,
    settore,
    ROTAZIONE,
    minuti,
    ora,
    intervallo,
    blocchi,
    attribuisci,
    pausePersone,
    fissaAttribuzioni,
    problemiPause,
    posizione,
    reparto,
    salaVuota,
    controlla,
  };
});
