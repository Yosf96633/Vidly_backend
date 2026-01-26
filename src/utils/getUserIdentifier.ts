// utils/getUserIdentifier.ts
import type { Request } from "express";
import crypto from "crypto";

/**
 * Get a unique identifier for the user based on:
 * 1. User ID (if authenticated)
 * 2. IP Address + User Agent (for anonymous users)
 */
export const getUserIdentifier = (req: Request): string => {
  // If user is authenticated, use their user ID
  // Uncomment this when you have authentication
  // if (req.user?.id) {
  //   return `user:${req.user.id}`;
  // }

  // For anonymous users, combine IP and User Agent for uniqueness
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"] || "unknown";
  
  // Create a hash of IP + User Agent for privacy
  const identifier = crypto
    .createHash("sha256")
    .update(`${ip}:${userAgent}`)
    .digest("hex")
    .substring(0, 32);

  return `anon:${identifier}`;
};

/**
 * Get the real client IP address, accounting for proxies
 */
export const getClientIp = (req: Request): string => {
  // Check for common proxy headers
  const forwarded = req.headers["x-forwarded-for"];
  
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, get the first one
    const ips = (forwarded as string).split(",");
    const firstIp = ips[0]?.trim(); // Fix for TypeScript error
    if (firstIp) {
      return firstIp;
    }
  }

  // Check other common headers
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return realIp as string;
  }

  // Fallback to req.ip or socket address
  return req.ip || req.socket.remoteAddress || "unknown";
};

/**
 * Get just the IP for display purposes
 */
export const getDisplayIp = (req: Request): string => {
  return getClientIp(req);
};