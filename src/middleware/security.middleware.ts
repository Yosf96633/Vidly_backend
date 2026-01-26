// src/middlewares/security.middleware.ts
import express from "express";
type Request = express.Request;
type Response = express.Response;
type NextFunction = (err?: any) => void;

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
