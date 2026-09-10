#!/usr/bin/env bash
# Roda a suíte pgTAP num Postgres 16 LOCAL, sem Docker e sem projeto remoto:
#
#   scripts/pgtap-local/run.sh            # banco do zero + todas as migrations + pg_prove
#   scripts/pgtap-local/run.sh --keep     # não recria o banco (reusa o da última vez)
#   scripts/pgtap-local/run.sh -- supabase/tests/database/crm_*.test.sql   # só alguns
#
# É o mesmo caminho do job `banco` do CI (supabase start + supabase test db),
# para quando não há Docker: `supabase-lite.sql` simula o que as migrations
# tocam do Supabase e `fake-extensions.sh` instala stubs de pg_net,
# supabase_vault e pgmq. O que se prova aqui é RLS, trigger e função SQL —
# o que a suíte cobre. O CI continua sendo a prova final.
#
# Pré-requisitos (Ubuntu): postgresql-16 postgresql-16-pgtap postgresql-16-cron
# libtap-parser-sourcehandler-pgtap-perl, e sudo sem senha para ajustar o
# preload do pg_cron na primeira vez.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${PGTAP_DB:-helpoint_test}"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"
KEEP=0
TESTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --) shift; TESTS=("$@"); break ;;
    *) TESTS+=("$1"); shift ;;
  esac
done
[ ${#TESTS[@]} -eq 0 ] && TESTS=("$ROOT"/supabase/tests/database/*.test.sql)
# pg_prove roda de dentro da pasta dos testes (por causa do `\ir _helpers.psql`): caminhos viram absolutos antes
for i in "${!TESTS[@]}"; do TESTS[$i]="$(realpath "${TESTS[$i]}")"; done

as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo -n "$@"; fi; }
as_pg()   { as_root runuser -u postgres -- "$@"; }

# ── pg_cron só carrega por shared_preload_libraries; ajusta uma vez e reinicia
PGCONF="$(as_pg psql -Atc "show config_file" 2>/dev/null || echo /etc/postgresql/16/main/postgresql.conf)"
if ! grep -qE "^shared_preload_libraries\s*=\s*'.*pg_cron" "$PGCONF"; then
  echo "» ligando pg_cron em $PGCONF (reinicia o Postgres)"
  as_root bash -c "printf \"\nshared_preload_libraries = 'pg_cron'\ncron.database_name = '$DB'\n\" >> '$PGCONF'"
  as_root pg_ctlcluster 16 main restart
elif ! grep -qE "^cron.database_name\s*=\s*'$DB'" "$PGCONF"; then
  as_root bash -c "sed -i -E \"s/^cron.database_name.*/cron.database_name = '$DB'/\" '$PGCONF'"
  as_root pg_ctlcluster 16 main restart
fi
# senha do postgres local, para PGPASSWORD funcionar em TCP
as_pg psql -qc "alter role postgres password '$PGPASSWORD'" >/dev/null

# ── stubs de extensão
bash "$ROOT/scripts/pgtap-local/fake-extensions.sh" >/dev/null

# ── banco do zero + migrations
if [ "$KEEP" = 0 ]; then
  echo "» recriando $DB"
  psql -d postgres -v ON_ERROR_STOP=1 -qc "drop database if exists $DB with (force)" -c "create database $DB"
  psql -d "$DB" -qc "alter database $DB set search_path = public, extensions"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/pgtap-local/supabase-lite.sql"
  psql -d "$DB" -qc "create extension if not exists pgtap"
  echo "» aplicando migrations"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    v="$(basename "$f" | cut -d_ -f1)"
    if ! psql -d "$DB" -v ON_ERROR_STOP=1 -q -1 -f "$f" >/tmp/pgtap-local-migration.log 2>&1; then
      echo "✗ migration falhou: $(basename "$f")"; cat /tmp/pgtap-local-migration.log; exit 1
    fi
    psql -d "$DB" -qc "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$(basename "$f" .sql)') on conflict do nothing"
  done
  echo "» $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations aplicadas"
fi

# ── pgTAP
echo "» pg_prove"
cd "$ROOT/supabase/tests/database"
pg_prove -d "$DB" --ext .sql "${TESTS[@]}"
