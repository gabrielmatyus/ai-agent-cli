import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { execute_tool, tools, ToolDefinition } from '../ink/tools.js'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import * as path from 'path'
import * as os from 'os'

// Helper to create a temporary directory for file operations
const testDir = path.resolve(os.tmpdir(), 'ai-agent-test-tmp')

beforeEach(() => {
  mkdirSync(testDir, { recursive: true })
  process.env.AI_AGENT_CONFIRM = 'always'
})

afterEach(() => {
  delete process.env.AI_AGENT_CONFIRM
  rmSync(testDir, { recursive: true, force: true })
})

describe.skip('tools', () => {
  describe('tool definitions', () => {
    it('should export an array of tool definitions', async () => {
      expect(Array.isArray(tools)).toBe(true)
      expect(tools.length).toBeGreaterThan(0)
    })

    it('each tool should have type "function" and a name', async () => {
      for (const tool of tools) {
        expect(tool.type).toBe('function')
        expect(tool.function.name).toBeDefined()
        expect(typeof tool.function.name).toBe('string')
        expect(tool.function.description).toBeDefined()
        expect(tool.function.parameters).toBeDefined()
      }
    })

    it('should include required tools', async () => {
      const names = tools.map((t: ToolDefinition) => t.function.name)
      expect(names).toContain('read_file')
      expect(names).toContain('write_file')
      expect(names).toContain('edit_file')
      expect(names).toContain('list_directory')
      expect(names).toContain('glob_files')
      expect(names).toContain('grep_search')
      expect(names).toContain('create_directory')
      expect(names).toContain('delete_file')
      expect(names).toContain('rename_file')
      expect(names).toContain('execute_bash')
      expect(names).toContain('read_multiple_files')
    })
  })

  describe('executeTool', () => {
    describe('read_file', () => {
      it('should return error when file does not exist', async () => {
        const result = await execute_tool('read_file', { path: '/nonexistent/file.txt' })
        expect(result).toContain('Error: File not found:')
      })

      it('should read an existing file', async () => {
        const filePath = path.join(testDir, 'test.txt')
        writeFileSync(filePath, 'Hello World', 'utf-8')
        const result = await execute_tool('read_file', { path: filePath })
        expect(result).toBe('Hello World')
      })

      it('should return error when read_file path is not assigned or empty string', async () => {
        let result = await execute_tool('read_file', {})
        expect(result).toContain('Error: filePath is required')
        result = await execute_tool('read_file', { path: '' })
        expect(result).toContain('Error: filePath is required')
      })

      it('does not gate non-destructive tools', async () => {
        const srcFile = path.join(testDir, 'src.txt')
        writeFileSync(srcFile, 'hello')
        const result = await execute_tool('read_file', { path: srcFile })
        expect(result).toBe('hello')
      })
      it('should return error when reading file fails', async () => {
        const dirPath = path.join(testDir, 'some-directory')

        mkdirSync(dirPath)

        const result = await execute_tool('read_file', {
          path: dirPath
        })

        expect(result).toContain('Error reading file:')
      })
    })

    describe('write_file', () => {
      it('should write content to a file', async () => {
        const filePath = path.join(testDir, 'output.txt')
        const result = await execute_tool('write_file', { path: filePath, content: 'Test content' })
        expect(result).toContain('Successfully wrote')
        expect(readFileSync(filePath, 'utf-8')).toBe('Test content')
      })

      it('should return error when path is empty', async () => {
        const result = await execute_tool('write_file', { path: '', content: 'test' })
        expect(result).toContain('Error: filePath is required')
      })
      it('should return error when write_file no content is provided', async () => {
        const result = await execute_tool('write_file', { path: 'somefile.txt' })
        expect(result).toContain('Error: content is required')
      })
      it('should write content to a file', async () => {
        const filePath = path.join(testDir, 'output.txt')
        const content = 'Test content'

        const result = await execute_tool('write_file', {
          path: filePath,
          content
        })

        expect(result).toBe(`Successfully wrote ${content.length} bytes to ${filePath}`)
        expect(readFileSync(filePath, 'utf-8')).toBe(content)
      })
      it('should return error when writing file fails', async () => {
        const filePath = path.join(testDir, 'does-not-exist', 'output.txt')

        const result = await execute_tool('write_file', {
          path: filePath,
          content: 'Test content'
        })

        expect(result).toContain('Error writing file:')
      })
    })

    describe('edit_file', () => {
      it('should return error if filePath not specifies', async () => {
        const result = await execute_tool('edit_file', {})
        expect(result).toContain('Error: filePath is required')
      })

      it('should return error if oldString not found', async () => {
        const filePath = path.join(testDir, 'edit.txt')
        writeFileSync(filePath, 'Hello World', 'utf-8')
        const result = await execute_tool('edit_file', {
          path: filePath,
          oldString: 'NonExistent',
          newString: 'Replacement'
        })
        expect(result).toContain('oldString not found')
      })

      it('should return error if file does not exist', async () => {
        const result = await execute_tool('edit_file', {
          path: '/nonexistent/file.txt',
          oldString: 'foo',
          newString: 'bar'
        })
        expect(result).toContain('Error')
      })
      it('should return error if throws exception', async () => {
        const result = await execute_tool('edit_file', {
          path: '.',
          oldString: 'foo',
          newString: 'bar'
        })
        expect(result).toContain('Error editing file:')
      })
      it('should return error when edit_file oldString is missing', async () => {
        const filePath = path.join(testDir, 'tmp_ef.txt')
        writeFileSync(filePath, 'test', 'utf-8')
        const result = await execute_tool('edit_file', { path: filePath, newString: 'new' })
        expect(result).toContain('Error')
      })

      it('should return error when edit_file newString is missing', async () => {
        const filePath = path.join(testDir, 'tmp_ef.txt')
        writeFileSync(filePath, 'test', 'utf-8')
        const result = await execute_tool('edit_file', { path: filePath, oldString: 'test' })
        expect(result).toContain('Error')
      })

      it('should replace text in a file', async () => {
        const filePath = path.join(testDir, 'edit.txt')
        writeFileSync(filePath, 'Hello World', 'utf-8')
        const result = await execute_tool('edit_file', {
          path: filePath,
          oldString: 'World',
          newString: 'Jest'
        })
        expect(result).toContain('Successfully replaced')
        expect(readFileSync(filePath, 'utf-8')).toBe('Hello Jest')
      })
    })

    describe('list_directory', () => {
      it('should return error for non-existent directory', async () => {
        const result = await execute_tool('list_directory', { path: '/nonexistent/dir' })
        expect(result).toContain('Error')
      })

      it('should return error when list_directory path is empty string', async () => {
        const result = await execute_tool('list_directory', {})
        expect(result).toContain('Error: dirPath is required')
      })

      it('should list files in a directory', async () => {
        writeFileSync(path.join(testDir, 'file1.txt'), '')
        writeFileSync(path.join(testDir, 'file2.txt'), '')
        const result = await execute_tool('list_directory', { path: testDir })
        expect(result).toContain('file1.txt')
        expect(result).toContain('file2.txt')
      })
      it('should return recursive listing', async () => {
        const subDir = path.join(testDir, 'sub')
        mkdirSync(subDir, { recursive: true })
        writeFileSync(path.join(subDir, 'nested.txt'), '')
        const result = await execute_tool('list_directory', { path: testDir, recursive: true })
        expect(result).toContain('nested.txt')
      })
      it('should search in an empty folder', async () => {
        const subDir = path.join(testDir, 'subdir')
        mkdirSync(subDir, { recursive: true })
        const result = await execute_tool('list_directory', {
          path: subDir,
          excludePattern: '*.shouldBeIgnored'
        })
        expect(result).toContain('(empty directory)')
      })
      it('should skip file names with a pattern', async () => {
        writeFileSync(path.join(testDir, '.shouldBeIgnored'), '')
        const subDir = path.join(testDir, 'sub')
        mkdirSync(subDir, { recursive: true })
        const result = await execute_tool('list_directory', {
          path: testDir,
          excludePattern: '*.shouldBeIgnored'
        })
        expect(result).not.toContain('.shouldBeIgnored')
      })
      it('should return empty dir for recursive and no files found', async () => {
        const subDir = path.join(testDir, 'sub')
        mkdirSync(subDir, { recursive: true })
        const result = await execute_tool('list_directory', { path: subDir, recursive: true })
        expect(result).toContain('(empty directory)')
      })
    })

    describe('glob_files', () => {
      it('should return "No files matched" when no matches', async () => {
        const result = await execute_tool('glob_files', { basePath: testDir, pattern: '*.xyz' })
        expect(result).toBe('No files matched the pattern')
      })
      it('should return error when glob_files basePath is empty string', async () => {
        const result = await execute_tool('glob_files', { basePath: '', pattern: '' })
        expect(result).toContain('Error: basePath is required')
      })
      it('should return error when glob_files pattern is empty string', async () => {
        const result = await execute_tool('glob_files', { basePath: 'test', pattern: '' })
        expect(result).toContain('Error: pattern is required')
      })
      it('should return error when glob_files path does not exists', async () => {
        const result = await execute_tool('glob_files', { basePath: 'test', pattern: 'aaa' })
        expect(result).toContain('Error: Directory not found')
      })
      it('should find files matching a pattern', async () => {
        writeFileSync(path.join(testDir, 'test.ts'), '')
        const result = await execute_tool('glob_files', { basePath: testDir, pattern: '*.ts' })
        expect(result).toContain('test.ts')
        expect(result).not.toContain('test.js')
      })
      it('should glob files with multiple excluded folders', async () => {
        let newDir = path.join(testDir, '.ignore')
        mkdirSync(newDir, { recursive: true })
        writeFileSync(path.join(newDir, 'ignored.ts'), '')
        newDir = path.join(testDir, 'node_modules')
        mkdirSync(newDir, { recursive: true })
        newDir = path.join(testDir, '.git')
        mkdirSync(newDir, { recursive: true })
        newDir = path.join(testDir, 'out')
        mkdirSync(newDir, { recursive: true })
        newDir = path.join(testDir, 'dist')
        mkdirSync(newDir, { recursive: true })
        const result = await execute_tool('glob_files', { basePath: testDir, pattern: '*.ts' })
        expect(result).not.toContain('test.ts')
      })
      it('should find files based on file name in subfolders', async () => {
        writeFileSync(path.join(testDir, 'test.ts'), '')
        const newDir = path.join(testDir, 'subfolder')
        mkdirSync(newDir, { recursive: true })
        writeFileSync(path.join(newDir, 'test.ts'), '')
        const result = await execute_tool('glob_files', { basePath: testDir, pattern: 'test.ts' })
        expect(result).toContain('test.ts')
      })
      it('should find files based on not found file name in subfolders', async () => {
        writeFileSync(path.join(testDir, 'test.ts'), '')
        const newDir = path.join(testDir, 'subfolder')
        mkdirSync(newDir, { recursive: true })
        writeFileSync(path.join(newDir, 'test.ts'), '')
        const result = await execute_tool('glob_files', { basePath: testDir, pattern: 'test1.ts' })
        expect(result).not.toContain('test.ts')
      })
    })

    describe('grep_search', () => {
      it('should return "No matches found" when no matches', async () => {
        writeFileSync(path.join(testDir, 'search.txt'), 'nothing here')
        const result = await execute_tool('grep_search', {
          basePath: testDir,
          pattern: 'nonexistent'
        })
        expect(result).toBe('No matches found')
      })
      it('should return error when grep_search basePath is empty string', async () => {
        const result = await execute_tool('grep_search', { basePath: '', pattern: 'hello' })
        expect(result).toContain('Error: basePath is required')
      })
      it('should return error when grep_search pattern is empty string', async () => {
        const result = await execute_tool('grep_search', { basePath: testDir, pattern: '' })
        expect(result).toContain('Error: pattern is required')
      })
      it('should return error when grep_search folder does not exists', async () => {
        const result = await execute_tool('grep_search', {
          basePath: `${testDir}/nonexistent`,
          pattern: 'aaa'
        })
        expect(result).toContain('Error: Directory not found')
      })
      it('should find matching lines in files', async () => {
        writeFileSync(path.join(testDir, 'search.txt'), 'line1\nhello world\nline3')
        const result = await execute_tool('grep_search', {
          basePath: testDir,
          pattern: 'hello'
        })
        expect(result).toContain('hello world')
      })
      it('should filter by includePattern', async () => {
        writeFileSync(path.join(testDir, 'match.ts'), 'const x = 1;')
        writeFileSync(path.join(testDir, 'ignore.js'), 'const x = 1;')
        const result = await execute_tool('grep_search', {
          basePath: testDir,
          pattern: 'const',
          includePattern: '*.ts'
        })
        expect(result).toContain('match.ts')
        expect(result).not.toContain('ignore.js')
      })
      it('should find files based on file name in subfolders and content specified', async () => {
        writeFileSync(path.join(testDir, 'test.ts'), 'const x = 1;')
        const newDir = path.join(testDir, 'subfolder')
        mkdirSync(newDir, { recursive: true })
        writeFileSync(path.join(newDir, 'test.ts'), 'const y = 2;')
        const result = await execute_tool('grep_search', {
          basePath: testDir,
          pattern: 'const',
          includePattern: '*.ts'
        })
        expect(result).toContain('const x = 1;')
        expect(result).toContain('const y = 2;')
      })
      it('should find files based on file name in subfolders and content specified, with maxResults', async () => {
        writeFileSync(path.join(testDir, 'test.ts'), 'const x = 1;')
        const newDir = path.join(testDir, 'subfolder')
        mkdirSync(newDir, { recursive: true })
        writeFileSync(path.join(newDir, 'test.ts'), 'const y = 2;')
        const result = await execute_tool('grep_search', {
          basePath: testDir,
          pattern: 'const',
          includePattern: '*.ts',
          maxResults: 1
        })
        expect(result).toContain('const y = 2;')
        expect(result).not.toContain('const x = 1;')
      })
    })

    describe('create_directory', () => {
      it('should return error when create_directory path is empty string', async () => {
        const result = await execute_tool('create_directory', { path: '' })
        expect(result).toContain('Error: dirPath is required')
      })
      it('should create a new directory', async () => {
        const newDir = path.join(testDir, 'new-dir')
        const result = await execute_tool('create_directory', { path: newDir })
        expect(result).toContain('Successfully created directory')
        expect(existsSync(newDir)).toBe(true)
      })
    })

    describe('delete_file', () => {
      it('should return error when delete_file path is empty string', async () => {
        const result = await execute_tool('delete_file', { path: '' })
        expect(result).toContain('Error: filePath is required')
      })
      it('should return error if file does not exist', async () => {
        const result = await execute_tool('delete_file', { path: '/nonexistent/file.txt' })
        expect(result).toContain('Error: File not found')
      })

      it('should delete a file', async () => {
        const filePath = path.join(testDir, 'delete-me.txt')
        writeFileSync(filePath, 'to be deleted', 'utf-8')
        const result = await execute_tool('delete_file', { path: filePath })
        expect(result).toContain('Successfully deleted')
        expect(existsSync(filePath)).toBe(false)
      })
    })

    describe('rename_file', () => {
      it('should rename a file', async () => {
        const oldPath = path.join(testDir, 'old.txt')
        const newPath = path.join(testDir, 'new.txt')
        writeFileSync(oldPath, 'content', 'utf-8')
        const result = await execute_tool('rename_file', { oldPath, newPath })
        expect(result).toContain('Successfully renamed')
        expect(existsSync(oldPath)).toBe(false)
        expect(existsSync(newPath)).toBe(true)
      })

      it('should return error if source does not exist', async () => {
        const result = await execute_tool('rename_file', {
          oldPath: '/nonexistent/old.txt',
          newPath: path.join(testDir, 'new.txt')
        })
        expect(result).toContain('Error')
      })

      it('should return error when rename_file oldPath is empty string', async () => {
        const result = await execute_tool('rename_file', { oldPath: '' })
        expect(result).toContain('Error: oldPath is required')
      })

      it('should return error when rename_file new path doesn not exists', async () => {
        const result = await execute_tool('rename_file', { oldPath: 'aaa.txt' })
        expect(result).toContain('Error: newPath is required')
      })

      it('should return error when rename_file newPath is empty string', async () => {
        const result = await execute_tool('rename_file', { oldPath: 'aaa.txt', newPath: '' })
        expect(result).toContain('Error: newPath is required')
      })
      it('should return error when rename_file newPath is already existing', async () => {
        const oldPath = path.join(testDir, 'old.txt')
        const newPath = path.join(testDir, 'new.txt')
        writeFileSync(oldPath, 'content', 'utf-8')
        writeFileSync(newPath, 'existing content', 'utf-8')
        const result = await execute_tool('rename_file', { oldPath, newPath })
        expect(result).toContain('Error: Target already exists:')
      })
    })

    describe('execute_bash', () => {
      it('should return error for invalid command', async () => {
        const result = await execute_tool('execute_bash', {
          command: 'nonexistent_command_xyz'
        })
        expect(result).toContain('Exit code')
      })
      it('should return error when execute_bash command is empty string', async () => {
        const result = await execute_tool('execute_bash', { command: '' })
        expect(result).toContain('Error')
      })

      it('should execute a command and return output', async () => {
        const result = await execute_tool('execute_bash', {
          command: 'echo hello',
          workdir: testDir
        })
        expect(result).toContain('hello')
      })
      it('should complete with no output for a command that produces no output', async () => {
        const result = await execute_tool('execute_bash', {
          command: 'true',
          workdir: testDir
        })
        expect(result).toContain('command completed with no output')
      })
      it('should complete with no output for a command that does not exists', async () => {
        const result = await execute_tool('execute_bash', {
          command: 'nonexistent_command_xyz',
          workdir: testDir
        })
        expect(result).toContain('Exit code: 1')
      })
    })

    describe('read_multiple_files', () => {
      it('should read multiple files', async () => {
        const file1 = path.join(testDir, 'f1.txt')
        const file2 = path.join(testDir, 'f2.txt')
        writeFileSync(file1, 'Content 1', 'utf-8')
        writeFileSync(file2, 'Content 2', 'utf-8')
        const result = await execute_tool('read_multiple_files', {
          path: [file1, file2]
        })
        expect(result).toContain('Content 1')
        expect(result).toContain('Content 2')
      })

      it('should report error for non-existent file', async () => {
        const result = await execute_tool('read_multiple_files', {
          path: ['/nonexistent/file.txt']
        })
        expect(result).toContain('Error: File not found')
      })
      it('should return error when read_multiple_files path array is empty', async () => {
        const result = await execute_tool('read_multiple_files', {})
        expect(result).toContain('Error: path must be an array')
      })
    })

    describe('unknown tool', () => {
      it('should return error for unknown tool name', async () => {
        const result = await execute_tool('unknown_tool', {})
        expect(result).toContain('Unknown tool')
      })
    })

    describe('destructive tool confirmation gate', () => {
      let deniedFile: string

      beforeEach(() => {
        deniedFile = path.join(testDir, 'denied.txt')
        delete process.env.AI_AGENT_CONFIRM
      })

      it('denies destructive tools by default in a non-interactive environment', async () => {
        const result = await execute_tool('write_file', {
          path: deniedFile,
          content: 'should not be written'
        })
        expect(result).toContain('User denied: write_file')
        expect(result).toContain('denied.txt')
        expect(existsSync(deniedFile)).toBe(false)
      })

      it('denies execute_bash by default in a non-interactive environment', async () => {
        const result = await execute_tool('execute_bash', { command: 'echo denied' })
        expect(result).toContain('User denied: execute_bash')
      })

      it('allows destructive tools when AI_AGENT_CONFIRM=always', async () => {
        process.env.AI_AGENT_CONFIRM = 'always'
        const result = await execute_tool('write_file', { path: deniedFile, content: 'ok' })
        expect(result).toContain('Successfully wrote')
        expect(readFileSync(deniedFile, 'utf-8')).toBe('ok')
      })

      it('rejects destructive tools when AI_AGENT_CONFIRM=never', async () => {
        process.env.AI_AGENT_CONFIRM = 'never'
        const result = await execute_tool('write_file', { path: deniedFile, content: 'no' })
        expect(result).toContain('User denied: write_file')
        expect(existsSync(deniedFile)).toBe(false)
      })

      it('skips the confirmation gate when skipConfirmation is set', async () => {
        const result = await execute_tool(
          'write_file',
          { path: deniedFile, content: 'internal' },
          { skipConfirmation: true }
        )
        expect(result).toContain('Successfully wrote')
        expect(readFileSync(deniedFile, 'utf-8')).toBe('internal')
      })
    })
  })
})
