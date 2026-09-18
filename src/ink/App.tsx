import { Box, Text, useStdout, useInput, useApp, useStdin, Key } from 'ink'
import { useState, useCallback, useEffect, useRef, useMemo, ReactNode, memo } from 'react'
import { TextInput } from '@inkjs/ui'
import { rebuildTree, setTreeRole, setupSelectedTree } from './utils.js'
import { ChatAI } from './agent.js'
import { ChatMessage, Usage, AssistantRolesEnum } from './models.js'
import { RenderRow, TreeHolder } from './ui-models.js'
import { ConfirmDialog } from './Dialog.js'
import { describeAction } from './confirmation.js'
import { highlight } from 'cli-highlight'

// --- Constants ---
const INPUT_ROWS = 4
const SCROLL_JUMP = 5
const CONTEXT_WINDOW = 200000
const USAGE_PANEL = 50

// --- RowView ---
function RowView({ row }: { row: RenderRow }) {
  const { key: rowKey, columns, ...rowProps } = row
  return (
    <Box key={rowKey} {...rowProps}>
      {columns.map((col) => {
        const { key: colKey, value, highlight: colHighlight, ...colProps } = col
        return (
          <Box key={colKey} {...colProps}>
            <Text key={colKey} {...colProps}>
              {colHighlight ? highlight(value ?? ' ', { language: colHighlight }) : (value ?? ' ')}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

// --- ReportPanel ---
const ReportPanel = memo(function ReportPanel({ report }: { report: Usage | undefined }) {
  if (!report) return null
  const cacheTotal = report.prompt_cache_hit_tokens + report.prompt_cache_miss_tokens
  const cachePercent =
    cacheTotal > 0 ? ((report.prompt_cache_hit_tokens / cacheTotal) * 100).toFixed(1) : '0.0'
  return (
    <Box flexDirection="column">
      <Text>
        Context: {report.total_tokens} / {CONTEXT_WINDOW.toLocaleString()} (
        {((report.total_tokens / CONTEXT_WINDOW) * 100).toFixed(1)}%)
      </Text>
      <Text>Prompt: {report.prompt_tokens}</Text>
      <Text>Completion: {report.completion_tokens}</Text>
      <Text>
        Cache: {report.prompt_cache_hit_tokens} / {cacheTotal} ({cachePercent}%)
      </Text>
      <Text>Reasoning: {report.completion_tokens_details?.reasoning_tokens}</Text>
    </Box>
  )
})

// --- App ---
export default function App() {
  const { stdout } = useStdout()
  const { stdin } = useStdin()
  const { exit } = useApp()

  // Core state
  const [rows, setRows] = useState(stdout.rows)
  const [loading, setLoading] = useState(false)
  const [aiUsage, setAiUsage] = useState<Usage>()
  const [error, setError] = useState<string | undefined>()
  const [offset, setOffset] = useState(0)
  const [reactNodes, setReactNodes] = useState<ReactNode[]>([])
  const [followOutput, setFollowOutput] = useState<boolean>(true)
  const followOutputRef = useRef(followOutput)
  useEffect(() => {
    followOutputRef.current = followOutput
  }, [followOutput])
  const chatAiRef = useRef<ChatAI>(new ChatAI())
  const [pendingConfirm, setPendingConfirm] = useState<{ name: string; args: unknown } | null>(null)
  const [confirmChoice, setConfirmChoice] = useState(false)
  const confirmChoiceRef = useRef(false)
  const confirmResolverRef = useRef<((allow: boolean) => void) | undefined>(undefined)
  // Mouse capture blocks the terminal's native text selection, so F5 toggles
  // between interactive mouse (wheel scroll, click to select a row) and a
  // selection mode where the terminal handles the mouse again. Can be defaulted
  // to off via AI_AGENT_CLI_DISABLE_MOUSE=1.
  const [mouseEnabled, setMouseEnabled] = useState(
    () => process.env.AI_AGENT_CLI_DISABLE_MOUSE !== '1'
  )
  // Once the user approves a destructive action, the rest of the current task
  // (single agent() run) is trusted; reset on every new user prompt.
  const trustRef = useRef(false)

  // Refs for mutation-heavy data (avoid unnecessary state)
  const treeRef = useRef<TreeHolder>({
    uniqueId: 0,
    columns: stdout.columns - USAGE_PANEL,
    node: { type: 'box', children: [], content: '' },
    items: [],
    rows: [],
    reactNodes: [],
    visibleHeight: 0,
    rendererRowView: RowView
  })
  const contentLines = useMemo(() => Math.max(1, rows - INPUT_ROWS - 1), [rows])
  const [maxOffset, setMaxOffset] = useState(0)

  const terminalOffset = useMemo(() => {
    return followOutput ? maxOffset : offset
  }, [followOutput, maxOffset, offset])

  const visibleRows = useMemo(() => {
    return reactNodes.slice(terminalOffset, terminalOffset + contentLines) as ReactNode[]
  }, [reactNodes, terminalOffset, contentLines])

  const updateComponentRows = useCallback(() => {
    setReactNodes([...treeRef.current.reactNodes])
    const maxOffset = Math.max(0, treeRef.current.visibleHeight - contentLines)
    setMaxOffset(maxOffset)
    if (followOutputRef.current) setOffset(Math.max(0, maxOffset - contentLines))
  }, [contentLines])

  const processMessageHandler = useCallback(
    (msg: ChatMessage) => {
      try {
        setTreeRole(msg, treeRef.current, chatAiRef.current.messages)
        updateComponentRows()
        // setLoading(false)
      } catch (error) {
        setError((error as Error).message)
      }
    },
    [updateComponentRows]
  )

  const processUserMessageHandler = useCallback(
    (prompt: string) => {
      const userMsg: ChatMessage = { role: AssistantRolesEnum.user, content: prompt }
      chatAiRef.current.setUserPrompt(userMsg)
      processMessageHandler(userMsg)
    },
    [processMessageHandler]
  )
  const processUsageHandler = useCallback((usage: Usage) => {
    try {
      setAiUsage(usage)
      setLoading(false)
    } catch (error) {
      setError((error as Error).message)
    }
  }, [])
  const processErrorHandler = useCallback((error: Error) => {
    setLoading(false)
    setError(error.message)
  }, [])

  const requestConfirmation = useCallback((name: string, args: Record<string, unknown>) => {
    if (trustRef.current) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve
      confirmChoiceRef.current = false
      setConfirmChoice(false)
      setPendingConfirm({ name, args })
    })
  }, [])

  const resolveConfirm = useCallback((allow: boolean) => {
    if (allow) trustRef.current = true
    confirmResolverRef.current?.(allow)
    confirmResolverRef.current = undefined
    setPendingConfirm(null)
  }, [])

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || loading || pendingConfirm) return
      trustRef.current = false
      setError(undefined)
      processUserMessageHandler(prompt)
      setLoading(true)
      try {
        chatAiRef.current.agent(
          process.env.MODEL || undefined,
          processErrorHandler,
          processMessageHandler,
          processUsageHandler,
          requestConfirmation
        )
      } catch (error) {
        processErrorHandler(error as Error)
      }
    },
    [
      loading,
      processUserMessageHandler,
      processUsageHandler,
      processErrorHandler,
      processMessageHandler,
      requestConfirmation,
      pendingConfirm
    ]
  )

  const removeStdOut = useCallback(() => {
    stdout.write('\x1b[?1002l')
    stdout.write('\x1b[?1006l')
  }, [stdout])

  const setupSelected = useCallback(
    (y: number) => {
      setupSelectedTree(treeRef.current, terminalOffset, y)
      //setShowDialog(true)
      updateComponentRows()
    },
    [updateComponentRows, terminalOffset]
  )

  // Ink's Key type is extended at runtime via the mouse patch (see patch_ink.ts)
  type InputKey = Key & { mouse?: { button: number; x: number; y: number; pressed: boolean } }

  const onInput = useCallback(
    (input: string, key: InputKey) => {
      if (key.ctrl && input === 'c') {
        removeStdOut()
        exit()
      }

      if (pendingConfirm) {
        if (key.leftArrow) {
          confirmChoiceRef.current = false
          setConfirmChoice(false)
        } else if (key.rightArrow) {
          confirmChoiceRef.current = true
          setConfirmChoice(true)
        } else if (key.tab || key.upArrow || key.downArrow) {
          const next = !confirmChoiceRef.current
          confirmChoiceRef.current = next
          setConfirmChoice(next)
        } else if (key.escape) {
          resolveConfirm(false)
        } else if (key.return) {
          resolveConfirm(confirmChoiceRef.current)
        }
        return
      }

      if (key.pageUp || key.upArrow || (key.mouse && key.mouse.button === 64)) {
        setFollowOutput(false)
        setOffset((prev) => Math.max(0, prev - (key.pageUp ? contentLines : SCROLL_JUMP)))
      }
      if (key.pageDown || key.downArrow || (key.mouse && key.mouse.button === 65)) {
        setOffset((prev) => {
          const next = Math.min(maxOffset, prev + (key.pageDown ? contentLines : SCROLL_JUMP))
          if (next === maxOffset) setFollowOutput(true)
          return next
        })
      }
      if (key.home) {
        setFollowOutput(false)
        setOffset(0)
      }
      if (key.end) {
        setFollowOutput(true)
        setOffset(maxOffset)
      }
      if (key.mouse && key.mouse.button === 0 && key.mouse.pressed) {
        setupSelected(key.mouse.y)
      }
    },
    [maxOffset, contentLines, exit, removeStdOut, setupSelected, pendingConfirm, resolveConfirm]
  )
  useInput(onInput)

  // Ink's Key type exposes no F-key flags (F5 parses as { name: 'f5' } with
  // every boolean false), so watch the raw stdin stream for the F5 sequence to
  // toggle selection mode. The event listener is additive — Ink's own parser
  // still sees the bytes and treats F5 as a no-op.
  useEffect(() => {
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString()
      if (text.includes('\x1b[15~')) setMouseEnabled((enabled) => !enabled)
    }
    stdin.on('data', onData)
    return () => {
      stdin.off('data', onData)
    }
  }, [stdin])

  const setupDimensions = useCallback(
    (rows: number, columns: number) => {
      setRows(rows)
      treeRef.current.columns = columns - USAGE_PANEL
      rebuildTree(treeRef.current)
      updateComponentRows()
    },
    [updateComponentRows]
  )
  useEffect(() => {
    const onResize = () => setupDimensions(stdout.rows, stdout.columns)
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout, setupDimensions])

  useEffect(() => {
    if (mouseEnabled) {
      stdout.write('\x1b[?1002h') // button + drag (wheel scroll, click to select row)
      stdout.write('\x1b[?1006h') // SGR mouse protocol
    } else {
      stdout.write('\x1b[?1002l')
      stdout.write('\x1b[?1006l')
    }
    return () => {
      removeStdOut()
    }
  }, [stdin, stdout, mouseEnabled, removeStdOut])

  return (
    <Box flexDirection="row">
      <Box flexDirection="column" width="100%" justifyContent="space-between" borderColor="red">
        <Box
          flexDirection="column"
          height={contentLines}
          minHeight={contentLines}
          overflow="hidden"
        >
          {visibleRows}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="classic"
          borderLeft
          borderTop={false}
          borderBottom={false}
          borderLeftColor="blueBright"
          backgroundColor="#111111"
          height={INPUT_ROWS}
          minHeight={INPUT_ROWS}
          maxHeight={INPUT_ROWS}
          padding={1}
        >
          <TextInput placeholder="Type here..." onSubmit={handleSubmit} />
        </Box>
      </Box>

      <Box
        flexDirection="column"
        width={USAGE_PANEL}
        minWidth={USAGE_PANEL}
        borderColor="cyan"
        backgroundColor="#111111"
        padding={1}
        justifyContent="space-between"
      >
        <Box flexDirection="column">
          <ReportPanel report={aiUsage} />
          {loading && <Text color="yellow">Loading...</Text>}
          {error && <Text color="red">{error}</Text>}
        </Box>
        <Box flexDirection="column">
          <Text>{'Bottom panel'}</Text>
          <Text color={mouseEnabled ? undefined : 'green'}>
            {mouseEnabled ? 'Mouse on · F5 off' : 'Selection mode (mouse off) · F5 on'}
          </Text>
        </Box>
      </Box>

      {pendingConfirm && (
        <Box
          position="absolute"
          top={Math.max(1, Math.floor(contentLines / 2) - 4)}
          left={2}
          alignItems="center"
        >
          <ConfirmDialog
            title={`Allow ${pendingConfirm.name}?`}
            description={describeAction(pendingConfirm.name, pendingConfirm.args)}
            choice={confirmChoice}
          />
        </Box>
      )}
    </Box>
  )
}
