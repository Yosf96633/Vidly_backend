// src/middlewares/security.middleware.ts
import express from "express";
import { z, ZodError } from "zod";

type Request = express.Request;
type Response = express.Response;
type NextFunction = (err?: any) => void;

/**
 * Security Headers Middleware
 * Sets important security headers
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS filter
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );

  // Content Security Policy (adjust based on your needs)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
  );

  next();
}

/**
 * Input Sanitization Middleware
 * Sanitizes user input to prevent XSS and injection attacks
 * Note: In Express 5, req.query and req.params are read-only, so we skip them
 */
export function sanitizeInput(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Only sanitize body which is mutable
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }

  next();
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (obj && typeof obj === "object") {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize a string to prevent XSS
 */
function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, "") // Remove < and >
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, "") // Remove event handlers
    .trim();
}

/**
 * Validation Middleware Factory
 * Validates request data against a Zod schema
 */

export function validate(schema: z.ZodSchema) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as { body?: any; query?: any; params?: any };

      req.body = validated.body || req.body;
      // Note: Can't reassign query/params in Express 5, validation still works

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Invalid request data",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      } else {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Invalid request data",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  };
}

/**
 * Prevent NoSQL Injection
 * Checks for MongoDB operators in user input
 */
export function preventNoSQLInjection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.log("🔍 Checking NoSQL injection...");
  console.log("Query:", req.query);
  console.log("Query type:", typeof req.query);
  console.log("Query keys:", Object.keys(req.query));

  const check = (obj: any, path: string = ""): boolean => {
    console.log(`🔍 Checking ${path}:`, obj, "type:", typeof obj);

    if (obj == null) {
      console.log(`✅ ${path} is null/undefined`);
      return true;
    }

    if (typeof obj === "string") {
      console.log(`🔍 String ${path}: "${obj}"`);
      // Simple check for common operators
      if (obj.includes("$where") || obj.includes("$ne")) {
        console.log(`❌ Blocked string ${path}: "${obj}"`);
        return false;
      }
      return true;
    }

    if (typeof obj !== "object") {
      console.log(`✅ ${path} is primitive:`, obj);
      return true;
    }

    if (Array.isArray(obj)) {
      console.log(`🔍 Array ${path} with ${obj.length} items`);
      return obj.every((item, index) => check(item, `${path}[${index}]`));
    }

    console.log(`🔍 Object ${path} with keys:`, Object.keys(obj));
    for (const key in obj) {
      console.log(`🔍 Checking key "${key}" in ${path}`);
      try {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          console.log(`✅ Key "${key}" exists`);
          if (!check(obj[key], path ? `${path}.${key}` : key)) {
            return false;
          }
        }
      } catch (error) {
        console.error(`❌ Error checking key "${key}":`, error);
        return false;
      }
    }

    return true;
  };

  try {
    if (!check(req.query, "query")) {
      console.log("❌ Query failed security check");
      return res.status(400).json({ error: "Invalid query" });
    }

    console.log("✅ All security checks passed");
    next();
  } catch (error) {
    console.error("❌ Security middleware error:", error);
    res.status(400).json({ error: "Security check failed" });
  }
}

/**
 * Request Size Limiter
 * Prevents large payload attacks
 */
export function requestSizeLimiter(maxSizeKB: number = 100) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    const maxSizeBytes = maxSizeKB * 1024;

    if (contentLength > maxSizeBytes) {
      res.status(413).json({
        success: false,
        error: "Payload Too Large",
        message: "Request body must be less than " + maxSizeKB + "KB",
      });
      return;
    }

    next();
  };
}

/**
 * Trusted Proxies Configuration
 * For Render deployment
 */
export function configureTrustedProxies(app: any): void {
  // Trust Render's proxy
  app.set("trust proxy", 1);
}

/**
 * Error Handler Middleware
 * Catches and formats errors securely
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.error("Error:", err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === "development";

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    error: isDevelopment ? err.name : "Server Error",
    message: isDevelopment ? message : "An error occurred",
    ...(isDevelopment && { stack: err.stack }),
  });
}

/**
 * Not Found Handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: "Route " + req.method + " " + req.path + " not found",
  });
}
