import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.resolve();

// Load .env from project root
config({ path: path.resolve(__dirname, ".env") });

interface IRedis {
  host: string;
  password: string;
  port: number;
  family?: number; // Make optional
  tls?: {
    rejectUnauthorized: boolean;
  };
  maxRetriesPerRequest: null;
  retryStrategy?: (times: number) => number | null;
  enableReadyCheck?: boolean;
  connectTimeout?: number;
}

// Validate
if (!process.env.REDIS_HOST || !process.env.REDIS_PASSWORD) {
  throw new Error("❌ Missing REDIS_HOST or REDIS_PASSWORD in .env file");
}

// Check if it's Redis Cloud or Upstash
const isRedisCloud = process.env.REDIS_HOST.includes('redislabs.com');
const isUpstash = process.env.REDIS_HOST.includes('upstash.io');

export const redisConnection: IRedis = {
  host: process.env.REDIS_HOST,
  password: process.env.REDIS_PASSWORD,
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000,
  
  // Only add TLS for Upstash
  ...(isUpstash && {
    tls: {
      rejectUnauthorized: false,
    },
  }),
  
  // Use IPv4 for Redis Cloud, auto-detect for others
  ...(isRedisCloud && { family: 4 }),
  
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('❌ Redis connection failed after 10 attempts');
      return null;
    }
    const delay = Math.min(times * 200, 3000);
    console.log(`🔄 Retrying Redis connection (attempt ${times})...`);
    return delay;
  },
};

console.log("✅ Redis config created for:", redisConnection.host);
console.log("📡 Connection mode:", isRedisCloud ? 'Redis Cloud (IPv4)' : isUpstash ? 'Upstash (TLS)' : 'Standard');