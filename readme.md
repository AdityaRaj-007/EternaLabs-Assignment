# 🚀 Order Execution Engine

A high-performance backend system for executing **Solana DEX Market Orders** with intelligent routing, concurrent background workers, real-time WebSocket updates, and an extensible job-based architecture.

This project demonstrates concurrency, queues, workers,WebSockets, and Mock DEX price routing.

# 🧠 Key Design Decisions

## **1. Market-Order-First Architecture**

Market orders were implemented first because they:

- Require **instant execution**
- Stress-test **latency**, **routing**, and **concurrency**
- Exercise the full pipeline:

  ```
  API → Queue → Worker → Router → DB → Pub/Sub → WebSocket
  ```

- Showcase real-time updating via **Fastify WebSocket + Redis Pub/Sub**

This forms a strong foundation for future order types.

---

## **2. Queue-Driven, Extensible Order System**

Built on **BullMQ**, enabling new order types without refactoring core logic.

### Future extensibility:

#### ✔ Limit Orders

A **Price Watcher** service can enqueue jobs once the target price is hit.

#### ✔ Sniper Orders

A **Mempool Listener** can enqueue jobs during liquidity spikes.

The core pipeline remains the same:

```
Routing → Execution → Database Updates → WebSocket Events
```

---

# 🏗 Architecture Overview

```mermaid
graph LR
    Client[Client] -- POST /execute --> API[Fastify API]
    Client -- WebSocket --> WS[WS Gateway]

    API -- Queue job --> Queue[BullMQ]

    Queue -- Process --> Worker[Background Worker]
    Worker -- Fetch Quotes --> Router[DEX Mock Router]
    Worker -- Execute Swap --> SolanaMock[Solana Mock Execution]

    Worker -- Update --> DB
    Worker -- Publish --> RedisPub[Redis Pub/Sub]
    RedisPub -- Push --> WS
    WS -- Notify --> Client
```

---

# 📁 Folder Structure

```
drizzle/                         # Database migrations
src/
├── db/                          # Drizzle ORM schemas
├── services/                    # Queue, Redis, worker setup
├── test/                        # Automated tests + load tests
├── utils/                       # Core system utilities
|   └── redisConnection.ts
│── dex-mock-router.ts          # Simulates Raydium/Meteora best routing
│── server.ts                   # Fastify HTTP + WebSocket server
│── types.ts                    # DTOs, enums, validations
│── worker.ts                   # BullMQ order execution worker
├── .env                         # Environment variables
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── readme.md
```

---

# 🛠 Tech Stack

| Component     | Tech                     |
| ------------- | ------------------------ |
| Runtime       | Node.js + TypeScript     |
| API Framework | Fastify                  |
| Queue System  | BullMQ                   |
| Messaging     | Redis Pub/Sub            |
| Database      | PostgreSQL + Drizzle ORM |

---

# ⚙ Environment Setup

Create a `.env` file:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eterna_orders"
REDIS_HOST="localhost"
REDIS_PORT=6379
HOST="localhost"
ENDPOINT=/api/orders/execute
```

---

# 🧪 Useful Scripts

```bash
npm run dev            # Start API (watch mode)
npm run worker         # Start BullMQ worker
npm run db:push        # Apply Drizzle migrations
npm run build          # Compile TS → JS
npm start              # Start prod server
```

---

# 🚀 Running the Project

### 1️⃣ Install dependencies

```bash
npm install
```

### 2️⃣ Start Redis + Postgres

```bash
docker-compose up -d
```

### 3️⃣ Apply DB schema

```bash
npm run db:push
```

### 4️⃣ Start API + Worker

```bash
npm run dev        # API
npm run worker     # Worker
```

### 5️⃣ Test order execution

Single order:

```bash
npx ts-node src/test/client-test.ts
```

Concurrent load test:

```bash
npx ts-node src/test/concurrent-load-test.ts
```

---

# 📡 API Reference

## **POST /api/orders/execute**

Submit a market order.

### Example Request

```json
{
  "inputToken": "SOL",
  "outputToken": "USDC",
  "amount": 10
}
```

### Example Response

```json
{
  "orderId": "uuid",
  "message": "Order placed successfully!"
}
```

---

# 🔌 WebSocket Live Updates

Connect to the same endpoint:

```
GET /api/orders/execute?orderId=<id>
```

### Event Stream:

```json
{ "event": "pending" }
{ "status": "routing" }
{ "status": "building" }
{ "status": "confirmed" }
{ "status": "failed" }
```

---

# ⚡ Features

### ✔ High Concurrency

Worker runs with **10 concurrent jobs**.

### ✔ Automatic Retries

3 retries with exponential backoff.

### ✔ Intelligent DEX Router

Simulates:

- Raydium
- Meteora
- Best-price selection

---

# 🔮 Future Improvements

- Real Solana DEX integration (Raydium/Meteora)
- Limit order engine
- Sniper orders via mempool monitoring

---
