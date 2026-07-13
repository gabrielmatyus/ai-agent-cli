import { Box, Text, useStdout, useInput, useApp, useStdin, Key } from 'ink'
import { useState, useCallback, useEffect, useRef, useMemo, ReactNode, memo } from 'react'
import { TextInput } from '@inkjs/ui'
import { rebuildTree, setTreeRole, setupSelectedTree } from './utils.js'
import { ChatAI,  } from './ai-service.js'
import { highlight } from "cli-highlight";
import { ChatMessage, Usage, AssistantRolesEnum, ClientEvent } from './models.js'
import { RenderRow, TreeHolder,  } from './ui-models.js'
import { Dialog } from './Dialog.js'
import { executeTool } from './tools.js'

// --- Constants ---
const INPUT_ROWS = 4
const SCROLL_JUMP = 5
const CONTEXT_WINDOW = 200000
const USAGE_PANEL = 50
const USAGE_PANEL_CORRECTED = 50

// --- RowView ---
const RowView = memo(function RowView({ row }: { row: RenderRow }) {
    const { key: rowKey, columns, ...rowProps } = row;
    return (
        <Box key={rowKey} {...rowProps} >
            {columns.map((col) => {
                const { key: colKey, value, highlight: colHighlight, ...colProps } = col;
                return (
                    <Box key={colKey} {...colProps}>
                        <Text key={colKey} {...colProps } >
                            {colHighlight ? highlight(value ?? ' ', { language: colHighlight }) : value ?? ' '}
                        </Text>
                    </Box>
                );
            })}
        </Box>
    );
});

// --- ReportPanel ---
const ReportPanel = memo(function ReportPanel({ report }: { report: Usage | undefined }) {
    if (!report) return null;
    const cacheTotal = report.prompt_cache_hit_tokens + report.prompt_cache_miss_tokens;
    const cachePercent = cacheTotal > 0
        ? ((report.prompt_cache_hit_tokens / cacheTotal) * 100).toFixed(1)
        : '0.0';
    return (
        <Box flexDirection='column'>
            <Text>
                Context: {report.total_tokens} / {CONTEXT_WINDOW.toLocaleString()} (
                {((report.total_tokens / CONTEXT_WINDOW) * 100).toFixed(1)}%)
            </Text>
            <Text>Prompt: {report.prompt_tokens}</Text>
            <Text>Completion: {report.completion_tokens}</Text>
            <Text>Cache: {report.prompt_cache_hit_tokens} / {cacheTotal} ({cachePercent}%)</Text>
            <Text>Reasoning: {report.completion_tokens_details.reasoning_tokens}</Text>
        </Box>
    );
});

// --- App ---
export default function App() {
    const { stdout } = useStdout();
    const { stdin } = useStdin();
    const { exit } = useApp();

    // Core state
    const [rows, setRows] = useState(stdout.rows);
    const [loading, setLoading] = useState(false);
    const [aiUsage, setAiUsage] = useState<Usage>();
    const [error, setError] = useState<string | undefined>();
    const [offset, setOffset] = useState(0);
    const [renderRows, setRenderRows] = useState<ReactNode[]>([]);
    const [followOutput, setFollowOutput] = useState<boolean>(true)
    const chatAiRef = useRef<ChatAI>(new ChatAI())
    const [showDialog, setShowDialog] = useState(false)

    // Refs for mutation-heavy data (avoid unnecessary state)
    const treeRef = useRef<TreeHolder>({ rowsCount: 0, uniqueId: 0, columns: stdout.columns - USAGE_PANEL, node: { type: 'box', children: [], content: '' }, items: [] });
    const renderRowsRef = useRef<ReactNode[]>([]);
    const contentLines = useMemo(() => Math.max(1, rows - INPUT_ROWS - 1), [rows]);
    const maxOffset = useMemo(() => Math.max(0, renderRows.length - contentLines), [renderRows, contentLines]);
    const visibleRows = useMemo(() => {
        const effectiveOffset = followOutput ? maxOffset : offset;
        return renderRows.slice(effectiveOffset, effectiveOffset + contentLines) as ReactNode[]
    }, [renderRows, followOutput, maxOffset, offset, contentLines])

    const updateComponentRows = useCallback((fullRefresh: boolean = false) => {
        if (!fullRefresh) {
            const treeItem = treeRef.current.items[treeRef.current.items.length - 1]
            renderRowsRef.current = renderRowsRef.current.slice(0, treeItem.from)
            renderRowsRef.current.push(...treeItem.rows.map((r) => <RowView key={r.key} row={r} />) as ReactNode[]);
        } else {
            renderRowsRef.current = []
            treeRef.current.items.forEach((treeItem) => {
                renderRowsRef.current.push(...treeItem.rows.map((r) => <RowView key={r.key} row={r} />) as ReactNode[]);
            })
        }
        setRenderRows(renderRowsRef.current);
        if (followOutput) setOffset(treeRef.current.rowsCount - contentLines);
        //executeTool('write_file', {filePath: 'structure.txt', content: JSON.stringify(treeRef.current)})
    }, [contentLines, followOutput]);

    const processUserMessageHandler = useCallback((prompt: string) => {
        const userMsg: ChatMessage = { role: 'user', content: prompt }
        chatAiRef.current.setUserPrompt(userMsg)
        try {
            setTreeRole(AssistantRolesEnum.user, AssistantRolesEnum.user, treeRef.current, prompt)
        } catch (error) {
            setError((error as Error).message)
        }
        updateComponentRows()
    }, [updateComponentRows])
    const processClientEventHandler = useCallback((event: ClientEvent) => {
        try {
            setTreeRole(event.baseRole, event.role, treeRef.current, event.value, event.toolCall);
        } catch (error) {
            setError((error as Error).message)
        }
        updateComponentRows();
    }, [updateComponentRows])
    const processDoneHandler = useCallback((done: string) => {
        updateComponentRows();
        try {
            const usage = JSON.parse(done);
            setAiUsage(usage);
        } catch (error) {
            setError((error as Error).message)
        }
        setLoading(false);
    }, [updateComponentRows]);
    const processErrorHandler = useCallback((error: Error) => {
        updateComponentRows();
        setLoading(false);
        setError(error.message);
    }, [updateComponentRows]);

    const handleSubmit = useCallback(async (prompt: string) => {
        if (!prompt.trim() || loading) return;
        setError(undefined);
        processUserMessageHandler(prompt);
        setLoading(true);
        try {
            await chatAiRef.current.streamChat(
                process.env.MODEL || undefined,
                processClientEventHandler,
                processDoneHandler,
                processErrorHandler
            );
        } catch (error) {
            processErrorHandler(error as Error);
        }
        // chatAiRef.current.streamChat(
        //         process.env.MODEL || undefined,
        //         processClientEventHandler,
        //         processDoneHandler,
        //         processErrorHandler
        // ).catch((error) => {processErrorHandler(error as Error); })
    }, [loading, processUserMessageHandler, processClientEventHandler, processDoneHandler, processErrorHandler]);

    const removeStdOut = useCallback(() => {
        stdout.write('\x1b[?1002l');
        stdout.write('\x1b[?1006l');
    }, [stdout]);

    const setupSelected = useCallback((y: number) => {
        const selectedOffset = (followOutput ? maxOffset : offset) + y;
        setupSelectedTree(treeRef.current, selectedOffset)
        //setShowDialog(true)
        updateComponentRows(true)
    }, [followOutput, maxOffset, offset, updateComponentRows]) 

    // Ink's Key type is extended at runtime via the mouse patch (see patch_ink.ts)
    type InputKey = Key & { mouse?: { button: number; x: number; y: number; pressed: boolean } };
    const onInput = useCallback((input: string, key: InputKey) => {
        if (key.ctrl && input === 'c') { removeStdOut(); exit(); }

        if (key.pageUp || key.upArrow || (key.mouse && key.mouse.button === 64)) {
            setFollowOutput(false)
            setOffset(prev => Math.max(0, prev - (key.pageUp ? contentLines : SCROLL_JUMP)));
        }
        if (key.pageDown || key.downArrow || (key.mouse && key.mouse.button === 65)) {
            setOffset(prev => {
                const next = Math.min(maxOffset, prev + (key.pageDown ? contentLines : SCROLL_JUMP));
                if (next === maxOffset) setFollowOutput(true);
                return next;
            });
        }
        if (key.home) {
            setFollowOutput(false)
            setOffset(0);
        }
        if (key.end) {
            setFollowOutput(true)
            setOffset(maxOffset);
        }
        if (key.mouse && key.mouse.button === 0 && key.mouse.pressed) {
            setupSelected(key.mouse.y)
        }
    }, [maxOffset, contentLines, exit, removeStdOut, setupSelected]);
    useInput(onInput);

    const setupDimensions = useCallback((rows: number, columns: number) => {
        setRows(rows);
        treeRef.current.columns = columns - USAGE_PANEL; 
        rebuildTree(treeRef.current);
        updateComponentRows(true)
        setError('Columns=' + columns + 'trcc='+treeRef.current.columns)
    }, [updateComponentRows])
    useEffect(() => {
        const onResize = () => setupDimensions(stdout.rows, stdout.columns);
        stdout.on('resize', onResize);
        return () => { stdout.off('resize', onResize); };
    }, [stdout, setupDimensions]);

    useEffect(() => {
        stdout.write('\x1b[?1002h'); // button + drag
        stdout.write('\x1b[?1006h'); // SGR mouse protocol
        return () => { removeStdOut(); };
    }, [stdin, stdout, removeStdOut]);

    return (
        <Box flexDirection="row">
            <Box
                flexDirection="column"
                width="100%"
                justifyContent="space-between"
                borderColor="red"
            >
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
                    <TextInput
                        placeholder="Type here..."
                        onSubmit={handleSubmit}
                    />
                </Box>
            </Box>

            <Box
                flexDirection="column"
                width={USAGE_PANEL}
                minWidth={USAGE_PANEL}
                borderColor="cyan"
                backgroundColor="#111111"
                padding={1}
                justifyContent='space-between'
            >
                <Box flexDirection='column'>
                    <ReportPanel report={aiUsage} />
                    {loading && <Text color="yellow">Loading...</Text>}
                    {error && <Text color="red">{error}</Text>}
                </Box>
                <Box flexDirection='column'>
                    <Text>{'Bottom panel'}</Text>
                </Box>
            </Box>

            {showDialog && (
                <Box
                    position="absolute"
                    // width="100%"
                    // height="100%"
                    top={10}
                    left={10}
                    justifyContent="center"
                    alignItems="center"
                    backgroundColor={'yellow'}
                >
                    <Dialog title="Delete file?">
                        This action cannot be undone.
                    </Dialog>
                </Box>
            )}

        </Box>
    );
}
