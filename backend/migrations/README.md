# Database Migrations

This directory contains SQL migration scripts for the Synapse application.

## Migration Files

### 001_add_cloud_sql_auth_tables.sql
Creates the authentication system tables:
- `users` - User accounts with email, password hash, verification tokens
- `refresh_tokens` - JWT refresh tokens for session management

**To apply:**
```sql
psql -h <host> -U <user> -d <database> -f 001_add_cloud_sql_auth_tables.sql
```

For Cloud SQL (local development with Cloud SQL Proxy):
```bash
psql "host=localhost port=5432 dbname=local user=local_user" -f 001_add_cloud_sql_auth_tables.sql
```

**To rollback:**
```sql
psql -h <host> -U <user> -d <database> -f 001_rollback_auth_tables.sql
```

## Applying Migrations to All Environments

### Local Database
```bash
cd backend/migrations
psql "host=localhost port=5432 dbname=local user=local_user" -f 001_add_cloud_sql_auth_tables.sql
```

### Dev Database
```bash
# Via Cloud SQL Proxy
cloud-sql-proxy synapse:asia-south1:synapse &
psql "host=localhost port=5432 dbname=dev user=dev_user" -f 001_add_cloud_sql_auth_tables.sql
```

### Production Database
```bash
# Via Cloud SQL Proxy
cloud-sql-proxy synapse:asia-south1:synapse &
psql "host=localhost port=5432 dbname=prod user=prod_user" -f 001_add_cloud_sql_auth_tables.sql
```

### Via GCP Console (UI Method)

1. Go to Cloud SQL in GCP Console
2. Select your instance: `synapse`
3. Click on "Cloud Shell" or use the "Execute SQL" feature
4. Connect to the desired database (local/dev/prod)
5. Copy and paste the content of `001_add_cloud_sql_auth_tables.sql`
6. Execute the SQL

## Migration History

| Migration | Description | Date |
|-----------|-------------|------|
| 001 | Add Cloud SQL authentication tables | 2025-01-XX |

## Notes

- Always backup your database before applying migrations
- Test migrations on local/dev before applying to production
- Keep this README updated with new migrations
- Migration files are numbered sequentially (001, 002, etc.)
