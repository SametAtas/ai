import { createFileRoute, useParams } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChatArea } from '@/components/ChatArea'
import { RightDrawer } from '@/components/RightDrawer'
import type { FocusedTool } from '@/components/RightDrawer'
import { useChat } from '@/hooks/useChat'
import { markSessionOpened } from '@/lib/chatSessions.functions'
import type { FunctionCall } from '@/lib/adk'

export const Route = createFileRoute('/_app/session/$sessionId')({
  component: SessionPage,
})

function SessionPage() {
  const { sessionId } = useParams({ from: '/_app/session/$sessionId' })
  const queryClient = useQueryClient()
  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopGeneration,
    toolResponses,
  } = useChat({ sessionId })

  // Store the immutable call object; response is looked up from toolResponses at render time
  const [focusedCall, setFocusedCall] = useState<
    (FunctionCall & { id: string }) | null
  >(null)
  const openedCallIds = useRef<Set<string>>(new Set())

  const handleToolBadgeClick = useCallback(
    (id: string) => {
      if (focusedCall?.id === id) {
        setFocusedCall(null)
        return
      }
      for (const msg of messages) {
        for (const part of msg.parts ?? []) {
          if (part.functionCall?.id === id) {
            openedCallIds.current.add(id)
            setFocusedCall(part.functionCall as FunctionCall & { id: string })
            return
          }
        }
      }
    },
    [focusedCall, messages],
  )

  // Auto-open the drawer when draft_factcheck_response is the last tool call,
  // unless the drawer is already open or this call was previously shown.
  useEffect(() => {
    if (focusedCall !== null) return

    let lastCall: (FunctionCall & { id: string }) | undefined
    outer: for (let i = messages.length - 1; i >= 0; i--) {
      const parts = messages[i].parts ?? []
      for (let j = parts.length - 1; j >= 0; j--) {
        if (parts[j].functionCall?.id) {
          lastCall = parts[j].functionCall as FunctionCall & { id: string }
          break outer
        }
      }
    }

    if (!lastCall || lastCall.name !== 'draft_factcheck_response') return
    if (openedCallIds.current.has(lastCall.id)) return

    openedCallIds.current.add(lastCall.id)
    setFocusedCall(lastCall)
  }, [messages, focusedCall])

  const focused: (FocusedTool & { id: string }) | null = focusedCall
    ? ({
        id: focusedCall.id,
        name: focusedCall.name ?? '',
        args: (focusedCall.args ?? {}) as FocusedTool['args'],
        response: (toolResponses[focusedCall.id]?.response ??
          null) as FocusedTool['response'],
      } as FocusedTool & { id: string })
    : null

  useEffect(() => {
    if (isStreaming) {
      // Don't trigger ADK state update when streaming;
      // otherwise when the stream ends, the session will be stale.
      return
    }
    markSessionOpened({ data: sessionId }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    })
  }, [sessionId, queryClient, isStreaming])

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden">
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>連線錯誤: {error}</span>
            <button
              onClick={() => window.location.reload()}
              className="ml-auto text-xs text-red-600 hover:text-red-800 underline"
            >
              重新整理
            </button>
          </div>
        )}
        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          onSendMessage={sendMessage}
          onStop={stopGeneration}
          sessionId={sessionId}
          focusedToolCallId={focused?.id ?? null}
          onToolBadgeClick={handleToolBadgeClick}
        />
      </div>
      <RightDrawer
        isOpen={!!focused}
        onClose={() => setFocusedCall(null)}
        tool={focused}
      />
    </div>
  )
}
