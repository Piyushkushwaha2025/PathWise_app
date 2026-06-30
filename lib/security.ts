/**
 * Security utilities
 */

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // Convert to milliseconds
    return Date.now() >= exp;
  } catch {
    return true;
  }
}

/**
 * Securely generate random ID
 */
export function generateSecureId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Rate limiter for preventing brute force
 */
class RateLimiter {
  private attempts: Map<string, { count: number; resetAt: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record || now > record.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxAttempts - 1, resetAt: now + this.windowMs };
    }

    if (record.count >= this.maxAttempts) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count += 1;
    return { allowed: true, remaining: this.maxAttempts - record.count, resetAt: record.resetAt };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const authRateLimiter = new RateLimiter(5, 15 * 60 * 1000);
