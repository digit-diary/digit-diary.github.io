#!/usr/bin/env python3
"""
Script per importare il backup JSON nel nuovo server PostgreSQL.
Uso: python3 import_backup.py <file_backup.json> <supabase_url> <service_role_key>

Esempio:
  python3 import_backup.py backup_2026-04-25.json http://10.0.1.50:8000 eyJ...
"""
import json, sys, urllib.request, urllib.error

if len(sys.argv) < 4:
    print("Uso: python3 import_backup.py <backup.json> <supabase_url> <service_role_key>")
    sys.exit(1)

backup_file = sys.argv[1]
base_url = sys.argv[2].rstrip('/') + '/rest/v1'
key = sys.argv[3]

with open(backup_file) as f:
    data = json.load(f)

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# Ordine di import (rispetta foreign keys)
ORDER = [
    "impostazioni", "collaboratori", "operatori_auth",
    "registrazioni", "note_fissate", "scadenze",
    "moduli", "log_attivita",
    "costi_maison", "maison_budget", "spese_extra", "regali_maison", "note_clienti",
    "rapporti_giornalieri", "consegne_turno", "promemoria",
    "push_subscriptions", "inventario",
    "chat_groups", "chat_group_members", "chat_messages",
    "chat_message_letti", "chat_message_hidden",
]

for table in ORDER:
    if table not in data.get("tables", {}):
        print(f"  SKIP {table} (non nel backup)")
        continue
    info = data["tables"][table]
    if info.get("skipped") or info.get("error"):
        print(f"  SKIP {table}")
        continue
    rows = info.get("rows", [])
    if not rows:
        print(f"  {table}: 0 righe")
        continue
    
    # Insert in batch da 100
    ok = 0
    for i in range(0, len(rows), 100):
        batch = rows[i:i+100]
        body = json.dumps(batch).encode()
        req = urllib.request.Request(f"{base_url}/{table}", data=body, headers=headers, method="POST")
        try:
            urllib.request.urlopen(req, timeout=30)
            ok += len(batch)
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:200]
            print(f"  ⚠ {table} batch {i}: {err}")
    print(f"  ✓ {table}: {ok}/{len(rows)} righe importate")

print("\nImport completato.")
