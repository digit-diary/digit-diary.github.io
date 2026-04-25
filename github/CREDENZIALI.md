# DiarioCollaboratori - Credenziali e Configurazione

## GitHub
- **Repo**: https://github.com/digit-diary/digit-diary.github.io
- **Account push**: digit-diary
- **Sito live**: https://digit-diary.github.io
- **Branch**: main
- **Account GitHub configurati**: digit-diary (attivo), Mux88, burgtv, Piani-CL
- **Comando switch**: `gh auth switch --user digit-diary`

## Supabase
- **Progetto**: DiarioCollaboratori
- **ID Progetto**: bdxqtzehoapilwzqlgnv
- **URL**: https://bdxqtzehoapilwzqlgnv.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/bdxqtzehoapilwzqlgnv
- **RLS**: deny_all_anon su TUTTE le tabelle
- **Migrazioni**: /Users/bushi/Desktop/DiarioCollaboratori/supabase/migrations/

## API Keys (nel codice, offuscate)
- **Supabase URL e Key**: offuscate in index.html con _d(_u) e _d(_a)
- **VAPID Key** (push notifications): BLWf5mPlI4UySMKuPkj6O7nTxXbocOu8ggabz8Lit4MsgDuYHAkh49V4TH2dk8fuFu-gvDH1MYHSsdbNfIdPF_E
- **Groq Key**: salvata nel DB Supabase (impostazioni), non nel codice

## Gemini (non in uso - limiti troppo bassi)
- **Key 1**: AIzaSyDUXith3zmf4pRmQNsgTzKc9TAe99ODJ_Q
- **Key 2**: AIzaSyBRqZBVaWH07G06OYOwJulsDOP_dPVBQNU
- **Key 3**: AIzaSyCw_cj7DTVUiGvq1fIj7_M08GaxbV6HC9c
- **Account**: kenallt88@gmail.com
- **Progetto Google**: Diario CL
- **Limite free**: 20 richieste/giorno (troppo basso)

## GitHub Actions
- **Cron**: ogni ora per push promemoria + compleanni
- **Limite free**: 2000 minuti/mese (uso attuale ~720 min/mese)

## Service Worker
- **File**: sw.js
- **Cache corrente**: v7
- **Strategia**: network-first per HTML, cache fallback per assets

## Struttura File
```
/Users/bushi/Desktop/DiarioCollaboratori/
├── index.html          (app principale, ~6500 righe)
├── sw.js               (service worker, cache v7)
├── manifest.json       (PWA manifest)
├── logo_casino.png     (logo)
├── icon-192.png        (icona PWA)
├── icon-512.png        (icona PWA)
├── supabase/
│   ├── config.toml     (configurazione Supabase CLI)
│   ├── migrations/     (migrazioni DB)
│   └── functions/      (edge functions)
└── github/
    └── CREDENZIALI.md  (questo file)
```

## Tabelle DB Supabase
- registrazioni, note_fissate, scadenze, note_colleghi
- collaboratori, moduli, log_attivita, costi_maison
- maison_budget, promemoria, consegne_turno, spese_extra
- regali_maison, note_clienti, rapporti_giornalieri
- impostazioni, push_subscriptions, operatori_auth
- operator_sessions, login_attempts

## Migrazioni Applicate
- 20260318: secure_all (RPC functions)
- 20260319: realtime encryption
- 20260320: letta_at
- 20260321: cleanup seven dupes
- 20260322: collaboratori nascita
- 20260323: enable RLS all
- 20260324: fix RLS
- 20260326: diag check
- 20260330: fix upsert rapporto
- 20260338: updated_by (aggiornato_da/at)
- 20260343: add bu/bl categoria check
- 20260344: add CG/WL tipo_buono check

## Note Sicurezza
- NON committare questo file nel repo pubblico!
- Le API key Supabase sono offuscate ma estraibili dal codice
- La Groq key è nel DB, non nel codice
- Password operatori hashate nel DB
