# Incubus Backend

- **Port:** 7000 (set via `PORT` in `.env`)
- **DB:** MongoDB — set `MONGODB_URI` in `.env`

## Setup

1. Copy `.env.example` to `.env` and set:
   - `PORT=7000`
   - `BASE_URL` (your public URL, e.g. `https://your-domain.com` for production)
   - `MONGODB_URI=mongodb+srv://...`
   - `JWT_SECRET` (any string for production)
   - `ASKEVA_COMPANY_ID` (default: `default`)
   - `WEBHOOK_VERIFY_TOKEN` (optional; for webhook verification, default: `askeva_webhook_verify`)
2. Install and run:

```bash
cd backend
npm install
npm run dev
```

## Seed (Super Admin)

On every server start, the app checks for a user with email `superadmin@gmail.com`. If missing, it creates one with:

- **Email:** superadmin@gmail.com  
- **Password:** 123456  
- **Role:** superadmin  

So if you clear the `users` collection and restart the backend, the Super Admin is re-seeded automatically.

## Webhook URLs (for Askeva / WhatsApp)

Configure one of these in your Askeva panel. Replace `BASE_URL` and `companyId` as needed:

- **Main webhook:** `{BASE_URL}/api/askeva/webhook/{companyId}`
- **Retailer webhook:** `{BASE_URL}/api/retailer-webhook/receive/{companyId}`

Both support GET (verification) and POST (events). For Meta/WhatsApp verification, set `WEBHOOK_VERIFY_TOKEN` to match your provider's verify token.

## API

- `POST /api/auth/login` — body: `{ "email", "password" }` → `{ success, user, token }`
- `POST /api/auth/logout` — optional; frontend clears token
- `GET /api/health` — health check
