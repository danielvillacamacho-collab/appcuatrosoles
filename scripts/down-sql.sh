#!/usr/bin/env bash
# Genera el `down.sql` de una migración de Prisma.
#
# Por qué existe: CLAUDE.md exige que toda migración sea reversible, pero Prisma sólo genera
# migraciones hacia adelante. El `down` se puede obtener con `prisma migrate diff`, sólo que
# hay que apuntarlo al estado que dejaban las migraciones ANTERIORES a la que se revierte —
# si se compara contra vacío, el `down` arrasa con toda la base en vez de deshacer un paso.
# Ese detalle es fácil de equivocar a mano y sólo se nota el día del rollback, así que vive
# aquí y no en la memoria de nadie. Ver docs/05-testing-strategy.md §6.
#
# Uso:  pnpm db:down-sql [nombre_de_la_migración]
#       sin argumento, toma la última.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGS="$RAIZ/apps/api/prisma/migrations"

if [ ! -f "$RAIZ/.env" ]; then
  echo "ERROR: no hay .env en la raíz. Copia .env.example a .env primero." >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a; . "$RAIZ/.env"; set +a

# Ojo: la ruta del proyecto puede contener espacios, así que en todo este script las listas
# de directorios se recorren con `find -print0` / `read -d ''`, nunca con `for x in $(ls)`,
# que parte las rutas en cada espacio.
lista_migraciones() {
  find "$MIGS" -maxdepth 1 -mindepth 1 -type d -not -name '.*' -print0 | sort -z
}

if [ $# -ge 1 ]; then
  OBJETIVO="$1"
else
  ULTIMA=""
  while IFS= read -r -d '' d; do ULTIMA="$d"; done < <(lista_migraciones)
  OBJETIVO="$(basename "$ULTIMA")"
fi
if [ ! -d "$MIGS/$OBJETIVO" ]; then
  echo "ERROR: no existe la migración '$OBJETIVO' en $MIGS" >&2
  exit 1
fi

# Base de datos sombra: Prisma la usa para reconstruir el estado intermedio. Se deriva de
# DATABASE_URL cambiándole el nombre, para no inventar otra variable de entorno.
SOMBRA_URL="${DATABASE_URL%/*}/polo_shadow"
SOMBRA_DB="polo_shadow"
if ! docker compose exec -T postgres psql -U polo -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$SOMBRA_DB'" | grep -q 1; then
  echo "Creando base de datos sombra '$SOMBRA_DB'..."
  docker compose exec -T postgres psql -U polo -d postgres -q -c "CREATE DATABASE $SOMBRA_DB;"
fi

# El `down` de la migración N va del estado «después de N» al estado «después de N-1».
#
# Lo que NO se debe hacer (y cuesta un rollback roto): partir del esquema actual
# (`--from-schema-datamodel`). El esquema actual incluye TODAS las migraciones, así que el
# `down` de una migración vieja saldría arrasando también con las posteriores. Se detectó
# exactamente así en T-002: regenerar el down de T-001 producía DROPs de las tablas de T-002.
# Por eso ambos extremos del diff se reconstruyen desde las carpetas de migración.
DESDE="$MIGS/.down-desde"   # migraciones 1..N   (incluye la objetivo)
HASTA="$MIGS/.down-hasta"   # migraciones 1..N-1 (el estado al que se quiere volver)
rm -rf "$DESDE" "$HASTA"; mkdir -p "$DESDE" "$HASTA"
cp "$MIGS/migration_lock.toml" "$DESDE/"
cp "$MIGS/migration_lock.toml" "$HASTA/"

while IFS= read -r -d '' d; do
  nombre="$(basename "$d")"
  cp -R "$d" "$DESDE/"
  if [ "$nombre" = "$OBJETIVO" ]; then break; fi
  cp -R "$d" "$HASTA/"
done < <(lista_migraciones)

ANTERIORES=$(find "$HASTA" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
echo "Generando down.sql de '$OBJETIVO' (volviendo al estado de $ANTERIORES migración/es anterior/es)..."

cd "$RAIZ"
if [ "$ANTERIORES" -eq 0 ]; then
  # Es la primera migración: revertirla es dejar la base vacía.
  ./node_modules/.bin/dotenv -e .env -- \
    pnpm --filter @polo/api exec prisma migrate diff \
    --from-migrations "prisma/migrations/.down-desde" \
    --to-empty \
    --shadow-database-url "$SOMBRA_URL" \
    --script > "$MIGS/$OBJETIVO/down.sql"
else
  ./node_modules/.bin/dotenv -e .env -- \
    pnpm --filter @polo/api exec prisma migrate diff \
    --from-migrations "prisma/migrations/.down-desde" \
    --to-migrations "prisma/migrations/.down-hasta" \
    --shadow-database-url "$SOMBRA_URL" \
    --script > "$MIGS/$OBJETIVO/down.sql"
fi

rm -rf "$DESDE" "$HASTA"

if [ ! -s "$MIGS/$OBJETIVO/down.sql" ]; then
  echo "ERROR: el down.sql salió vacío. No se acepta: revisa el error de prisma migrate diff." >&2
  exit 1
fi

echo "Listo: apps/api/prisma/migrations/$OBJETIVO/down.sql"
echo "Revísalo antes de commitear — es el archivo que se ejecuta el día de un rollback."
