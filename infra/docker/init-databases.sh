#!/bin/bash
set -e
for db in identity_db billing_db activity_db session_db scoring_db rewards_db notification_db audit_db ai_db; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $db;
EOSQL
done
