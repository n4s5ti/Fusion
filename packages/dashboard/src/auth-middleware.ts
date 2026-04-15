/**
 * Bearer token authentication middleware for daemon mode.
 *
 * Provides secure constant-time token validation to protect API endpoints
 * while allowing unauthenticated access to health checks.
 */

import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/** Paths that are exempt from authentication (liveness probes). */
const EXEMPT_PATHS = ["/api/health"];

/**
 * Check if daemon auth should be active.
 * Auth is enabled when FUSION_DAEMON_TOKEN env var is set OR daemon options are provided.
 */
export function isDaemonAuthActive(options?: { daemon?: { token: string } }): boolean {
  // Check explicit daemon option
  if (options?.daemon?.token) {
    return true;
  }
  // Check environment variable
  if (process.env.FUSION_DAEMON_TOKEN) {
    return true;
  }
  return false;
}

/**
 * Get the daemon token from options or environment.
 */
function getDaemonToken(options?: { daemon?: { token: string } }): string | undefined {
  if (options?.daemon?.token) {
    return options.daemon.token;
  }
  return process.env.FUSION_DAEMON_TOKEN;
}

/**
 * Check if a request path is exempt from authentication.
 */
function isExemptPath(path: string): boolean {
  return EXEMPT_PATHS.some((exempt) => path === exempt || path.startsWith(exempt + "/"));
}

/**
 * Create Express middleware that enforces bearer token authentication.
 *
 * Uses constant-time comparison to prevent timing attacks.
 * Exempts /api/health and paths starting with /api/health/ from auth.
 *
 * @param token - The valid bearer token
 * @returns Express middleware function
 */
export function createAuthMiddleware(token: string) {
  const expectedBuffer = Buffer.from(token, "utf8");

  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Always allow exempt paths
    if (isExemptPath(req.path)) {
      next();
      return;
    }

    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Valid bearer token required",
      });
      return;
    }

    // Parse Bearer scheme
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Valid bearer token required",
      });
      return;
    }

    const providedToken = authHeader.slice(7); // Remove "Bearer " prefix

    // Fast path: check length first to avoid unnecessary crypto calls
    if (providedToken.length !== expectedBuffer.length) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Valid bearer token required",
      });
      return;
    }

    // Constant-time comparison to prevent timing attacks
    try {
      const providedBuffer = Buffer.from(providedToken, "utf8");

      // Ensure buffers are the same length (they should be due to length check above)
      if (providedBuffer.length !== expectedBuffer.length) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Valid bearer token required",
        });
        return;
      }

      if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Valid bearer token required",
        });
        return;
      }
    } catch {
      // Buffer encoding issues or other crypto errors
      res.status(401).json({
        error: "Unauthorized",
        message: "Valid bearer token required",
      });
      return;
    }

    // Token is valid
    next();
  };
}
