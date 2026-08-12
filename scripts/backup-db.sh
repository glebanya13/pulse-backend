#!/bin/sh
# Daily Postgres backup for the vgosti stack — run via host cron (see deploy
# notes), not inside a container, since it needs `docker exec` on the host.
set -e

BACKUP_DIR="/root/vgosti-backups"
CONTAINER="vgosti-postgres-1"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y%m%d_%H%M%S)
docker exec "$CONTAINER" pg_dump -U vgosti vgosti | gzip > "$BACKUP_DIR/vgosti_$STAMP.sql.gz"

find "$BACKUP_DIR" -name 'vgosti_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
