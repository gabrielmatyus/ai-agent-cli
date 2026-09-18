const DESTRUCTIVE_TOOLS = new Set<string>([
  'write_file',
  'delete_file',
  'rename_file',
  'execute_bash'
])

export function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOLS.has(name)
}

export function describeAction(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>
  const target =
    typeof a.command === 'string'
      ? a.command
      : typeof a.path === 'string'
        ? a.path
        : typeof a.oldPath === 'string'
          ? a.oldPath
          : Array.isArray(a.path)
            ? (a.path as string[]).join(', ')
            : ''
  return target ? `${name}: ${target}` : name
}

/**
 * Decides the confirmation from the environment (AI_AGENT_CONFIRM).
 * Returns true to allow, false to deny, or undefined when an interactive
 * decision is required (the UI shows a dialog).
 */
export function autoDecision(): boolean | undefined {
  const mode = (process.env.AI_AGENT_CONFIRM ?? '').trim().toLowerCase()
  if (['always', 'allow', 'all', 'yes', 'y'].includes(mode)) return true
  if (['never', 'deny', 'no', 'n'].includes(mode)) return false
  return undefined
}
