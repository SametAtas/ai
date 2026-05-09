import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { resolveAdkUserIdOrThrow } from './adkUser'

const SCORE_NAME = 'user-thumbs'

export interface FeedbackScore {
  value: 1 | -1 | null
  comment: string | null
}

export class LangfuseFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(`Langfuse scores fetch failed: ${status} ${statusText}`)
    this.name = 'LangfuseFetchError'
  }
}

interface LangfuseScore {
  id: string
  name: string
  value?: number
  comment?: string | null
  metadata?: unknown
  createdAt?: string
  updatedAt?: string
}

interface LangfuseScoresResponse {
  data?: Array<LangfuseScore>
}

export function normalizeValue(raw: number | undefined): 1 | -1 | null {
  if (raw === 1) return 1
  if (raw === -1) return -1
  return null
}

export function pickLatest(
  scores: Array<LangfuseScore>,
): LangfuseScore | null {
  return scores.reduce<LangfuseScore | null>((acc, score) => {
    if (!acc) return score
    const accTime = acc.updatedAt ?? acc.createdAt ?? ''
    const curTime = score.updatedAt ?? score.createdAt ?? ''
    return curTime > accTime ? score : acc
  }, null)
}

export async function fetchFeedbackForTrace(
  traceId: string,
  userId: string,
): Promise<FeedbackScore> {
  const baseUrl = process.env.LANGFUSE_BASE_URL
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!baseUrl || !publicKey || !secretKey) {
    return { value: null, comment: null }
  }

  const url = new URL('/api/public/v2/scores', baseUrl)
  url.searchParams.set('traceId', traceId)
  url.searchParams.set('name', SCORE_NAME)
  // userId filters server-side by trace.userId; requires 'trace' in fields
  // per Langfuse v2 API contract.
  url.searchParams.set('userId', userId)
  url.searchParams.set('fields', 'scores,trace')
  url.searchParams.set('limit', '50')

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64')
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!response.ok) {
    throw new LangfuseFetchError(response.status, response.statusText)
  }
  const body = (await response.json()) as LangfuseScoresResponse

  const latest = pickLatest(body.data ?? [])
  if (!latest) return { value: null, comment: null }
  return {
    value: normalizeValue(latest.value),
    comment: latest.comment ?? null,
  }
}

export const getFeedbackForTrace = createServerFn({ method: 'GET' })
  .inputValidator((traceId: string) => traceId)
  .handler(async ({ data: traceId }): Promise<FeedbackScore> => {
    const userId = await resolveAdkUserIdOrThrow()
    try {
      return await fetchFeedbackForTrace(traceId, userId)
    } catch (err) {
      if (err instanceof LangfuseFetchError) {
        setResponseStatus(502)
      }
      throw err
    }
  })
