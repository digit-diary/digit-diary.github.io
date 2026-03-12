// ============================================
// Script di Migrazione localStorage → Supabase
// ============================================
// 1. Apri il VECCHIO file HTML (quello con localStorage) nel browser
// 2. Apri la Console del browser (F12 → Console)
// 3. Incolla TUTTO questo script e premi Invio
// 4. Aspetta il messaggio "Migrazione completata!"

(async function migraASupabase() {
  // ⚠️ INSERISCI QUI le tue credenziali Supabase
  const SUPABASE_URL = 'https://TUO-PROGETTO.supabase.co';
  const SUPABASE_ANON_KEY = 'LA-TUA-ANON-KEY';

  // Leggi dati dal localStorage
  const raw = localStorage.getItem('diario_collaboratori');
  if (!raw) {
    console.log('❌ Nessun dato trovato in localStorage (chiave: diario_collaboratori)');
    return;
  }

  const dati = JSON.parse(raw);
  console.log(`📋 Trovate ${dati.length} registrazioni da migrare`);

  if (dati.length === 0) {
    console.log('✅ Nessun dato da migrare');
    return;
  }

  // Prepara i record per Supabase
  const records = dati.map(e => ({
    id: e.id,
    nome: e.nome,
    tipo: e.tipo,
    testo: e.testo,
    data: e.data,
  }));

  // Inserisci a blocchi di 500 (limite Supabase)
  const BATCH_SIZE = 500;
  let totale = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/registrazioni`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ Errore batch ${i}-${i + batch.length}:`, err);
    } else {
      totale += batch.length;
      console.log(`✅ Migrati ${totale}/${records.length}`);
    }
  }

  console.log(`\n🎉 Migrazione completata! ${totale} registrazioni caricate su Supabase`);
  console.log('Ora puoi usare la nuova versione del file HTML con Supabase.');
})();
