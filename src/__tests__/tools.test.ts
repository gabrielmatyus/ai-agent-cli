import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { executeTool, tools, ToolDefinition } from '../ink/tools.js';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync  }  from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper to create a temporary directory for file operations
const testDir = path.resolve(os.tmpdir(), 'ai-agent-test-tmp');

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('tools', () => {
  describe('tool definitions', () => {
    it('should export an array of tool definitions', () => {
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('each tool should have type "function" and a name', () => {
      for (const tool of tools) {
        expect(tool.type).toBe('function');
        expect(tool.function.name).toBeDefined();
        expect(typeof tool.function.name).toBe('string');
        expect(tool.function.description).toBeDefined();
        expect(tool.function.parameters).toBeDefined();
      }
    });

    it('should include required tools', () => {
      const names = tools.map((t: ToolDefinition) => t.function.name);
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('edit_file');
      expect(names).toContain('list_directory');
      expect(names).toContain('glob_files');
      expect(names).toContain('grep_search');
      expect(names).toContain('create_directory');
      expect(names).toContain('delete_file');
      expect(names).toContain('rename_file');
      expect(names).toContain('execute_bash');
      expect(names).toContain('read_multiple_files');
    });
  });

  describe('executeTool', () => {
    describe('read_file', () => {
      it('should return error when file does not exist', () => {
        const result = executeTool('read_file', { filePath: '/nonexistent/file.txt' });
        expect(result).toContain('Error');
      });

      it('should read an existing file', () => {
        const filePath = path.join(testDir, 'test.txt');
        writeFileSync(filePath, 'Hello World', 'utf-8');
        const result = executeTool('read_file', { filePath });
        expect(result).toBe('Hello World');
      });
    });

    describe('write_file', () => {
      it('should write content to a file', () => {
        const filePath = path.join(testDir, 'output.txt');
        const result = executeTool('write_file', { filePath, content: 'Test content' });
        expect(result).toContain('Successfully wrote');
        expect(readFileSync(filePath, 'utf-8')).toBe('Test content');
      });

      it('should return error when filePath is empty', () => {
        const result = executeTool('write_file', { filePath: '', content: 'test' });
        // The function will resolve the path and try to write; might fail differently
        // but should indicate some error
        expect(result).toContain('Error');
      });
    });

    describe('edit_file', () => {
      it('should replace text in a file', () => {
        const filePath = path.join(testDir, 'edit.txt');
        writeFileSync(filePath, 'Hello World', 'utf-8');
        const result = executeTool('edit_file', {
          filePath,
          oldString: 'World',
          newString: 'Jest',
        });
        expect(result).toContain('Successfully replaced');
        expect(readFileSync(filePath, 'utf-8')).toBe('Hello Jest');
      });

      it('should return error if oldString not found', () => {
        const filePath = path.join(testDir, 'edit.txt');
        writeFileSync(filePath, 'Hello World', 'utf-8');
        const result = executeTool('edit_file', {
          filePath,
          oldString: 'NonExistent',
          newString: 'Replacement',
        });
        expect(result).toContain('oldString not found');
      });

      it('should return error if file does not exist', () => {
        const result = executeTool('edit_file', {
          filePath: '/nonexistent/file.txt',
          oldString: 'foo',
          newString: 'bar',
        });
        expect(result).toContain('Error');
      });
    });

    describe('list_directory', () => {
      it('should list files in a directory', () => {
        writeFileSync(path.join(testDir, 'file1.txt'), '');
        writeFileSync(path.join(testDir, 'file2.txt'), '');
        const result = executeTool('list_directory', { dirPath: testDir });
        expect(result).toContain('file1.txt');
        expect(result).toContain('file2.txt');
      });

      it('should return error for non-existent directory', () => {
        const result = executeTool('list_directory', { dirPath: '/nonexistent/dir' });
        expect(result).toContain('Error');
      });

      it('should return recursive listing', () => {
        const subDir = path.join(testDir, 'sub');
        mkdirSync(subDir, { recursive: true });
        writeFileSync(path.join(subDir, 'nested.txt'), '');
        const result = executeTool('list_directory', { dirPath: testDir, recursive: true });
        expect(result).toContain('nested.txt');
      });
    });

    describe('glob_files', () => {
      it('should find files matching a pattern', () => {
        writeFileSync(path.join(testDir, 'test.ts'), '');
        writeFileSync(path.join(testDir, 'test.js'), '');
        const result = executeTool('glob_files', { basePath: testDir, pattern: '*.ts' });
        expect(result).toContain('test.ts');
        expect(result).not.toContain('test.js');
      });

      it('should return "No files matched" when no matches', () => {
        const result = executeTool('glob_files', { basePath: testDir, pattern: '*.xyz' });
        expect(result).toBe('No files matched the pattern');
      });
    });

    describe('grep_search', () => {
      it('should find matching lines in files', () => {
        writeFileSync(path.join(testDir, 'search.txt'), 'line1\nhello world\nline3');
        const result = executeTool('grep_search', {
          basePath: testDir,
          pattern: 'hello',
        });
        expect(result).toContain('hello world');
      });

      it('should return "No matches found" when no matches', () => {
        writeFileSync(path.join(testDir, 'search.txt'), 'nothing here');
        const result = executeTool('grep_search', {
          basePath: testDir,
          pattern: 'nonexistent',
        });
        expect(result).toBe('No matches found');
      });

      it('should filter by includePattern', () => {
        writeFileSync(path.join(testDir, 'match.ts'), 'const x = 1;');
        writeFileSync(path.join(testDir, 'ignore.js'), 'const x = 1;');
        const result = executeTool('grep_search', {
          basePath: testDir,
          pattern: 'const',
          includePattern: '*.ts',
        });
        expect(result).toContain('match.ts');
        expect(result).not.toContain('ignore.js');
      });
    });

    describe('create_directory', () => {
      it('should create a new directory', () => {
        const newDir = path.join(testDir, 'new-dir');
        const result = executeTool('create_directory', { dirPath: newDir });
        expect(result).toContain('Successfully created directory');
        expect(existsSync(newDir)).toBe(true);
      });
    });

    describe('delete_file', () => {
      it('should delete a file', () => {
        const filePath = path.join(testDir, 'delete-me.txt');
        writeFileSync(filePath, 'to be deleted', 'utf-8');
        const result = executeTool('delete_file', { filePath });
        expect(result).toContain('Successfully deleted');
        expect(existsSync(filePath)).toBe(false);
      });

      it('should return error if file does not exist', () => {
        const result = executeTool('delete_file', { filePath: '/nonexistent/file.txt' });
        expect(result).toContain('Error');
      });
    });

    describe('rename_file', () => {
      it('should rename a file', () => {
        const oldPath = path.join(testDir, 'old.txt');
        const newPath = path.join(testDir, 'new.txt');
        writeFileSync(oldPath, 'content', 'utf-8');
        const result = executeTool('rename_file', { oldPath, newPath });
        expect(result).toContain('Successfully renamed');
        expect(existsSync(oldPath)).toBe(false);
        expect(existsSync(newPath)).toBe(true);
      });

      it('should return error if source does not exist', () => {
        const result = executeTool('rename_file', {
          oldPath: '/nonexistent/old.txt',
          newPath: path.join(testDir, 'new.txt'),
        });
        expect(result).toContain('Error');
      });
    });

    describe('execute_bash', () => {
      it('should execute a command and return output', () => {
        const result = executeTool('execute_bash', {
          command: 'echo hello',
          workdir: testDir,
        });
        expect(result).toContain('hello');
      });

      it('should return error for invalid command', () => {
        const result = executeTool('execute_bash', {
          command: 'nonexistent_command_xyz',
        });
        expect(result).toContain('Exit code');
      });
    });

    describe('read_multiple_files', () => {
      it('should read multiple files', () => {
        const file1 = path.join(testDir, 'f1.txt');
        const file2 = path.join(testDir, 'f2.txt');
        writeFileSync(file1, 'Content 1', 'utf-8');
        writeFileSync(file2, 'Content 2', 'utf-8');
        const result = executeTool('read_multiple_files', {
          filePaths: [file1, file2],
        });
        expect(result).toContain('Content 1');
        expect(result).toContain('Content 2');
      });

      it('should report error for non-existent file', () => {
        const result = executeTool('read_multiple_files', {
          filePaths: ['/nonexistent/file.txt'],
        });
        expect(result).toContain('Error: File not found');
      });
    });

    describe('unknown tool', () => {
      it('should return error for unknown tool name', () => {
        const result = executeTool('unknown_tool', {});
        expect(result).toContain('Unknown tool');
      });
    });
  });
});
