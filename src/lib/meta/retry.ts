/**
 * Rate limiting + retry for Meta API calls.
 * Ported from meta-tester/src/utils/api-retry.js
 */

import pRetry, { AbortError } from 'p-retry'

// Meta API error codes
const META_RATE_LIMIT_CODES = [17, 4, 80004]
const META_TEMPORARY_ERROR_CODES = [1, 2]

interface MetaAPIError extends Error {
  code?: number
  status?: number
  retryAfter?: number
}

function isRetryableError(error: MetaAPIError): boolean {
  if (error.code && META_RATE_LIMIT_CODES.includes(error.code)) return true
  if (error.code && META_TEMPORARY_ERROR_CODES.includes(error.code)) return true

  if (error.message && (
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND')
  )) return true

  if (error.status && error.status >= 500 && error.status < 600) return true

  return false
}

function calculateBackoff(attemptNumber: number, error: MetaAPIError): number {
  if (error.retryAfter) return error.retryAfter * 1000

  const baseDelay = 1000
  const maxDelay = 32000
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay)
  const jitter = delay * 0.2 * (Math.random() - 0.5)

  return Math.floor(delay + jitter)
}

interface RetryOptions {
  retries?: number
  minTimeout?: number
  maxTimeout?: number
  operation?: string
}

export async function retryMetaAPICall<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    minTimeout = 1000,
    maxTimeout = 32000,
    operation = 'Meta API call',
  } = options

  return pRetry(
    async (attemptNumber) => {
      try {
        return await fn()
      } catch (error) {
        const metaError = error as MetaAPIError
        console.log(`[Retry ${attemptNumber}/${retries + 1}] ${operation} failed:`, metaError.message)

        if (!isRetryableError(metaError)) {
          throw new AbortError(metaError.message)
        }

        const delay = calculateBackoff(attemptNumber, metaError)
        console.log(`  → Retrying after ${delay}ms...`)

        throw error
      }
    },
    {
      retries,
      minTimeout,
      maxTimeout,
      onFailedAttempt: (error) => {
        if (error.attemptNumber === retries + 1) {
          console.error(`[Failed] ${operation} failed after ${retries + 1} attempts`)
        }
      },
    }
  )
}

/**
 * Rate limiter to enforce Meta's ~200 calls/hour quota.
 */
export class RateLimiter {
  private maxCallsPerHour: number
  private calls: number[]

  constructor(maxCallsPerHour = 200) {
    this.maxCallsPerHour = maxCallsPerHour
    this.calls = []
  }

  recordCall(): void {
    const now = Date.now()
    this.calls.push(now)
    const oneHourAgo = now - 60 * 60 * 1000
    this.calls = this.calls.filter((ts) => ts > oneHourAgo)
  }

  canMakeCall(): boolean {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const recentCalls = this.calls.filter((ts) => ts > oneHourAgo)
    return recentCalls.length < this.maxCallsPerHour
  }

  getWaitTime(): number {
    if (this.canMakeCall()) return 0

    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const recentCalls = this.calls.filter((ts) => ts > oneHourAgo)
    if (recentCalls.length === 0) return 0

    const oldestCall = recentCalls[0]!
    return Math.max(oldestCall + 60 * 60 * 1000 - now, 0)
  }

  async waitForSlot(): Promise<void> {
    const waitTime = this.getWaitTime()
    if (waitTime > 0) {
      const MAX_WAIT_MS = 5 * 60 * 1000
      if (waitTime > MAX_WAIT_MS) {
        throw new Error(`Rate limit wait too long (${Math.round(waitTime / 1000)}s). Try again later.`)
      }
      console.log(`[Meta Rate Limit] Waiting ${(waitTime / 1000).toFixed(1)}s...`)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }
}

// Global rate limiter instance
const globalRateLimiter = new RateLimiter(200)

export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await globalRateLimiter.waitForSlot()
  globalRateLimiter.recordCall()
  return await fn()
}
