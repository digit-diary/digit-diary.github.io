# Genera COLLAUDO_FUNZIONI_<versione>.html: tutte le funzioni del programma, sezione
# per sezione, una prova per riga (cosa fare, cosa deve succedere) con Fatto,
# Va bene / Non va e nota. Si compila nel browser (resta salvato), si salva una copia
# compilata da rinviare e si stampa.
#   python3 strumenti/genera_collaudo.py <cartella con area*.json> <versione>
# Ogni area*.json: {"area": "...", "sezioni": [{"titolo": "...", "prove": [
#   {"azione": "...", "atteso": "...", "ruolo": "tutti|admin|operatore"}]}]}
# La chiave di ogni prova e ricavata dal suo testo: rigenerando il file con prove
# aggiunte, le risposte gia date alle prove rimaste uguali si ricaricano.
import datetime, glob, hashlib, html, json, os, sys

E = html.escape
CARTELLA = sys.argv[1]
VERS = sys.argv[2] if len(sys.argv) > 2 else 'v000'
ORDINE = ['area1', 'area5', 'area6', 'area4', 'area3', 'area2', 'area7']
file_aree = sorted(glob.glob(os.path.join(CARTELLA, 'area*.json')),
                   key=lambda f: ORDINE.index(os.path.basename(f)[:-5]) if os.path.basename(f)[:-5] in ORDINE else 99)
aree = [json.load(open(f, encoding='utf-8')) for f in file_aree]
RUOLI = {'tutti': ('Tutti', ''), 'admin': ('Admin', 'Serve l amministratore o il permesso della sezione'),
         'operatore': ('Operatore senza permessi', 'Da fare entrando come operatore senza permessi: deve risultare NEGATO')}
chiave = lambda *p: 'p' + hashlib.sha1('|'.join(p).encode('utf-8')).hexdigest()[:10]
oggi = datetime.date.today().strftime('%d.%m.%Y')
tot = sum(len(s['prove']) for a in aree for s in a['sezioni'])

out = ['''<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Collaudo funzioni</title>
<style>
:root{--ink:#1c1a17;--paper:#fbf8f2;--paper2:#f1ece2;--line:#d7cfbf;--muted:#6c655a;--oro:#b8912f;--ok:#2c6e49;--no:#c0392b}
*{box-sizing:border-box}body{margin:0;font-family:Georgia,"Times New Roman",serif;color:var(--ink);background:var(--paper2);font-size:15px;line-height:1.45}
header{background:var(--ink);color:var(--paper);padding:22px 28px}header h1{margin:0;font-size:1.5rem;letter-spacing:.04em;font-weight:600}header p{margin:6px 0 0;color:#d9d0bd;font-size:.92rem;max-width:980px}
.barra{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--line);padding:10px 28px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.barra button,.barra a,.barra select{font:inherit;font-size:.86rem;padding:6px 11px;border:1px solid var(--ink);background:var(--paper);color:var(--ink);cursor:pointer;border-radius:2px;text-decoration:none}.barra button.prim{background:var(--ink);color:var(--paper)}.barra button.on{background:var(--oro);border-color:var(--oro);color:#fff}
.barra .prog{margin-left:auto;font-size:.86rem;color:var(--muted);display:flex;align-items:center;gap:8px}.barra .prog i{display:inline-block;width:140px;height:8px;background:var(--line);position:relative}.barra .prog i b{position:absolute;left:0;top:0;bottom:0;background:var(--ok)}
main{max-width:1240px;margin:0 auto;padding:22px 28px 60px}
.intest{background:var(--paper);border:1px solid var(--line);padding:16px 20px;margin-bottom:22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.intest label{display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.intest input{width:100%;font:inherit;padding:7px 9px;border:1px solid var(--line);background:#fff}
.legenda{font-size:.9rem;background:var(--paper);border-left:4px solid var(--oro);padding:12px 16px;margin-bottom:22px}.legenda ul{margin:6px 0 0 18px;padding:0}
.indice{background:var(--paper);border:1px solid var(--line);padding:12px 18px;margin-bottom:22px;columns:2;column-gap:28px;font-size:.9rem}.indice a{color:var(--ink)}.indice div{break-inside:avoid;margin-bottom:3px}.indice small{color:var(--muted)}
.blocco{margin:34px 0 14px;padding:16px 20px;background:var(--ink);color:var(--paper);border-left:6px solid var(--oro)}.blocco h2{margin:0;font-size:1.2rem;font-weight:600;letter-spacing:.04em}.blocco p{margin:4px 0 0;color:#d9d0bd;font-size:.9rem}
section{background:var(--paper);border:1px solid var(--line);margin-bottom:18px}section h3{margin:0;padding:11px 18px;font-size:.96rem;letter-spacing:.05em;text-transform:uppercase;background:var(--paper2);border-bottom:1px solid var(--line);font-weight:700;display:flex;justify-content:space-between;gap:10px}section h3 small{text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted)}
.prova{display:grid;grid-template-columns:54px 1fr 1fr 250px;gap:12px;padding:10px 18px;border-bottom:1px solid var(--line);align-items:start}.prova:last-child{border-bottom:0}
.prova .num{font-weight:700;color:var(--oro)}.prova .az{font-size:.95rem}.prova .at{font-size:.9rem;color:#3d382f}.prova .lbl{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:2px}
.ruolo{display:inline-block;margin-top:5px;font-size:.72rem;padding:1px 7px;border:1px solid var(--line);color:var(--muted)}.ruolo.admin{border-color:var(--oro);color:#7a5d17}.ruolo.operatore{border-color:var(--no);color:var(--no)}
.risp{display:flex;flex-direction:column;gap:6px}.opz{display:flex;gap:5px}
.opz label{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--line);padding:6px 3px;cursor:pointer;font-size:.82rem;background:#fff;user-select:none}.opz input{margin:0}
.opz label.on-fatto{background:#efe9d9;border-color:var(--oro);font-weight:700}.opz label.on-ok{background:#e3f0e8;border-color:var(--ok);font-weight:700}.opz label.on-no{background:#f8e1de;border-color:var(--no);font-weight:700}
.risp textarea{font:inherit;font-size:.84rem;width:100%;min-height:34px;padding:5px 7px;border:1px solid var(--line);background:#fff;resize:vertical}
.prova.e-no{background:#fdf3f1}.prova.e-ok .num{color:var(--ok)}
body.f-danfare .prova.e-ok,body.f-danfare .prova.e-no{display:none}body.f-no .prova:not(.e-no){display:none}
body.r-admin .prova:not([data-r=admin]),body.r-operatore .prova:not([data-r=operatore]){display:none}
section.vuota{display:none}
@media screen and (max-width:900px){.prova{grid-template-columns:40px 1fr}.prova .at,.prova .risp{grid-column:2}}
@media print{body{background:#fff;font-size:10.5px}.barra,.no-stampa{display:none}main{max-width:none;padding:0}.indice{columns:2;border:0;padding:0}
header{background:#fff;color:#000;border-bottom:2px solid #000;padding:6px 0}header p{color:#333}.blocco{background:#fff;color:#000;border:0;border-bottom:2px solid #000;padding:8px 0;break-before:page}.blocco p{color:#333}
section{border:0;margin-bottom:8px;background:#fff}section h3{background:#fff;border-bottom:1px solid #000;padding:5px 0}.prova{grid-template-columns:28px 1fr 1fr 150px;padding:4px 0;gap:8px;break-inside:avoid}
.opz label{border:1px solid #444;padding:2px;font-size:9.5px}.opz input{-webkit-appearance:none;appearance:none;width:10px;height:10px;border:1px solid #444;margin:0;border-radius:0}.opz input:checked{background:#444}.risp textarea{min-height:26px;border:1px solid #444;font-size:9.5px}
.intest{grid-template-columns:repeat(4,1fr);border:0;padding:6px 0}.intest input{border:0;border-bottom:1px solid #444}.legenda{border-left:2px solid #000}.prova.e-no{background:#fff}}
@page{size:A4 portrait;margin:11mm 10mm}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2,h3{break-after:avoid}textarea{resize:none;overflow:hidden}}
</style></head><body>
<header><h1>Diario Collaboratori · collaudo di tutte le funzioni</h1><p>Una riga per ogni funzione del programma: <b>cosa fare</b> e <b>cosa deve succedere</b>. Fai la prova nel programma, poi spunta <b>Fatto</b> e scegli <b>Va bene</b> oppure <b>Non va</b> (nella nota scrivi cosa hai visto). Tutto resta salvato in questo browser: puoi farlo in piu volte. Alla fine <b>Salva copia compilata</b> crea il file con le spunte dentro, da rinviare. <b>Stampa</b> produce la versione su carta, un area per pagina, con le caselle da spuntare a penna.</p></header>
<div class="barra no-stampa"><button class="prim" onclick="salvaCopia()">Salva copia compilata (da inviare)</button><button onclick="salvaRisposte()">Salva solo le spunte (.json)</button><button onclick="document.getElementById('carica').click()">Carica spunte</button><input type="file" id="carica" accept=".json" style="display:none" onchange="caricaRisposte(this)">
<button id="f-tutte" class="on" onclick="filtro('tutte')">Tutte</button><button id="f-danfare" onclick="filtro('danfare')">Solo da fare</button><button id="f-no" onclick="filtro('no')">Solo i Non va</button>
<select id="f-ruolo" onchange="ruolo(this.value)"><option value="">Tutti i ruoli</option><option value="admin">Solo prove da admin</option><option value="operatore">Solo prove da operatore senza permessi</option></select>
<button onclick="window.print()">Stampa / PDF</button><button onclick="azzera()">Azzera</button><span class="prog" id="prog"></span></div>
<main>
<div class="intest"><div><label>Collaudo fatto da</label><input data-meta="nome"></div><div><label>Funzione</label><input data-meta="funzione"></div><div><label>Data</label><input data-meta="data" value="''' + oggi + '''"></div><div><label>Versione del programma</label><input value="''' + VERS + ''' · ''' + oggi + '''" readonly></div></div>
<div class="legenda"><b>Come si fa.</b> ''' + str(tot) + ''' prove in ''' + str(sum(len(a['sezioni']) for a in aree)) + ''' sezioni. Accanto a ogni prova c e per chi e:<ul>
<li><b>Tutti</b>: con il proprio operatore.</li><li><b>Admin</b>: con l amministratore o con il permesso della sezione.</li>
<li><b>Operatore senza permessi</b>: entrare con un operatore semplice e verificare che la funzione NON sia permessa (se riesce, e un Non va).</li></ul>
Prove che modificano dati: meglio su un collaboratore o un giorno di prova, e poi tornare indietro con Annulla. Se qualcosa non va, scrivi nella nota cosa hai fatto e cosa e successo: servira per correggere.</div>
<div class="indice no-stampa">''']
for ai, a in enumerate(aree):
    n = sum(len(s['prove']) for s in a['sezioni'])
    out.append('<div><a href="#a%d"><b>%s</b></a> <small>(%d prove)</small></div>' % (ai, E(a['area']), n))
out.append('</div>')
num = 0
for ai, a in enumerate(aree):
    out.append('<div class="blocco" id="a%d"><h2>%d · %s</h2><p>%d sezioni, %d prove</p></div>' % (ai, ai + 1, E(a['area']), len(a['sezioni']), sum(len(s['prove']) for s in a['sezioni'])))
    for s in a['sezioni']:
        out.append('<section><h3><span>%s</span><small class="sez-prog"></small></h3>' % E(s['titolo']))
        for p in s['prove']:
            num += 1
            r = p.get('ruolo', 'tutti')
            r = r if r in RUOLI else 'tutti'
            k = chiave(a['area'], s['titolo'], p['azione'])
            out.append('<div class="prova" data-k="%s" data-r="%s"><div class="num">%d</div><div class="az"><span class="lbl">Cosa fare</span>%s<span class="ruolo %s" title="%s">%s</span></div><div class="at"><span class="lbl">Cosa deve succedere</span>%s</div>'
                       '<div class="risp"><div class="opz"><label><input type="checkbox" data-f="%s">Fatto</label><label><input type="radio" name="%s" value="ok">Va bene</label><label><input type="radio" name="%s" value="no">Non va</label></div><textarea data-nota="%s" placeholder="Nota (se Non va: cosa hai visto)"></textarea></div></div>'
                       % (k, r, num, E(p['azione']), r, E(RUOLI[r][1]), E(RUOLI[r][0]), E(p['atteso']), k, k, k, k))
        out.append('</section>')
out.append('''<section><h3><span>Osservazioni generali</span></h3><div class="prova" style="grid-template-columns:54px 1fr"><div class="num">*</div><div class="risp"><textarea data-nota="gen" style="min-height:110px" placeholder="Funzioni che mancano, cose scomode, idee"></textarea></div></div></section>
</main>
<script>
const CH='diario_collaudo_''' + VERS + '''';
const tutte=()=>[...document.querySelectorAll('.prova[data-k]')];
function stato(){const s={meta:{},fatto:{},esito:{},note:{}};document.querySelectorAll('[data-meta]').forEach(i=>s.meta[i.dataset.meta]=i.value);document.querySelectorAll('input[data-f]').forEach(i=>{if(i.checked)s.fatto[i.dataset.f]=1});document.querySelectorAll('input[type=radio]:checked').forEach(i=>s.esito[i.name]=i.value);document.querySelectorAll('textarea[data-nota]').forEach(t=>{if(t.value.trim())s.note[t.dataset.nota]=t.value});return s}
function applica(s){if(!s)return;Object.keys(s.meta||{}).forEach(k=>{const i=document.querySelector('[data-meta="'+k+'"]');if(i)i.value=s.meta[k]});Object.keys(s.fatto||{}).forEach(k=>{const i=document.querySelector('input[data-f="'+k+'"]');if(i)i.checked=true});Object.keys(s.esito||{}).forEach(k=>{const r=document.querySelector('input[name="'+k+'"][value="'+s.esito[k]+'"]');if(r)r.checked=true});Object.keys(s.note||{}).forEach(k=>{const t=document.querySelector('textarea[data-nota="'+k+'"]');if(t)t.value=s.note[k]});aggiorna()}
function aggiorna(){let fatte=0,ok=0,no=0;tutte().forEach(p=>{const k=p.dataset.k;const f=p.querySelector('input[data-f]');const e=p.querySelector('input[type=radio]:checked');if(e&&!f.checked)f.checked=true;p.classList.toggle('e-ok',!!(e&&e.value==='ok'));p.classList.toggle('e-no',!!(e&&e.value==='no'));p.querySelectorAll('.opz label').forEach(l=>{const i=l.querySelector('input');l.className=i.checked?(i.dataset.f?'on-fatto':'on-'+i.value):''});if(f.checked)fatte++;if(e&&e.value==='ok')ok++;if(e&&e.value==='no')no++});
document.querySelectorAll('section').forEach(s=>{const pp=[...s.querySelectorAll('.prova[data-k]')];if(!pp.length)return;const f=pp.filter(p=>p.querySelector('input[data-f]').checked).length;const sp=s.querySelector('.sez-prog');if(sp)sp.textContent=f+' / '+pp.length+' fatte';s.classList.toggle('vuota',!pp.some(p=>getComputedStyle(p).display!=='none'))});
const t=tutte().length;document.getElementById('prog').innerHTML=fatte+' / '+t+' fatte · <span style="color:#2c6e49">'+ok+' vanno bene</span> · <span style="color:#c0392b">'+no+' non vanno</span> <i><b style="width:'+(t?Math.round(fatte*100/t):0)+'%"></b></i>'}
function salvaLocale(){try{localStorage.setItem(CH,JSON.stringify(stato()))}catch(e){}}
document.addEventListener('change',()=>{aggiorna();salvaLocale()});document.addEventListener('input',salvaLocale);
function filtro(f){document.body.classList.remove('f-danfare','f-no');if(f!=='tutte')document.body.classList.add('f-'+f);['tutte','danfare','no'].forEach(x=>document.getElementById('f-'+x).classList.toggle('on',x===f));aggiorna()}
function ruolo(r){document.body.classList.remove('r-admin','r-operatore');if(r)document.body.classList.add('r-'+r);aggiorna()}
function scarica(nome,tipo,testo){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([testo],{type:tipo}));a.download=nome;a.click()}
function nomeFile(s){return (s.meta.nome||'compilato').replace(/[^a-z0-9]+/gi,'_')}
function salvaRisposte(){const s=stato();s.versione=CH;s.salvatoIl=new Date().toISOString();scarica('collaudo_'+nomeFile(s)+'.json','application/json',JSON.stringify(s,null,2))}
function salvaCopia(){const s=stato();s.versione=CH;s.salvatoIl=new Date().toISOString();const tagS='<'+'script id="risposte-incorporate">';const tagE='<'+'/script>';let h=document.documentElement.outerHTML;const i1=h.indexOf(tagS);if(i1>=0){const i2=h.indexOf(tagE,i1);h=h.slice(0,i1)+h.slice(i2+tagE.length)}const json=JSON.stringify(s).split('</').join('<'+String.fromCharCode(92)+'/');h='<!DOCTYPE html>'+String.fromCharCode(10)+h.replace('</body>',tagS+'window.__RISPOSTE='+json+';'+tagE+'</body>');scarica('collaudo_compilato_'+nomeFile(s)+'.html','text/html',h)}
function caricaRisposte(inp){const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{applica(JSON.parse(r.result));salvaLocale()}catch(e){alert('File non valido')}};r.readAsText(f)}
function azzera(){if(!confirm('Cancello tutte le spunte e le note di questo browser?'))return;try{localStorage.removeItem(CH)}catch(e){}location.reload()}
window.addEventListener('load',()=>{let s=null;try{s=JSON.parse(localStorage.getItem(CH)||'null')}catch(e){}applica(window.__RISPOSTE||s);aggiorna()});
</script></body></html>''')
nome = 'COLLAUDO_FUNZIONI_%s.html' % VERS
open(nome, 'w', encoding='utf-8').write('\n'.join(out))
print('Scritto %s: %d aree, %d sezioni, %d prove' % (nome, len(aree), sum(len(a['sezioni']) for a in aree), tot))
