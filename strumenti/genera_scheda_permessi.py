# Scheda permessi correggibile: stato reale dei permessi per operatore, ogni
# casella si puo cambiare (Si / no), le modifiche restano evidenziate, note
# per operatore, copia compilata con le modifiche dentro, filtro e stampa.
import json, html, datetime, sys, os
import psycopg2
E = html.escape
# DB_LOCALE=1: database di prova locale (per provare il generatore senza toccare il cloud)
if os.environ.get('DB_LOCALE'):
    c = psycopg2.connect("host=127.0.0.1 port=55432 user=postgres dbname=diario2")
else:
    c = psycopg2.connect(f"host=aws-0-eu-central-1.pooler.supabase.com port=5432 user=postgres.brdhxzgegxhjbcgxcnfd password={os.environ['PW']} dbname=postgres sslmode=require")
cur = c.cursor(); cur.execute("select chiave, valore from impostazioni where chiave in ('visibilita','profili_operatori','operatori_reparto','operatori_accessi_extra','reparti_pagine','profili_custom')")
imp = {k: json.loads(v) for k, v in cur.fetchall()}
cur.execute("select nome from operatori_auth order by nome"); ops = [r[0] for r in cur.fetchall()]
vis = imp.get('visibilita', {}); prof = imp.get('profili_operatori', {}); rep = imp.get('operatori_reparto', {}); extra = imp.get('operatori_accessi_extra', {}); rpag = imp.get('reparti_pagine', {})
PROF = {'direzione': 'Direzione', 'resp': 'Responsabile FoBoSlot', 'sost': 'Sostituto Responsabile', 'sup': 'Supervisor', 'hr': 'HR'}
for _k, _v in (imp.get('profili_custom') or {}).items(): PROF[_k] = _v.get('nome', _k) + ' (personalizzato)'
# VOCI lette dal programma (js/settings.js, VIS_ITEMS): la lista non resta indietro
# quando si aggiunge una scheda o un permesso
import subprocess
_QUI = os.path.dirname(os.path.abspath(__file__))
_JS = r"""
const src=require('fs').readFileSync(process.argv[1],'utf8');
const a=src.indexOf('const VIS_ITEMS = {'); const b=src.indexOf('\n};',a);
const V=eval('('+src.slice(a+'const VIS_ITEMS = '.length,b+2)+')');
const m=src.match(/const PIANO_AUTO_EREDITATI = \[([^\]]*)\]/);
console.log(JSON.stringify({V, ered:(m?m[1]:'').match(/[a-z_]+/g)||[]}));
"""
_d = json.loads(subprocess.check_output(['node', '-e', _JS, os.path.join(_QUI, '..', 'js', 'settings.js')]))
VIS_ITEMS, EREDITATI = _d['V'], _d['ered']
voci = [('Pagine', list(VIS_ITEMS['pagine'].items())), ('Funzioni', list(VIS_ITEMS['funzioni'].items())),
        ('Permessi', list(VIS_ITEMS['permessi'].items())),
        ('Piano: schede visibili', list(VIS_ITEMS['piano_schede'].items())),
        ('Piano: schede modificabili', list(VIS_ITEMS['piano_modifica'].items()))]
oggi = datetime.date.today().strftime('%d.%m.%Y')
# il modello della scheda e UNO solo, nel programma (js/scheda-permessi.js): lo stesso del
# pulsante "Scarica scheda da compilare" in Impostazioni > Visibilita e permessi
dati = {'ops': ops, 'nomiProfili': PROF, 'profili': prof, 'settori': rep, 'extra': extra, 'vis': vis,
        'voci': VIS_ITEMS, 'ereditati': EREDITATI, 'oggi': oggi}
_COSTRUISCI = "const S=require(process.argv[1]);let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(S.html(JSON.parse(t))))"
pagina = subprocess.run(['node', '-e', _COSTRUISCI, os.path.join(_QUI, '..', 'js', 'scheda-permessi.js')],
                        input=json.dumps(dati), capture_output=True, text=True, check=True).stdout
open(os.environ.get('USCITA', 'SCHEDA_PERMESSI_ATTUALI.html'), 'w').write(pagina); print('scheda ok', len(ops), 'operatori')
