# Incubus Backend

- **Port:** 7000 (set via `PORT` in `.env`)
- **DB:** MongoDB — set `MONGODB_URI` in `.env`

## Setup

1. Copy `.env.example` to `.env` and set:
   - `PORT=7000`
   - `MONGODB_URI=mongodb+srv://...`
   - `JWT_SECRET` (any string for production)
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

## API

- `POST /api/auth/login` — body: `{ "email", "password" }` → `{ success, user, token }`
- `POST /api/auth/logout` — optional; frontend clears token
- `GET /api/health` — health check
