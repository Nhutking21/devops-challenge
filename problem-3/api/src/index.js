const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");

const app = express();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: "postgres",
  password: "postgres",
  database: "postgres",
  port: 5432,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
});

app.get("/api/users", async (req, res) => {
  let db;

  try {
    db = await pool.connect();

    const result = await db.query("SELECT NOW()");

    await redis.set("last_call", Date.now());

    res.json({
      ok: true,
      time: result.rows[0],
    });
  } catch (err) {
    console.error("Request failed:", err);

    res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  } finally {
    if (db) {
      db.release();
    }
  }
});

app.get("/status", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    await redis.ping();

    res.json({
      status: "ok",
      dependencies: {
        postgres: "ok",
        redis: "ok",
      },
    });
  } catch (err) {
    console.error("Health check failed:", err);

    res.status(503).json({
      status: "unhealthy",
    });
  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`API running on ${PORT}`);
});