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
  }

  if (lineNumsEl) {
    const lineCount = Math.max(1, val.split("\n").length);
    let nums = "";
    for (let i = 1; i <= lineCount; i++) {
      nums += i + "<br>";
    }
    lineNumsEl.innerHTML = nums;
  }

  const highlightLayer = textarea.parentElement ? textarea.parentElement.querySelector(".code-highlight-layer") : null;
  if (highlightLayer) {
    highlightLayer.scrollTop = textarea.scrollTop;
    highlightLayer.scrollLeft = textarea.scrollLeft;
  }
  if (lineNumsEl) {
    lineNumsEl.scrollTop = textarea.scrollTop;
  }
}

function attachEditorHighlighter(textarea, highlightCodeEl, lineNumsEl) {
  if (!textarea) return;
  
  const update = () => syncEditorHighlight(textarea, highlightCodeEl, lineNumsEl);

  if (!textarea.dataset.hlAttached) {
    textarea.dataset.hlAttached = "true";

    textarea.addEventListener("keydown", function(e) {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 4;
        update();
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

window.highlightPythonCode = highlightPythonCode;
window.syncEditorHighlight = syncEditorHighlight;
window.attachEditorHighlighter = attachEditorHighlighter;
