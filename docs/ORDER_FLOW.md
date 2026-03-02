# Order Flow: Webhook → Order Management → Display

This document describes the end-to-end order flow from receiving webhook events until orders appear in the Order Management UI.

## Overview

**One user interaction = One order.** The flow handles:
- Catalog order (WhatsApp cart)
- Flow form submission (address, contact)
- Payment notification

These webhook events are correlated to a **single order** per checkout session.

---

## 1. Webhook Reception

**Endpoint:** `POST /api/retailer-webhook/receive/:companyId`

**Source:** Askeva panel / WhatsApp Business API

### Incoming Message Types

| Type       | Description                    | Action                    |
|-----------|--------------------------------|---------------------------|
| `order`   | Catalog order (product items)  | Create or update order    |
| `interactive` (nfm_reply) | Flow form submission | Update or create order   |
| `payment` | WhatsApp Pay notification      | Update existing order only|

### Flow Logic

1. **Catalog order (`order`)** – Canonical “user placed order”
   - If no recent order from same user → **create** new order
   - If flow created order first (empty items) → **update** that order with catalog items

2. **Flow form (`interactive`)** – Contact/address
   - If recent pending order exists → **update** with contact/address
   - Otherwise → **create** new order (flow-first flow)

3. **Payment (`payment`)** – Never creates
   - Finds most recent pending order from same user (last 30 min)
   - **Updates** with payment status, transaction ID

### Idempotency

- Same `webhookMessageId` never creates a duplicate order
- Duplicate webhook deliveries are ignored

---

## 2. Order Creation (Backend)

**Model:** `OrderManagement` (collection: `ordersmanagement`)

**Order ID format:** `ORD-{YEAR}-{SEQ}` (e.g. `ORD-2026-001`)

### Created Fields

- `orderId`, `companyId`, `webhookMessageId`
- `type`: `retailer` | `enduser` (from retailer match)
- `from`, `fromName` (WhatsApp sender)
- `items` (product SKU × quantity)
- `contactName`, `contactNumber`, `deliveryAddress`
- `paymentStatus`, `paymentMode`, `transactionId`
- Status fields: `billingStatus`, `warehouseStatus`, `dispatchStatus`, `deliveryStatus`, `finalStatus`

### Backfill

**Endpoint:** `POST /api/orders/backfill` (admin only)

- Reads `WebhookMessage` records with `messageType: 'order'`
- Creates `OrderManagement` records for messages not yet linked
- Skips messages that already have an order

---

## 3. API Layer

**Endpoints:**

- `GET /api/orders` – List orders (filtered by tab, search, dates)
- `GET /api/orders/:orderId` – Single order
- `PATCH /api/orders/:orderId` – Update order (role-based fields)
- `POST /api/orders` – Manual create (admin)
- `POST /api/orders/backfill` – Sync from webhook messages (admin)

---

## 4. Frontend Display

### Pages

| Route                 | Component    | Role                |
|-----------------------|-------------|---------------------|
| `/admin/orders`       | AdminOrders | admin, superadmin   |
| `/billing/orders`     | BillingOrders | billing           |
| `/warehouse/orders`   | WarehouseOrders | warehouse       |

### API Usage

- `useGetOrdersQuery(queryParams)` – Fetches orders with caching
- `useUpdateOrderMutation()` – Updates order status
- `useBackfillOrdersMutation()` – Runs backfill (admin only)

### Tabs (Admin)

- **All Orders** – All orders
- **Paid Orders** – `paymentStatus = Success`
- **Payment Pending** – `paymentStatus = Pending`
- **Completed Orders** – `finalStatus = Closed`

### Caching

- `keepUnusedDataFor: 60` – Cache for 60 seconds
- `refetchOnMountOrArgChange: 60` – Avoid unnecessary refetches
- Backfill runs once per mount when orders list is empty

---

## 5. Sequence Diagram

```
User (WhatsApp)          Askeva Webhook       Backend                DB
      |                        |                   |                   |
      |--[1. Catalog order]--->|                   |                   |
      |                        |--POST /receive--->|                   |
      |                        |                   |--create order---->|
      |                        |                   |                   |
      |--[2. Flow form]------->|                   |                   |
      |                        |--POST /receive--->|                   |
      |                        |                   |--update order---->|
      |                        |                   |                   |
      |--[3. Payment]--------->|                   |                   |
      |                        |--POST /receive--->|                   |
      |                        |                   |--update order---->|
      |                        |                   |                   |
      |                        |                   |<-- one order -----|
```

---

## 6. Troubleshooting

### Multiple orders for one user flow

- **Cause:** Different `msgType` handlers each creating orders
- **Fix:** Use `handleWebhookOrderEvent` to correlate by `from` + time window

### API calls running many times

- **Cause:** Backfill loop, unstable query params, cache invalidation
- **Fix:** `hasAttemptedBackfill` ref, `useMemo` for `queryParams`, `refetchOnMountOrArgChange: 60`

### Order not appearing

- Webhook: Check logs for `[RetailerWebhook]`
- Backfill: Run manually when needed
- Frontend: Check cache and `Orders` tag invalidation

### Webhook data not appearing in Webhook Inbox

1. **Verification** – Meta/WhatsApp sends a GET for verification. Both webhooks support it:
   - `GET /api/askeva/webhook/:companyId`
   - `GET /api/retailer-webhook/receive/:companyId`
   - Set `WEBHOOK_VERIFY_TOKEN` in env if your provider uses a custom verify token (default: `askeva_webhook_verify`).

2. **Configure correct URL** – Askeva config uses `/api/askeva/webhook/:companyId`. If you use the retailer webhook instead, configure `/api/retailer-webhook/receive/:companyId`.

3. **Company ID** – Webhook Inbox filters by `companyId`. It uses the config’s `companyId` when fetching. If empty, superadmin sees messages from the first Askeva config’s company. Pass `companyId=all` in the query to see all companies (superadmin only).

4. **Logs** – Check `[Webhook]` and `[RetailerWebhook]` logs for incoming payloads and any errors.
