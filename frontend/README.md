# Incubus Admin Dashboard

A comprehensive admin dashboard system for managing retailer onboarding, order processing, and internal team workflows.

## Features

- **Role-Based Access Control**: 5 different user roles with specific permissions
- **Real-Time Order Tracking**: Complete order lifecycle from payment to delivery
- **Retailer Management**: Onboarding, approval, and lifecycle management
- **Agent Management**: Create and manage internal team members
- **WhatsApp Integration**: Template management for automated notifications
- **Light/Dark Theme**: Toggle between light and dark themes
- **Fully Responsive**: Works on all screen sizes

## Tech Stack

- React 18
- Ant Design 5
- React Router DOM 6
- Vite
- JavaScript

## Installation

```bash
cd frontend
npm install
```

## Development

```bash
npm run dev
```

The application will start on `http://localhost:7000`

## Build

```bash
npm run build
```

## User Credentials

### Admin
- Email: `admin@gmail.com`
- Password: `123456`

### Executive Agent
- Email: `executive@gmail.com`
- Password: `123456`

### Billing Agent
- Email: `billing@gmail.com`
- Password: `123456`

### Warehouse Agent
- Email: `warehouse@gmail.com`
- Password: `123456`

### Delivery Agent
- Email: `delivery@gmail.com`
- Password: `123456`

## Project Structure

```
frontend/
├── src/
│   ├── components/       # Reusable components
│   │   └── LayoutWrapper.jsx
│   ├── contexts/         # React contexts
│   │   ├── AuthContext.jsx
│   │   └── ThemeContext.jsx
│   ├── layouts/          # Role-based layouts
│   │   ├── AdminLayout.jsx
│   │   ├── ExecutiveLayout.jsx
│   │   ├── BillingLayout.jsx
│   │   ├── WarehouseLayout.jsx
│   │   └── DeliveryLayout.jsx
│   ├── pages/            # Page components
│   │   ├── Login.jsx
│   │   ├── admin/
│   │   ├── executive/
│   │   ├── billing/
│   │   ├── warehouse/
│   │   └── delivery/
│   ├── App.jsx
│   └── main.jsx
├── package.json
└── vite.config.js
```

## Color Scheme

- Primary Color: `#0274BE`
- Light Theme: Black text on white background
- Dark Theme: White text on dark background
- Active Sidebar Item: `#0274BE`

## Features by Role

### Admin
- Full dashboard with analytics
- Order management (all stages)
- Retailer approval and management
- Agent creation and management
- Settings module with:
  - User Management
  - Role Management
  - WhatsApp Integration

### Executive Agent
- Dashboard with onboarding stats
- Create wholesaler requests
- View approval status
- Edit wholesaler details

### Billing Agent
- Dashboard with billing metrics
- View paid orders
- Generate invoices
- Update billing status

### Warehouse Agent
- Dashboard with processing stats
- View invoiced orders
- Update warehouse status
- Mark orders ready for dispatch

### Delivery Agent
- Dashboard with delivery metrics
- View ready orders
- Assign courier and AWB
- Mark orders as dispatched
- Confirm delivery and close orders

## Notes

- This is a UI-only implementation. Backend integration is required for full functionality.
- All data shown is mock data for demonstration purposes.
- Theme preference is saved in localStorage.
