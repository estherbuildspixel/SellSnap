import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
