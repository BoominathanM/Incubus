# Quick Start Guide

## Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:7000`

## Login Credentials

### Admin (Full Access)
- Email: `admin@gmail.com`
- Password: `123456`
- Access: All modules including Dashboard, Orders, Retailer Board, Agent Management, Settings (User Management, Role Management, WhatsApp Integration)

### Executive Agent
- Email: `executive@gmail.com`
- Password: `123456`
- Access: Dashboard, Customer Board (create wholesaler requests)

### Billing Agent
- Email: `billing@gmail.com`
- Password: `123456`
- Access: Dashboard, Order Management (billing operations only)

### Warehouse Agent
- Email: `warehouse@gmail.com`
- Password: `123456`
- Access: Dashboard, Orders (warehouse processing)

### Delivery Agent
- Email: `delivery@gmail.com`
- Password: `123456`
- Access: Dashboard, Orders (dispatch and delivery operations)

## Features

✅ Role-based authentication and routing
✅ Light/Dark theme toggle (saved in localStorage)
✅ Fully responsive design
✅ Complete UI for all 5 user roles
✅ Order lifecycle tracking
✅ Retailer onboarding and approval
✅ Agent management
✅ WhatsApp template configuration

## Theme

- Primary Color: `#0274BE`
- Toggle theme using the sun/moon icon in the header
- Theme preference is automatically saved

## Project Structure

```
frontend/
├── src/
│   ├── components/        # Reusable components
│   ├── contexts/         # React contexts (Auth, Theme)
│   ├── layouts/          # Role-based layouts
│   ├── pages/           # Page components
│   │   ├── admin/       # Admin pages
│   │   ├── executive/   # Executive agent pages
│   │   ├── billing/     # Billing agent pages
│   │   ├── warehouse/   # Warehouse agent pages
│   │   └── delivery/    # Delivery agent pages
│   ├── App.jsx          # Main app component
│   └── main.jsx         # Entry point
├── package.json
└── vite.config.js
```

## Notes

- This is a UI-only implementation
- All data is mock data for demonstration
- Backend integration required for full functionality
- All forms and actions are UI placeholders
