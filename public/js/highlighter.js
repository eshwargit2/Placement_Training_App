/**
 * Python Code Syntax Highlighter & Editor Sync
 * Provides real-time syntax highlighting for Python keywords, built-in functions,
 * strings, numbers, comments, methods, and symbols with line numbers and editor synchronization.
 */

function highlightPythonCode(code) {
  if (!code && code !== "") return "";
  
  const escHtml = (str) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Comprehensive Python lexical tokenizer regex:
  // 1: Comments (# ...)
  // 2: Multiline & single-line strings ("""...""", '''...''', f"...", r"...", "...", '...')
  // 3: Function/Class definition header (def name / class name)
  // 4: Name part of def/class
  // 5: Decorator (@name)
  // 6: Python Keywords
  // 7: Built-in Methods & Functions
  // 8: Constants & Special Literals (True, False, None, self, cls)
  // 9: Numbers (ints, floats, scientific, hex, bin)
  // 10: Operators & Symbols
  const tokenRegex = /(#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|f?"(?:\\.|[^"\\])*"|f?'(?:\\.|[^'\\])*'|r"(?:\\.|[^"\\])*"|r'(?:\\.|[^'\\])*')|(\b(?:def|class)\s+([a-zA-Z_]\w*))|(@[a-zA-Z_]\w*)|(\b(?:def|class|if|elif|else|while|for|in|return|import|from|as|try|except|finally|with|lambda|pass|break|continue|yield|global|nonlocal|assert|raise|is|not|and|or|del|async|await)\b)|(\b(?:print|input|len|range|int|str|float|list|dict|set|tuple|bool|type|sum|min|max|sorted|map|filter|zip|enumerate|open|abs|round|isinstance|issubclass|id|help|dir|repr|iter|next|all|any|pow|bin|oct|hex|chr|ord|reversed|slice|format|super|vars|callable|hasattr|getattr|setattr|delattr|append|extend|pop|insert|remove|clear|index|count|sort|reverse|copy|keys|values|items|get|update|split|join|strip|lstrip|rstrip|replace|find|startswith|endswith|lower|upper|title|capitalize|isdigit|isalpha|isalnum)\b)|(\b(?:True|False|None|self|cls)\b)|(\b(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\b|0[xX][0-9a-fA-F]+\b|0[bB][01]+\b)|([+\-*/%=<>!&|^~:]+)/gm;

  let lastIndex = 0;
  let match;
  let result = "";

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      result += escHtml(code.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Comment
      result += `<span class="py-comment">${escHtml(match[1])}</span>`;
    } else if (match[2]) {
      // String
      result += `<span class="py-string">${escHtml(match[2])}</span>`;
    } else if (match[3]) {
      // Def/Class declaration: e.g. "def solution" or "class Solution"
      const isClass = match[3].startsWith("class");
      const kw = isClass ? "class" : "def";
      const name = match[4] || "";
      result += `<span class="py-keyword">${kw}</span> <span class="${isClass ? 'py-class' : 'py-func'}">${escHtml(name)}</span>`;
    } else if (match[5]) {
      // Decorator
      result += `<span class="py-decorator">${escHtml(match[5])}</span>`;
    } else if (match[6]) {
      // Python Keyword
      result += `<span class="py-keyword">${escHtml(match[6])}</span>`;
    } else if (match[7]) {
      // Built-in Function / Method
      result += `<span class="py-builtin">${escHtml(match[7])}</span>`;
    } else if (match[8]) {
      // Constant / Special Identifier
      result += `<span class="py-constant">${escHtml(match[8])}</span>`;
    } else if (match[9]) {
      // Number
      result += `<span class="py-number">${escHtml(match[9])}</span>`;
    } else if (match[10]) {
      // Operator
      result += `<span class="py-operator">${escHtml(match[10])}</span>`;
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < code.length) {
    result += escHtml(code.slice(lastIndex));
  }

  // If text ends with a newline, append an extra invisible character so the pre tag maintains the same vertical height as the textarea
  if (code.endsWith("\n")) {
    result += "\n ";
  }

  return result;
}

function syncEditorHighlight(textarea, highlightCodeEl, lineNumsEl) {
  if (!textarea) return;
  const val = textarea.value || "";

  if (highlightCodeEl) {
    highlightCodeEl.innerHTML = highlightPythonCode(val);
    highlightCodeEl.scrollTop = textarea.scrollTop;
    highlightCodeEl.scrollLeft = textarea.scrollLeft;
  }

  if (lineNumsEl) {
    const lines = val.split("\n");
    const lineCount = Math.max(1, lines.length);
    let nums = "";
    for (let i = 1; i <= lineCount; i++) {
      nums += `<div>${i}</div>`;
    }
    lineNumsEl.innerHTML = nums;
    lineNumsEl.scrollTop = textarea.scrollTop;
  }
}

function attachEditorHighlighter(textarea, highlightCodeEl, lineNumsEl) {
  if (!textarea) return;
  
  const update = () => syncEditorHighlight(textarea, highlightCodeEl, lineNumsEl);

  if (!textarea.dataset.hlAttached) {
    textarea.dataset.hlAttached = "true";

    textarea.addEventListener("keydown", function(e) {
      // 1. Enter key: Auto indentation with Python colon (:) awareness
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const val = this.value;

        // Current line text up to cursor
        const textBefore = val.substring(0, start);
        const textAfter = val.substring(end);
        const lastNewline = textBefore.lastIndexOf("\n");
        const currentLine = textBefore.substring(lastNewline + 1);

        // Leading indentation of current line
        const indentMatch = currentLine.match(/^(\s*)/);
        let indent = indentMatch ? indentMatch[1] : "";

        // Check if line ends with ':' (ignoring comments and trailing spaces)
        const cleanLine = currentLine.split("#")[0].trimEnd();
        if (cleanLine.endsWith(":")) {
          indent += "    "; // 4-space Python block indentation
        }

        const insertText = "\n" + indent;
        this.value = textBefore + insertText + textAfter;
        this.selectionStart = this.selectionEnd = start + insertText.length;
        this.dispatchEvent(new Event("input"));
        update();
        return;
      }

      // 2. Tab / Shift+Tab: Indent / Dedent 4 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const val = this.value;

        if (e.shiftKey) {
          // Shift+Tab: Dedent 4 spaces
          const textBefore = val.substring(0, start);
          const lastNewline = textBefore.lastIndexOf("\n");
          const lineStart = lastNewline + 1;
          const currentLine = val.substring(lineStart);
          
          if (currentLine.startsWith("    ")) {
            this.value = val.substring(0, lineStart) + val.substring(lineStart + 4);
            this.selectionStart = Math.max(lineStart, start - 4);
            this.selectionEnd = Math.max(lineStart, end - 4);
            this.dispatchEvent(new Event("input"));
            update();
          } else if (currentLine.startsWith(" ")) {
            const spaces = currentLine.match(/^ +/)[0].length;
            const removeCount = Math.min(spaces, 4);
            this.value = val.substring(0, lineStart) + val.substring(lineStart + removeCount);
            this.selectionStart = Math.max(lineStart, start - removeCount);
            this.selectionEnd = Math.max(lineStart, end - removeCount);
            this.dispatchEvent(new Event("input"));
            update();
          }
        } else {
          // Tab: Insert 4 spaces
          this.value = val.substring(0, start) + "    " + val.substring(end);
          this.selectionStart = this.selectionEnd = start + 4;
          this.dispatchEvent(new Event("input"));
          update();
        }
        return;
      }

      // 3. Backspace key: Unindent 4 spaces if cursor is on leading 4 spaces
      if (e.key === "Backspace") {
        const start = this.selectionStart;
        const end = this.selectionEnd;
        if (start === end && start >= 4) {
          const textBefore = this.value.substring(0, start);
          const lastNewline = textBefore.lastIndexOf("\n");
          const lineBeforeCursor = textBefore.substring(lastNewline + 1);
          if (/^\s+$/.test(lineBeforeCursor) && lineBeforeCursor.endsWith("    ")) {
            e.preventDefault();
            this.value = this.value.substring(0, start - 4) + this.value.substring(start);
            this.selectionStart = this.selectionEnd = start - 4;
            this.dispatchEvent(new Event("input"));
            update();
            return;
          }
        }
      }
    });

    textarea.addEventListener("input", update);
    textarea.addEventListener("scroll", update);
    textarea.addEventListener("focus", update);
    textarea.addEventListener("keyup", update);
  }

  // Initial sync
  update();
}

/**
 * Security Validator for Code Execution
 * Restricts importing OS-dependent, filesystem, subprocess, network, and security-compromising modules.
 * Examples blocked:
 *   - import os / import os.path / from os import ...
 *   - from pathlib import Path / import pathlib
 *   - import glob / from glob import ...
 *   - import subprocess / from subprocess import ...
 *   - import sys / from sys import ...
 *   - import shutil / from shutil import ...
 *   - __import__('os') / importlib.import_module(...)
 */
function validateCodeSecurity(code) {
  if (!code || typeof code !== 'string') {
    return { safe: true };
  }

  const restrictedModules = [
    'os', 'pathlib', 'glob', 'sys', 'subprocess', 'shutil',
    'socket', 'ctypes', 'pty', 'commands', 'platform',
    'importlib', 'tempfile', 'posix', 'nt', 'fcntl', 'msvcrt',
    'urllib', 'requests', 'http', 'ftplib', 'telnetlib', 'smtplib',
    'threading', 'multiprocessing', '_thread', 'resource',
    'stat', 'fileinput', 'mmap', 'pickle', '_pickle', 'cPickle'
  ];

  for (const mod of restrictedModules) {
    const importRegex = new RegExp(`(?:^|[\\r\\n;])\\s*import\\s+(?:[a-zA-Z0-9_\\s,]*\\b)?${mod}(?:\\.[a-zA-Z0-9_]+)?(?:\\s+as\\s+[a-zA-Z0-9_]+)?(?:\\s*,|[\\r\\n;#]|$)`, 'i');
    const fromRegex = new RegExp(`(?:^|[\\r\\n;])\\s*from\\s+${mod}(?:\\.[a-zA-Z0-9_]+)?\\s+import\\b`, 'i');
    const dynamicRegex = new RegExp(`(?:__import__|import_module)\\s*\\(\\s*['"]${mod}(?:\\.[a-zA-Z0-9_]+)?['"]`, 'i');

    if (importRegex.test(code) || fromRegex.test(code) || dynamicRegex.test(code)) {
      return {
        safe: false,
        module: mod,
        error: `Security Alert: Module '${mod}' is restricted for security reasons. OS, filesystem, process execution, and system operations are not permitted in the training editor.`
      };
    }
  }

  if (/__import__\s*\(|importlib\s*\./i.test(code)) {
    return {
      safe: false,
      module: 'dynamic_import',
      error: 'Security Alert: Dynamic module importing via __import__ or importlib is restricted.'
    };
  }

  return { safe: true };
}

if (typeof window !== 'undefined') {
  window.highlightPythonCode = highlightPythonCode;
  window.syncEditorHighlight = syncEditorHighlight;
  window.attachEditorHighlighter = attachEditorHighlighter;
  window.validateCodeSecurity = validateCodeSecurity;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { highlightPythonCode, syncEditorHighlight, attachEditorHighlighter, validateCodeSecurity };
}
