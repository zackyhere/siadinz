# Siadinz

Astro project dengan Cloudflare D1 database.

## Prerequisites

- Node.js >= 22.23.4
- Cloudflare account
- Wrangler CLI

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Cloudflare D1

Login ke Cloudflare:
```bash
npx wrangler login
```

Buat D1 database:
```bash
npx wrangler d1 create siadinz-db
```

Copy `database_id` dari output, lalu update di `wrangler.jsonc`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "siadinz-db",
    "database_id": "YOUR_DATABASE_ID_HERE"
  }
]
```

### 3. Run Migrations

Development (local):
```bash
npx wrangler d1 execute siadinz-db --local --file=./migrations/0001_create_users.sql
```

Production:
```bash
npx wrangler d1 execute siadinz-db --remote --file=./migrations/0001_create_users.sql
```

### 4. Development Server

```bash
npm run dev
```

Server akan berjalan di `http://localhost:4321`

## Using D1 Database

### In API Routes

```typescript
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  const result = await db.prepare('SELECT * FROM users').all();
  return new Response(JSON.stringify(result.results));
};
```

### In Astro Pages

```astro
---
const db = Astro.locals.runtime.env.DB;
const users = await db.prepare('SELECT * FROM users').all();
---

<ul>
  {users.results.map(user => (
    <li>{user.name} - {user.email}</li>
  ))}
</ul>
```

## Commands

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run deploy`          | Deploy to Cloudflare Pages                       |

## Project Structure

```text
/
├── migrations/          # D1 database migrations
├── public/             # Static assets
├── src/
│   ├── assets/         # Images, fonts, etc
│   ├── components/     # Reusable Astro components
│   ├── layouts/        # Page layouts
│   ├── pages/          # File-based routing
│   │   └── api/        # API endpoints
│   └── env.d.ts        # TypeScript environment types
├── astro.config.mjs    # Astro configuration
└── wrangler.jsonc      # Cloudflare Wrangler config
```

## Deployment

```bash
npm run deploy
```

This will build the project and deploy to Cloudflare Pages. D1 database akan automatic terbind sesuai konfigurasi di `wrangler.jsonc`.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Learn More

- [Astro Documentation](https://docs.astro.build)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
