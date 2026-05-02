import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { ADK_APP_NAME, ADK_USER_ID, adkClient } from './adkClient'
import { handleAdkError, handleAdkResponseError } from './adk-errors'
import type { AdkEvent } from './adk'
import type { components } from './adk-types'

type RunRequest = components['schemas']['RunAgentRequest']

const SESSION_TITLE_KEY = 'title'

export interface SessionListItem {
  id: string
  name: string
  lastUpdateTime: number
}

export const listSessions = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { data, error } = await adkClient.GET(
      '/apps/{app_name}/users/{user_id}/sessions',
      {
        params: {
          path: { app_name: ADK_APP_NAME, user_id: ADK_USER_ID },
        },
      },
    )
    if (error) handleAdkError(error)
    return (data ?? []).map((session): SessionListItem => {
      const stateTitle = session.state?.[SESSION_TITLE_KEY]
      const name =
        typeof stateTitle === 'string' && stateTitle
          ? stateTitle
          : (session.events
              ?.find(
                (e) => e.content?.role === 'user' && e.content.parts?.[0]?.text,
              )
              ?.content?.parts?.[0]?.text?.slice(0, 40) ?? session.id)
      return { id: session.id, name, lastUpdateTime: session.lastUpdateTime }
    })
  },
)

export const getSession = createServerFn({ method: 'GET' })
  .inputValidator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const { data, error } = await adkClient.GET(
      '/apps/{app_name}/users/{user_id}/sessions/{session_id}',
      {
        params: {
          path: {
            app_name: ADK_APP_NAME,
            user_id: ADK_USER_ID,
            session_id: sessionId,
          },
        },
      },
    )
    if (error) handleAdkError(error)
    return data
  })

interface CreateSessionInput {
  sessionId: string
  name?: string
}

export const createSession = createServerFn({ method: 'POST' })
  .inputValidator((input: CreateSessionInput) => input)
  .handler(async ({ data: { sessionId, name } }) => {
    const { response } = await adkClient.POST(
      '/apps/{app_name}/users/{user_id}/sessions/{session_id}',
      {
        params: {
          path: {
            app_name: ADK_APP_NAME,
            user_id: ADK_USER_ID,
            session_id: sessionId,
          },
        },
        // In the updated ADK schema, the body for /sessions/{session_id} POST
        // is expected to be the initial state (Record<string, any>).
        body: name ? { [SESSION_TITLE_KEY]: name } : {},
      },
    )

    // 409 Conflict => already exists, which is fine for our use case.
    if (!response.ok && response.status !== 409) {
      handleAdkResponseError(response)
    }

    return { ok: true }
  })

interface UpdateSessionInput {
  sessionId: string
  name: string
}

export const updateSession = createServerFn({ method: 'POST' })
  .inputValidator((input: UpdateSessionInput) => input)
  .handler(async ({ data: { sessionId, name } }) => {
    const { data, error } = await adkClient.PATCH(
      '/apps/{app_name}/users/{user_id}/sessions/{session_id}',
      {
        params: {
          path: {
            app_name: ADK_APP_NAME,
            user_id: ADK_USER_ID,
            session_id: sessionId,
          },
        },
        body: {
          stateDelta: { [SESSION_TITLE_KEY]: name },
        },
      },
    )
    if (error) handleAdkError(error)
    return data
  })

export type ChatInput = Omit<RunRequest, 'appName' | 'userId' | 'streaming'>

export const runChat = createServerFn({ method: 'POST' })
  .inputValidator((data: ChatInput) => data)
  .handler(async function* ({ data: input }) {
    const body: RunRequest = {
      ...input,
      appName: ADK_APP_NAME,
      userId: ADK_USER_ID,
      streaming: true,
    }

    const { response } = await adkClient.POST('/run_sse', {
      parseAs: 'stream',
      body,
      signal: getRequest().signal,
    })

    if (!response.ok) {
      handleAdkResponseError(response)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body from ADK')

    const decoder = new TextDecoder()
    let buffer = ''

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const lines = part.split('\n')
        let data = ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            data += line.slice(6)
          }
        }
        if (data) {
          try {
            yield JSON.parse(data) as AdkEvent
          } catch {
            // Skip unparseable events
          }
        }
      }
    }
  })
