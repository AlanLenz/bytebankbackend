import { Pool } from 'pg';

export const pool = new Pool({
  // Using the Docker network string we set up in docker-compose.yml
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/fluxo',
});