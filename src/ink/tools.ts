import { execSync } from 'child_process'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  unlinkSync,
  renameSync,
  statSync
} from 'fs'
import { join, relative, resolve } from 'path'

const baseDir = process.cwd()

function resolvePath(p: string): string {
  return resolve(baseDir, p)
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function listFilesRecursive(dir: string, baseDir: string, maxDepth = 10, _depth = 0): string[] {
  if (_depth > maxDepth) return []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    const result: string[] = []
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relPath = relative(baseDir, fullPath)
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules') continue
      if (entry.name === '.git') continue
      if (entry.name === 'out') continue
      if (entry.name === 'dist') continue
      if (entry.isDirectory()) {
        result.push(relPath + '/')
        result.push(...listFilesRecursive(fullPath, baseDir, maxDepth, _depth + 1))
      } else {
        result.push(relPath)
      }
    }
    return result
  } catch {
    // Permission error or inaccessible directory — skip and return empty
    return []
  }
}

function matchGlobPattern(filePath: string, pattern: string): boolean {
  const parts = pattern.split('/')
  const fileParts = filePath.split('/')

  let fi = 0
  for (let pi = 0; pi < parts.length; pi++) {
    if (parts[pi] === '**') {
      if (pi === parts.length - 1) return true
      const next = parts[pi + 1]
      while (fi < fileParts.length) {
        if (matchSimplePattern(fileParts[fi], next)) {
          pi++
          fi++
          break
        }
        fi++
      }
      if (fi >= fileParts.length && pi < parts.length - 1) return false
    } else {
      if (fi >= fileParts.length) return false
      if (!matchSimplePattern(fileParts[fi], parts[pi])) return false
      fi++
    }
  }
  return fi === fileParts.length
}

function matchSimplePattern(name: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexStr}$`).test(name)
}

function globFiles(basePath: string, pattern: string): string[] {
  const base = resolve(basePath)
  const allFiles = listFilesRecursive(base, base, 20)
  if (!pattern.includes('*') && !pattern.includes('?')) {
    const matched = allFiles.filter(
      (f) => f === pattern || f.endsWith('/' + pattern) || f.startsWith(pattern)
    )
    return matched.length > 0 ? matched : allFiles.filter((f) => f.includes(pattern))
  }
  return allFiles.filter((f) => matchGlobPattern(f, pattern))
}

function grepFiles(
  basePath: string,
  pattern: string,
  includePattern?: string,
  maxResults = 50
): string {
  const base = resolve(basePath)
  const allFiles = listFilesRecursive(base, base, 20)
  const regex = new RegExp(pattern)
  const results: string[] = []
  let count = 0

  for (const relPath of allFiles) {
    if (relPath.endsWith('/')) continue
    if (includePattern && !matchGlobPattern(relPath, includePattern)) continue

    const fullPath = join(base, relPath)
    try {
      const content = readFileSync(fullPath, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`)
          count++
          if (count >= maxResults) {
            results.push(`... (truncated at ${maxResults} matches)`)
            return results.join('\n')
          }
        }
      }
    } catch {
      // Skip unreadable files (permission issues, binary files, etc.)
    }
  }

  return results.join('\n') || 'No matches found'
}

export const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the full contents of a file. Paths are relative to the project root or absolute.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file (relative to project root or absolute)'
          }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_multiple_files',
      description:
        'Read the contents of multiple files at once. More efficient than calling read_file repeatedly.',
      parameters: {
        type: 'object',
        properties: {
          filePaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of file paths (relative to project root or absolute)'
          }
        },
        required: ['filePaths']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write content to a file (creates or overwrites). Paths are relative to the project root or absolute.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file (relative to project root or absolute)'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file'
          }
        },
        required: ['filePath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Apply a targeted string replacement in a file. Finds exact oldString and replaces it with newString. Use this for surgical changes instead of rewriting the whole file.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file (relative to project root or absolute)'
          },
          oldString: {
            type: 'string',
            description: 'The exact text to search for in the file'
          },
          newString: {
            type: 'string',
            description: 'The replacement text'
          }
        },
        required: ['filePath', 'oldString', 'newString']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List the contents of a directory, showing files and subdirectories',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: 'Path to the directory (relative to project root or absolute)'
          },
          recursive: {
            type: 'boolean',
            description: 'Whether to list recursively (default: false)'
          }
        },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob_files',
      description:
        'Find files matching a glob pattern (supports *, **, ? wildcards). Returns relative paths from the base directory.',
      parameters: {
        type: 'object',
        properties: {
          basePath: {
            type: 'string',
            description:
              'Base directory (relative to project root or absolute). Use "." for project root.'
          },
          pattern: {
            type: 'string',
            description: 'Glob pattern to match (e.g. "**/*.ts", "src/**/*.css")'
          }
        },
        required: ['basePath', 'pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description:
        'Search for a regex pattern across files in a directory. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          basePath: {
            type: 'string',
            description:
              'Base directory to search (relative to project root or absolute). Use "." for project root.'
          },
          pattern: {
            type: 'string',
            description: 'Regex pattern to search for'
          },
          includePattern: {
            type: 'string',
            description: 'Optional glob pattern to filter files (e.g. "*.ts", "**/*.{tsx,ts}")'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of matching lines to return (default: 50)'
          }
        },
        required: ['basePath', 'pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a directory (creates parent directories if needed)',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: 'Path of the directory to create (relative to project root or absolute)'
          }
        },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to delete (relative to project root or absolute)'
          }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_bash',
      description:
        'Execute a bash command on the local system and return its stdout + stderr output. Use this for running scripts, git commands, builds, tests, and any shell operations.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute'
          },
          workdir: {
            type: 'string',
            description:
              'Optional working directory (relative to project root or absolute). Defaults to project root.'
          },
          timeout: {
            type: 'number',
            description: 'Optional timeout in milliseconds (default: 30000)'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename or move a file',
      parameters: {
        type: 'object',
        properties: {
          oldPath: {
            type: 'string',
            description: 'Current path of the file (relative to project root or absolute)'
          },
          newPath: {
            type: 'string',
            description: 'New path for the file (relative to project root or absolute)'
          }
        },
        required: ['oldPath', 'newPath']
      }
    }
  }
]

export function executeTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'read_file': {
      const filePath = resolvePath(args.filePath as string)
      if (!filePath) return 'Error: filePath is required'
      if (!existsSync(filePath)) return `Error: File not found: ${filePath}`
      try {
        return readFileSync(filePath, 'utf-8')
      } catch (err) {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'read_multiple_files': {
      const rawPaths = args.filePaths as string[]
      if (!rawPaths || !Array.isArray(rawPaths)) return 'Error: filePaths must be an array'
      const parts: string[] = []
      for (const raw of rawPaths) {
        const fp = resolvePath(raw)
        if (!existsSync(fp)) {
          parts.push(`--- ${raw} ---\nError: File not found`)
        } else {
          try {
            const content = readFileSync(fp, 'utf-8')
            const lines = content.split('\n').length
            parts.push(`--- ${raw} (${lines} lines) ---\n${content}`)
          } catch (err) {
            parts.push(
              `--- ${raw} ---\nError reading file: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }
      }
      return parts.join('\n\n')
    }
    case 'write_file': {
      const filePath = resolvePath(args.filePath as string)
      const content = args.content as string
      if (!filePath) return 'Error: filePath is required'
      if (content === undefined) return 'Error: content is required'
      try {
        writeFileSync(filePath, content, 'utf-8')
        return `Successfully wrote ${content.length} bytes to ${filePath}`
      } catch (err) {
        return `Error writing file: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'edit_file': {
      const filePath = resolvePath(args.filePath as string)
      const oldString = args.oldString as string
      const newString = args.newString as string
      if (!filePath) return 'Error: filePath is required'
      if (!oldString) return 'Error: oldString is required'
      if (newString === undefined) return 'Error: newString is required'
      if (!existsSync(filePath)) return `Error: File not found: ${filePath}`
      try {
        const content = readFileSync(filePath, 'utf-8')
        const idx = content.indexOf(oldString)
        if (idx === -1) return 'Error: oldString not found in file'
        const newContent = content.replace(oldString, newString)
        writeFileSync(filePath, newContent, 'utf-8')
        const lineNum = content.slice(0, idx).split('\n').length
        return `Successfully replaced match at line ${lineNum} in ${filePath}`
      } catch (err) {
        return `Error editing file: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'list_directory': {
      const dirPath = resolvePath(args.dirPath as string)
      const recursive = args.recursive as boolean | undefined
      if (!dirPath) return 'Error: dirPath is required'
      if (!existsSync(dirPath)) return `Error: Directory not found: ${dirPath}`
      try {
        if (recursive) {
          const allFiles = listFilesRecursive(dirPath, dirPath)
          return allFiles.length === 0 ? '(empty directory)' : allFiles.join('\n')
        }
        const entries = readdirSync(dirPath, { withFileTypes: true })
        const parts: string[] = []
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue
          if (entry.isDirectory()) {
            parts.push(entry.name + '/')
          } else {
            const stats = statSync(join(dirPath, entry.name))
            parts.push(`${entry.name} (${stats.size} B)`)
          }
        }
        return parts.length === 0 ? '(empty directory)' : parts.join('\n')
      } catch (err) {
        return `Error listing directory: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'glob_files': {
      const basePath = resolvePath(args.basePath as string)
      const pattern = args.pattern as string
      if (!basePath) return 'Error: basePath is required'
      if (!pattern) return 'Error: pattern is required'
      if (!existsSync(basePath)) return `Error: Directory not found: ${basePath}`
      try {
        const matches = globFiles(basePath, pattern)
        return matches.length === 0 ? 'No files matched the pattern' : matches.join('\n')
      } catch (err) {
        return `Error globbing files: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'grep_search': {
      const basePath = resolvePath(args.basePath as string)
      const pattern = args.pattern as string
      const includePattern = args.includePattern as string | undefined
      const maxResults = (args.maxResults as number | undefined) || 50
      if (!basePath) return 'Error: basePath is required'
      if (!pattern) return 'Error: pattern is required'
      if (!existsSync(basePath)) return `Error: Directory not found: ${basePath}`
      try {
        return grepFiles(basePath, pattern, includePattern, maxResults)
      } catch (err) {
        return `Error searching: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'create_directory': {
      const dirPath = resolvePath(args.dirPath as string)
      if (!dirPath) return 'Error: dirPath is required'
      try {
        mkdirSync(dirPath, { recursive: true })
        return `Successfully created directory: ${dirPath}`
      } catch (err) {
        return `Error creating directory: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'delete_file': {
      const filePath = resolvePath(args.filePath as string)
      if (!filePath) return 'Error: filePath is required'
      if (!existsSync(filePath)) return `Error: File not found: ${filePath}`
      try {
        unlinkSync(filePath)
        return `Successfully deleted: ${filePath}`
      } catch (err) {
        return `Error deleting file: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    case 'execute_bash': {
      const command = args.command as string
      const workdir = args.workdir ? resolvePath(args.workdir as string) : undefined
      const timeout = (args.timeout as number | undefined) || 30000
      if (!command) return 'Error: command is required'
      try {
        const output = execSync(command, {
          cwd: workdir,
          timeout,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        })
        return output || '(command completed with no output)'
      } catch (err: unknown) {
        const execErr = err as {
          status?: number
          stdout?: string
          stderr?: string
          message?: string
        }
        if (execErr.stdout && execErr.stderr) {
          return `Exit code: ${execErr.status}\nstdout:\n${execErr.stdout}\nstderr:\n${execErr.stderr}`
        }
        if (execErr.stdout) return `Exit code: ${execErr.status}\n${execErr.stdout}`
        if (execErr.stderr) return `Exit code: ${execErr.status}\n${execErr.stderr}`
        return `Error executing command: ${execErr.message ?? 'Unknown error'}`
      }
    }
    case 'rename_file': {
      const oldPath = resolvePath(args.oldPath as string)
      const newPath = resolvePath(args.newPath as string)
      if (!oldPath) return 'Error: oldPath is required'
      if (!newPath) return 'Error: newPath is required'
      if (!existsSync(oldPath)) return `Error: File not found: ${oldPath}`
      if (existsSync(newPath)) return `Error: Target already exists: ${newPath}`
      try {
        renameSync(oldPath, newPath)
        return `Successfully renamed ${oldPath} → ${newPath}`
      } catch (err) {
        return `Error renaming file: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    default:
      return `Error: Unknown tool: ${name}`
  }
}
