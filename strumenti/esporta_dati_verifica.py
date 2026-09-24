# Esporta le tabelle che servono a strumenti/verifica_crediti.js in JSON.
#   PW="$(cat .supabase_db_password.txt)" python3 strumenti/esporta_dati_verifica.py
import psycopg2, os, json, datetime, decimal
OUT = os.path.join(os.path.dirname(__file__), 'dati_verifica', 'db')
os.makedirs(OUT, exist_ok=True)
c = psycopg2.connect(host='aws-0-eu-central-1.pooler.supabase.com', port=5432, user='postgres.brdhxzgegxhjbcgxcnfd', password=os.environ['PW'], dbname='postgres', sslmode='require')
cur = c.cursor()
def conv(v):
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)): return v.isoformat()
    if isinstance(v, decimal.Decimal): return float(v)
    return v
anno = datetime.date.today().year
Q = {
 'piano': f"select * from piano where data>='{anno-1}-01-01'", 'piano_vacanze': "select * from piano_vacanze", 'piano_cgf_riporto': "select * from piano_cgf_riporto",
 'collaboratori': "select * from collaboratori", 'piano_turni': "select * from piano_turni", 'piano_codici': "select * from piano_codici",
 'piano_festivita': "select * from piano_festivita", 'piano_festivi': "select * from piano_festivi", 'piano_regole': "select * from piano_regole",
 'piano_regole_gruppo': "select * from piano_regole_gruppo", 'piano_saldo_iniziale': "select * from piano_saldo_iniziale",
 'piano_recupero_ore': f"select * from piano_recupero_ore where data>='{anno}-01-01'", 'collab_congedi_np': "select * from collab_congedi_np",
 'registrazioni': "select id,nome,tipo,testo,data,eliminato,reparto_dip from registrazioni where tipo ilike '%malatt%'",
 'piano_ore_mese': "select * from piano_ore_mese", 'piano_timbrature': f"select * from piano_timbrature where data>='{anno}-01-01'",
 'impostazioni': "select chiave,valore from impostazioni where chiave not in ('password_hash','password_hash_v2','recovery_code','groq_api_key')",
}
for t, q in Q.items():
    cur.execute(q); cols = [d[0] for d in cur.description]
    rows = [{k: conv(v) for k, v in zip(cols, r)} for r in cur.fetchall()]
    json.dump(rows, open(os.path.join(OUT, t + '.json'), 'w')); print(t, len(rows))
