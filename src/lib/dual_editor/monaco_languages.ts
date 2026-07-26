/**
 * chaosnexus-forge/src/lib/dual_editor/monaco_languages.ts
 *
 * Monaco language helpers: per-file language ids and the custom Monarch grammars
 * the trimmed editor build needs. Because `loadMonaco()` drops the css/html/
 * json/typescript language services (and their workers) and the `rust` built-in
 * stand-in, the workbench languages have no built-in grammar here. We register
 * dedicated Monarch tokenizers for Rhai, TOML, and JSON; `markdown` is the only
 * whitelisted built-in grammar (loaded in the loader).
 */

import type { MonacoModule } from "$lib/dual_editor/monaco_loader";

/** Monaco language id used for Rhai plugin scripts. */
export const RHAI_LANGUAGE_ID = "rhai";

let languagesRegistered = false;

/** Maps a workbench filename to the Monaco model language id. */
export function languageForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  // ChaosNexus Forge authors Rhai plugins; `.rs` is not a first-class file type here,
  // but if one appears it shares enough syntax to reuse the Rhai grammar.
  if (lower.endsWith(".rhai") || lower.endsWith(".rs")) return RHAI_LANGUAGE_ID;
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".json")) return "json";
  return "plaintext";
}

/**
 * Registers custom Monarch languages once. The trimmed Monaco build ships only
 * the `markdown` grammar, so we add Rhai, TOML, and JSON tokenizers here.
 */
export function registerMonacoLanguages(monaco: MonacoModule): void {
  if (languagesRegistered) return;
  languagesRegistered = true;

  registerRhaiLanguage(monaco);
  registerTomlLanguage(monaco);
  registerJsonLanguage(monaco);
}

/**
 * Registers the Rhai language: a dedicated Monarch grammar plus editor language
 * configuration (comment toggling, bracket matching, auto-closing pairs). Rhai
 * is Rust-shaped but has its own surface: `#{ ... }` object maps, backtick
 * interpolated strings (`` `x ${y}` ``), and Rhai-specific keywords (`switch`,
 * `private`, `loop`, `throw`, ...). This replaces the former `rust` stand-in so
 * highlighting is accurate without bundling any built-in grammar.
 */
function registerRhaiLanguage(monaco: MonacoModule): void {
  monaco.languages.register({
    id: RHAI_LANGUAGE_ID,
    extensions: [".rhai"],
    aliases: ["Rhai", "rhai"],
  });

  monaco.languages.setLanguageConfiguration(RHAI_LANGUAGE_ID, {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "`", close: "`", notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "`", close: "`" },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern: /^.*\{[^}"'`]*$/,
      decreaseIndentPattern: /^\s*\}.*$/,
    },
  });

  monaco.languages.setMonarchTokensProvider(RHAI_LANGUAGE_ID, {
    defaultToken: "",
    tokenPostfix: ".rhai",

    keywords: [
      "fn", "private", "let", "const", "global", "import", "export", "as",
      "if", "else", "switch", "do", "while", "loop", "until", "for", "in",
      "continue", "break", "return", "throw", "try", "catch",
      "this", "Fn", "call", "curry", "is_def_fn", "is_def_var", "is_shared",
      "type_of", "print", "debug", "eval",
    ],

    typeKeywords: [
      "int", "float", "bool", "char", "string", "array", "map",
      "timestamp", "range", "Dynamic", "INT", "FLOAT",
    ],

    constants: ["true", "false"],

    operators: [
      "=", ">", "<", "!", "?", ":", "==", "<=", ">=", "!=", "&&", "||",
      "+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>",
      "+=", "-=", "*=", "/=", "%=", "**=", "&=", "|=", "^=", "<<=", ">>=",
      "..", "..=", "?.", "??", "??=", "=>",
    ],

    symbols: /[=><!~?:&|+\-*/^%.]+/,
    escapes: /\\(?:[abfnrtv\\"'`0]|x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]+\})/,
    digits: /\d+(_+\d+)*/,

    brackets: [
      { open: "{", close: "}", token: "delimiter.curly" },
      { open: "[", close: "]", token: "delimiter.square" },
      { open: "(", close: ")", token: "delimiter.parenthesis" },
    ],

    tokenizer: {
      root: [
        // Function definition: highlight the declared name.
        [/(\bfn\b)(\s+)([a-zA-Z_]\w*)/, ["keyword", "white", "entity.name.function"]],

        // Object-map marker `#` in `#{ ... }` (the brace is a normal bracket).
        [/#(?=\{)/, "type"],

        // Identifiers, keywords, types, and constants.
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@constants": "constant",
            "@default": "identifier",
          },
        }],

        { include: "@whitespace" },

        [/[{}()[\]]/, "@brackets"],
        [/[;,.]/, "delimiter"],

        // Numbers (hex / octal / binary / float / int) with `_` separators.
        [/0[xX][0-9a-fA-F](_?[0-9a-fA-F])*/, "number.hex"],
        [/0[oO][0-7](_?[0-7])*/, "number.octal"],
        [/0[bB][01](_?[01])*/, "number.binary"],
        [/(@digits)\.(@digits)([eE][-+]?(@digits))?/, "number.float"],
        [/(@digits)[eE][-+]?(@digits)/, "number.float"],
        [/(@digits)/, "number"],

        [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],

        [/"/, { token: "string.quote", next: "@stringDouble" }],
        [/`/, { token: "string.quote", next: "@stringBacktick" }],
        [/'/, { token: "string.quote", next: "@stringChar" }],
      ],

      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, { token: "comment", next: "@blockComment" }],
      ],

      // Rhai block comments nest, mirroring Rust.
      blockComment: [
        [/[^/*]+/, "comment"],
        [/\/\*/, { token: "comment", next: "@push" }],
        [/\*\//, { token: "comment", next: "@pop" }],
        [/[/*]/, "comment"],
      ],

      stringDouble: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, { token: "string.quote", next: "@pop" }],
      ],

      // Backtick (template) strings support `${ ... }` interpolation.
      stringBacktick: [
        [/\$\{/, { token: "delimiter.bracket", next: "@interp" }],
        [/[^\\`$]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/\$/, "string"],
        [/`/, { token: "string.quote", next: "@pop" }],
      ],

      interp: [
        [/\}/, { token: "delimiter.bracket", next: "@pop" }],
        { include: "@root" },
      ],

      stringChar: [
        [/[^\\']+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/'/, { token: "string.quote", next: "@pop" }],
      ],
    },
  });
}

/** Registers the TOML Monarch grammar (Monaco has no built-in TOML support). */
function registerTomlLanguage(monaco: MonacoModule): void {
  monaco.languages.register({ id: "toml" });

  monaco.languages.setMonarchTokensProvider("toml", {
    defaultToken: "",
    tokenPostfix: ".toml",

    brackets: [
      { open: "{", close: "}", token: "delimiter.curly" },
      { open: "[", close: "]", token: "delimiter.square" },
    ],

    keywords: ["true", "false"],

    tokenizer: {
      root: [
        { include: "@whitespace" },
        // Table headers: [section] or [[array-of-tables]]
        [/^\s*\[\[/, { token: "delimiter.square", next: "@tableHeader" }],
        [/^\s*\[/, { token: "delimiter.square", next: "@tableHeader" }],
        // Keys before '=' or dotted keys
        [/([A-Za-z0-9_.-]+)(\s*)(=)/, ["key", "", "delimiter"]],
        { include: "@value" },
      ],

      tableHeader: [
        [/[^\]]+/, "type"],
        [/\]\]/, { token: "delimiter.square", next: "@pop" }],
        [/\]/, { token: "delimiter.square", next: "@pop" }],
      ],

      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/#.*$/, "comment"],
      ],

      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string", next: "@pop" }],
      ],

      stringSingle: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'/, { token: "string", next: "@pop" }],
      ],

      value: [
        { include: "@whitespace" },
        [/"/, { token: "string", next: "@string" }],
        [/'/, { token: "string", next: "@stringSingle" }],
        [/\btrue\b|\bfalse\b/, "keyword"],
        [/-?\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/, "number"],
        [/\{\{/, { token: "delimiter.curly", next: "@inlineTable" }],
        [/\[/, { token: "delimiter.square", next: "@array" }],
        [/./, "string"],
      ],

      inlineTable: [
        { include: "@whitespace" },
        [/}/, { token: "delimiter.curly", next: "@pop" }],
        [/([A-Za-z0-9_.-]+)(\s*)(=)/, ["key", "", "delimiter"]],
        [/,/, "delimiter"],
        { include: "@value" },
      ],

      array: [
        { include: "@whitespace" },
        [/\]/, { token: "delimiter.square", next: "@pop" }],
        [/,/, "delimiter"],
        { include: "@value" },
      ],
    },
  });
}

/**
 * Registers a minimal JSON Monarch grammar. The full JSON language service
 * (which provides schema validation via json.worker) is intentionally excluded
 * from the trimmed build, so this gives highlighting without any worker cost.
 * Property names are tokenised as `type` to visually distinguish keys.
 */
function registerJsonLanguage(monaco: MonacoModule): void {
  monaco.languages.register({ id: "json" });

  monaco.languages.setMonarchTokensProvider("json", {
    defaultToken: "",
    tokenPostfix: ".json",

    keywords: ["true", "false", "null"],

    // eslint-disable-next-line no-useless-escape
    escapes: /\\(?:[btnfr"'\\/]|u[0-9A-Fa-f]{4})/,

    tokenizer: {
      root: [
        { include: "@whitespace" },
        // Property name: a string immediately followed by a colon.
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "type"],
        [/"/, { token: "string", next: "@string" }],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
        [/\b(?:true|false|null)\b/, "keyword"],
        [/[{}\[\]]/, "@brackets"],
        [/[,:]/, "delimiter"],
      ],

      whitespace: [
        [/[ \t\r\n]+/, "white"],
      ],

      string: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, { token: "string", next: "@pop" }],
      ],
    },
  });
}
