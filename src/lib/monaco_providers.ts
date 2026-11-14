import { invoke } from "@tauri-apps/api/core";

/**
 * Defines the shape of a documentation entry for a Rhai built-in function,
 * containing its signature, descriptive text, and auto-completion snippets
 * for use in the Monaco editor.
 */
export interface BuiltinDoc {
  signature: string;
  detail: string;
  insertText: string;
  description: string;
  docs_url?: string;
}

/**
 * A curated, fallback dictionary of global Rhai functions available within the ChaosWrench engine.
 * Used for Monaco autocompletion when live engine schema sync fails or is unavailable.
 */
export const rhaiBuiltins: Record<string, BuiltinDoc> = {
  assert: {
    signature: "assert(condition: bool, msg: &str)",
    detail: "Assert that a condition is true",
    insertText: 'assert(${1:condition}, "${2:assertion failed}");',
    description:
      "Halts script execution and throws an error with the specified message if `condition` is false.",
  },
  create_event: {
    signature: "create_event(name: &str)",
    detail: "Create a new global event channel",
    insertText: 'create_event("${1:event_name}");',
    description:
      "Registers a new event channel in the central event system. Other plugins can hook onto this event to handle published payloads.",
  },
  hook_event: {
    signature: "hook_event(plugin_name: &str, event_name: &str, callback: &str)",
    detail: "Subscribe to a global event channel",
    insertText: 'hook_event(PLUGIN_NAME, "${1:event_name}", "${2:callback_function}");',
    description:
      "Subscribes to an event channel. When `fire_event` triggers on this channel, the specified callback function is called with the event data.",
  },
  fire_event: {
    signature: "fire_event(event_name: &str, data: Dynamic)",
    detail: "Publish an event payload to subscribed listeners",
    insertText: 'fire_event("${1:event_name}", ${2:payload_data});',
    description:
      "Fires an event with the specified payload map/array/value. All subscribed plugins will receive the event asynchronously.",
  },
  set_global: {
    signature: "set_global(key: &str, value: Dynamic)",
    detail: "Store a value in global in-memory state",
    insertText: 'set_global("${1:key}", ${2:value});',
    description:
      "Stores a variable inside the central, thread-safe in-memory state accessible across all active plugins.",
  },
  get_global: {
    signature: "get_global(key: &str) -> Dynamic",
    detail: "Retrieve a value from global in-memory state",
    insertText: 'get_global("${1:key}")',
    description:
      "Retrieves a previously stored global value. Returns `()` if the key does not exist.",
  },
  log_info: {
    signature: "log_info(plugin_name: &str, msg: &str)",
    detail: "Log an informational message",
    insertText: 'log_info(PLUGIN_NAME, "${1:message}");',
    description:
      "Logs a standard info-level entry in the unified log manager. Appears in the live status stream.",
  },
  log_debug: {
    signature: "log_debug(plugin_name: &str, msg: &str)",
    detail: "Log a debug-level developer message",
    insertText: 'log_debug(PLUGIN_NAME, "${1:message}");',
    description: "Logs a developer debug message, visible when verbose logging is enabled.",
  },
  log_error: {
    signature: "log_error(plugin_name: &str, msg: &str)",
    detail: "Log an error message",
    insertText: 'log_error(PLUGIN_NAME, "${1:message}");',
    description:
      "Logs an error event. Triggers indicators in the ChaosForge log and status dashboards.",
  },
  mcp_log: {
    signature: "mcp_log(plugin_name: &str, level: &str, msg: &str)",
    detail: "Write a formatted log to the MCP host",
    insertText: 'mcp_log(PLUGIN_NAME, "${1:info}", "${2:message}");',
    description:
      'Sends a diagnostic log entry to the active MCP client. `level` can be "info", "debug", "warning", or "error".',
  },
  translate: {
    signature:
      "translate(plugin_name: &str, phrase_key: &str, locale: &str, args: Array) -> String",
    detail: "Translate a localized key phrase",
    insertText: 'translate(PLUGIN_NAME, "${1:key}", "${2:en_US}", [${3:args}]);',
    description:
      "Translates a phrase using translation catalogs stored in the plugin subdirectory, interpolating arguments.",
  },
  sleep: {
    signature: "sleep(ms: i64)",
    detail: "Suspend execution for milliseconds",
    insertText: "sleep(${1:1000});",
    description:
      "Suspends the active script execution for the specified milliseconds. Completely thread-safe.",
  },
  create_timer: {
    signature:
      "create_timer(plugin_name: &str, ms: i64, repeat: bool, callback: &str, payload: Dynamic)",
    detail: "Create a background timer",
    insertText:
      'create_timer(PLUGIN_NAME, ${1:5000}, ${2:false}, "${3:timer_callback}", ${4:#{}});',
    description:
      "Spawns an asynchronous timer running in the background. Triggers `callback(payload)` after expiration.",
  },
  get_env: {
    signature: "get_env(key: &str) -> String",
    detail: "Get the value of an OS environment variable",
    insertText: 'get_env("${1:VAR_NAME}")',
    description:
      "Retrieves an environment variable from the host operating system. Returns an empty string if not found.",
  },
  register_cvar: {
    signature: "register_cvar(plugin_name: &str, name: &str, default_val: &str, desc: &str)",
    detail: "Register a configurable console variable",
    insertText: 'register_cvar(PLUGIN_NAME, "${1:cvar_name}", "${2:default}", "${3:description}");',
    description:
      "Registers a console variable that can be customized dynamically by the user or client system.",
  },
  get_cvar: {
    signature: "get_cvar(name: &str) -> String",
    detail: "Get active cvar value",
    insertText: 'get_cvar("${1:cvar_name}")',
    description: "Retrieves the current string value of a registered console variable.",
  },
  register_native: {
    signature: "register_native(plugin_name: &str, native_name: &str, target_func: &str)",
    detail: "Expose a Rhai function to the native engine",
    insertText: 'register_native(PLUGIN_NAME, "${1:api_name}", "${2:rhai_fn_name}");',
    description:
      "Exposes a Rhai function to the core Rust engine, allowing direct callbacks from other native contexts.",
  },
  call_native: {
    signature: "call_native(native_name: &str, args: Array) -> Dynamic",
    detail: "Invoke an exposed native Rust API function",
    insertText: 'call_native("${1:native_name}", [${2:args}]);',
    description:
      "Invokes a native Rust capability registered in the ChaosWrench backend. Type checked.",
  },
  regex_match: {
    signature: "regex_match(pattern: &str, text: &str) -> Array",
    detail: "Find regular expression matches",
    insertText: 'regex_match("${1:pattern}", ${2:text})',
    description:
      "Matches a string against a regex pattern. Returns an array of matched substrings and capture groups.",
  },
  regex_replace: {
    signature: "regex_replace(pattern: &str, text: &str, rep: &str) -> String",
    detail: "Replace patterns with regex",
    insertText: 'regex_replace("${1:pattern}", ${2:text}, "${3:replacement}")',
    description: "Replaces all occurrences matching a regex pattern with a replacement string.",
  },
  system_time: {
    signature: "system_time(timezone: &str) -> String",
    detail: "Retrieve formatted local system time",
    insertText: 'system_time("${1:local}")',
    description:
      'Retrieves the current date and time formatted in the specified timezone (e.g. "UTC" or "local").',
  },
  ntp_request: {
    signature: "ntp_request(server: &str, port: i64) -> String",
    detail: "Fetch internet time from an NTP server",
    insertText: 'ntp_request("${1:pool.ntp.org}", ${2:123})',
    description:
      "Queries an NTP server to get standard time sync. Returns formatted date time string.",
  },
  base64_encode: {
    signature: "base64_encode(text: &str) -> String",
    detail: "Encode string to base64",
    insertText: "base64_encode(${1:text})",
    description: "Encodes raw text into standard base64 format.",
  },
  base64_decode: {
    signature: "base64_decode(text: &str) -> String",
    detail: "Decode string from base64",
    insertText: "base64_decode(${1:text})",
    description: "Decodes a base64 encoded string back into standard human-readable text.",
  },
  md5: {
    signature: "md5(text: &str) -> String",
    detail: "Compute MD5 hash",
    insertText: "md5(${1:text})",
    description: "Computes and returns the 32-character hexadecimal MD5 hash of the string.",
  },
  sha256: {
    signature: "sha256(text: &str) -> String",
    detail: "Compute SHA-256 hash",
    insertText: "sha256(${1:text})",
    description:
      "Computes and returns the 64-character hexadecimal SHA-256 cryptographic hash of the string.",
  },
  hmac_sha256: {
    signature: "hmac_sha256(key: &str, text: &str) -> String",
    detail: "Compute HMAC SHA-256 signature",
    insertText: 'hmac_sha256("${1:secret_key}", ${2:text})',
    description:
      "Generates an HMAC SHA-256 signature of a string using a secret key. Returns a hex string.",
  },
  db_connect: {
    signature: "db_connect(plugin_name: &str, id: &str, url: &str)",
    detail: "Initialize database connection pool",
    insertText: 'db_connect(PLUGIN_NAME, "${1:db_id}", "${2:sqlite://local.db}");',
    description:
      "Establishes a connection pool (e.g. SQLite, PostgreSQL, MySQL) and binds it to a local identifier string.",
  },
  db_execute: {
    signature: "db_execute(id: &str, sql: &str, params: Array) -> i64",
    detail: "Execute modifying SQL command",
    insertText: 'db_execute("${1:db_id}", "${2:INSERT INTO ...}", [${3:params}]);',
    description:
      "Executes an INSERT, UPDATE, or DELETE SQL statement with bindings. Returns the number of affected rows.",
  },
  db_query: {
    signature: "db_query(id: &str, sql: &str, params: Array) -> Array",
    detail: "Execute SQL SELECT query",
    insertText: 'db_query("${1:db_id}", "${2:SELECT * FROM ...}", [${3:params}]);',
    description:
      "Queries database and returns an array of maps, where each map represents a row keyed by column name.",
  },
  fs_read: {
    signature: "fs_read(plugin_name: &str, relative_path: &str) -> String",
    detail: "Read file contents from plugin workspace",
    insertText: 'fs_read(PLUGIN_NAME, "${1:filename.txt}")',
    description:
      "Reads a text file as a string. Path must be relative and is strictly sandboxed inside the active plugin directory.",
  },
  fs_write: {
    signature: "fs_write(plugin_name: &str, relative_path: &str, content: &str)",
    detail: "Write file contents to plugin workspace",
    insertText: 'fs_write(PLUGIN_NAME, "${1:filename.txt}", ${2:content});',
    description:
      "Creates/overwrites a text file in the plugin directory. Automatically builds folders if needed. Sandboxed.",
  },
  fs_append: {
    signature: "fs_append(plugin_name: &str, relative_path: &str, content: &str)",
    detail: "Append text to file in plugin workspace",
    insertText: 'fs_append(PLUGIN_NAME, "${1:filename.txt}", ${2:content});',
    description:
      "Appends data to an existing file. Automatically builds directories and files if missing. Sandboxed.",
  },
  fs_delete: {
    signature: "fs_delete(plugin_name: &str, relative_path: &str)",
    detail: "Delete file inside plugin workspace",
    insertText: 'fs_delete(PLUGIN_NAME, "${1:filename.txt}");',
    description:
      "Removes a file inside the plugin directory. Throws an error if path goes outside sandboxed range.",
  },
  fs_exists: {
    signature: "fs_exists(plugin_name: &str, relative_path: &str) -> bool",
    detail: "Check if file exists in plugin",
    insertText: 'fs_exists(PLUGIN_NAME, "${1:filename.txt}")',
    description: "Checks for the existence of a file or directory inside the plugin scope.",
  },
  fs_list_dir: {
    signature: "fs_list_dir(plugin_name: &str, relative_path: &str) -> Array",
    detail: "List files inside subdirectory",
    insertText: 'fs_list_dir(PLUGIN_NAME, "${1:.}")',
    description:
      "Lists all filenames inside a subdirectory of the active plugin. Returns an array of strings.",
  },
  load_config: {
    signature: "load_config(plugin_name: &str, relative_path: &str) -> Dynamic",
    detail: "Load and parse TOML configuration",
    insertText: 'load_config(PLUGIN_NAME, "${1:config.toml}")',
    description:
      "Reads and parses a local TOML file, converting its parameters into a fully structured, queryable Rhai map.",
  },
  load_config_string: {
    signature: "load_config_string(path: &str) -> String",
    detail: "Read any text file globally by absolute path",
    insertText: 'load_config_string("${1:/absolute/path/to/config}");',
    description:
      "Reads a text configuration file from an absolute path outside the sandbox directory.",
  },
  ws_connect: {
    signature: "ws_connect(plugin_name: &str, url: &str, callback: &str)",
    detail: "Establish live WebSocket stream",
    insertText: 'ws_connect(PLUGIN_NAME, "${1:ws://localhost:8080}", "${2:on_message_callback}");',
    description:
      "Initiates a real-time WebSocket client thread. Received text payloads will be passed to `callback(payload)` function.",
  },
  ws_close: {
    signature: "ws_close(url: &str)",
    detail: "Disconnect active WebSocket connection",
    insertText: 'ws_close("${1:ws://localhost:8080}");',
    description: "Closes any active WebSocket connection registered under the specified URL.",
  },
  route_webhook: {
    signature: "route_webhook(plugin_name: &str, port: i64, path: &str, callback: &str)",
    detail: "Route HTTP requests on active webhook server",
    insertText: 'route_webhook(PLUGIN_NAME, ${1:8080}, "${2:/api/event}", "${3:on_webhook}");',
    description:
      "Declares an HTTP routing endpoint. When port receives a request matching `path`, triggers `callback(request_map)` where map contains `method`, `path`, and `body`.",
  },
  start_webhook_server: {
    signature: "start_webhook_server(plugin_name: &str, port: i64)",
    detail: "Launch background HTTP webhook listener",
    insertText: "start_webhook_server(PLUGIN_NAME, ${1:8080});",
    description:
      "Launches a high-performance background Axum HTTP server on `port` to listen for webhook routes.",
  },
  json_extract: {
    signature: "json_extract(json_str: &str, pointer: &str) -> String",
    detail: "Extract sub-element using JSON pointer",
    insertText: 'json_extract(${1:json_string}, "${2:/target/field}")',
    description:
      "Extracts and parses a single nested property from a JSON string using standard JSON pointer paths.",
  },
  from_json: {
    signature: "from_json(json_str: &str) -> Dynamic",
    detail: "Convert JSON string to Rhai map/array",
    insertText: "from_json(${1:json_string})",
    description:
      "Parses a complete JSON string directly into corresponding native Rhai variables, maps, and arrays.",
  },
  register_mcp_tool: {
    signature:
      "register_mcp_tool(plugin_name: &str, tool_name: &str, desc: &str, schema_json: &str)",
    detail: "Expose tool to global MCP Client",
    insertText:
      'register_mcp_tool(PLUGIN_NAME, "${1:tool_name}", "${2:description}", ${3:json_schema});',
    description:
      "Dynamically registers an agentic tool with the host MCP Server. This tool immediately becomes available for AI invocation.",
  },
  register_mcp_resource: {
    signature:
      "register_mcp_resource(plugin_name: &str, resource_name: &str, uri: &str, desc: &str)",
    detail: "Expose resources to global MCP Client",
    insertText:
      'register_mcp_resource(PLUGIN_NAME, "${1:resource_name}", "${2:chaos://data}", "${3:description}");',
    description: "Exposes static or dynamic text/binary resources to connected AI agents.",
  },
  register_mcp_prompt: {
    signature:
      "register_mcp_prompt(plugin_name: &str, prompt_name: &str, desc: &str, args_json: &str)",
    detail: "Expose reusable LLM prompts",
    insertText:
      'register_mcp_prompt(PLUGIN_NAME, "${1:prompt_name}", "${2:description}", ${3:args_json_array});',
    description: "Exposes prompt templates to connected AI agents.",
  },
  sys_os: {
    signature: "sys_os() -> String",
    detail: "Retrieve host Operating System name",
    insertText: "sys_os()",
    description: 'Returns the OS compilation name of the host (e.g. "linux", "macos", "windows").',
  },
  run_command: {
    signature: "run_command(shell: &str, command: &str) -> String",
    detail: "Execute shell commands on host",
    insertText: 'run_command("${1:sh}", "${2:echo hello}");',
    description:
      "Runs a shell script command. Captures and returns standard stdout. Raises an exception if stderr or exit fails.",
  },
  chaoswrench_search_plugins: {
    signature: "chaoswrench_search_plugins(query: &str) -> String",
    detail: "Search for available plugins",
    insertText: 'chaoswrench_search_plugins("${1:plugin_name}")',
    description: "Queries the plugin registry for a specific plugin name.",
  },
  chaoswrench_install_plugin: {
    signature: "chaoswrench_install_plugin(target_plugin_name: &str) -> String",
    detail: "Install a plugin from the registry",
    insertText: 'chaoswrench_install_plugin("${1:plugin_name}")',
    description: "Fetches and safely parks a new plugin into the pending directory requiring UI approval.",
  },
  chaoswrench_check_dependency: {
    signature: "chaoswrench_check_dependency(plugin_name: &str) -> String",
    detail: "Check if a plugin dependency is satisfied",
    insertText: 'chaoswrench_check_dependency("${1:plugin_name}")',
    description: "Validates that a required plugin dependency exists and is currently active.",
  },
  http_get: {
    signature: "http_get(url: &str) -> String",
    detail: "Perform synchronous HTTP GET request",
    insertText: 'http_get("${1:https://api.example.com/data}")',
    description:
      "Performs a standard HTTP GET request and returns the response body as a string. Sets the user agent to `ChaosWrench/1.0`.",
  },
  http_post: {
    signature: "http_post(url: &str, body: &str) -> String",
    detail: "Perform HTTP POST request with payload",
    insertText: 'http_post("${1:https://api.example.com/data}", ${2:body_string})',
    description:
      "Performs an HTTP POST request with a custom string payload. Returns the server response body.",
  },
  tcp_request: {
    signature: "tcp_request(address: &str, data: &str) -> String",
    detail: "Perform standard raw TCP query",
    insertText: 'tcp_request("${1:127.0.0.1:8080}", ${2:raw_data})',
    description:
      "Establishes a raw TCP stream, writes input data, reads the socket response (up to 4KB), and returns it.",
  },
  kv_get: {
    signature: "kv_get(key: &str) -> Dynamic",
    detail: "Retrieve value from central SQLite-backed Key-Value store",
    insertText: 'kv_get("${1:key}")',
    description:
      "Retrieves a value associated with key from the core SQLite KV database. Returns `()` if key is not found.",
  },
  kv_set: {
    signature: "kv_set(key: &str, value: &str)",
    detail: "Set key value inside central SQLite Key-Value store",
    insertText: 'kv_set("${1:key}", "${2:value}");',
    description: "Overwrites or creates a key-value entry inside the core SQLite KV database.",
  },
  kv_dump: {
    signature: "kv_dump() -> String",
    detail: "Dump all keys from KV store",
    insertText: "kv_dump()",
    description: "Dumps all stored keys and values as a structured JSON string.",
  },
};

let isRegistered = false;

/**
 * Renders a docs URL as a markdown link for Monaco hover/completion panels.
 * Accepts either a bare URL (from the engine schema) or a pre-formatted
 * markdown link (legacy curated entries), returning a clickable link.
 */
function formatDocsLink(docsUrl: string): string {
  const trimmed = docsUrl.trim();
  if (trimmed.startsWith("[")) return trimmed; // already a markdown link
  return `[View documentation](${trimmed})`;
}

/**
 * Loads the SSOT engine schema and converts its `modules[]` contract into a
 * flat map of builtin docs. Returns an empty map if no schema is available.
 *
 * The engine is the authoritative source for signatures, parameters, and docs
 * links. When the persisted schema is empty (fresh install / not yet
 * generated), this attempts a one-shot `sync_engine_schema` so dev sessions
 * self-populate without a manual step.
 */
async function loadSchemaBuiltins(): Promise<Record<string, BuiltinDoc>> {
  const parseModules = (schemaStr: string): Record<string, BuiltinDoc> => {
    const result: Record<string, BuiltinDoc> = {};
    const schema = JSON.parse(schemaStr);
    if (!schema.modules) return result;

    for (const [, mod] of Object.entries<any>(schema.modules)) {
      if (!mod.functions || !Array.isArray(mod.functions)) continue;
      for (const fn of mod.functions) {
        if (!fn.name || fn.name.startsWith("_")) continue;

        const signature = fn.signature || `${fn.name}(...)`;
        let insertText = `${fn.name}(...)`;
        if (fn.parameters && Array.isArray(fn.parameters)) {
          const params = fn.parameters.map((p: any, i: number) => `\${${i + 1}:${p.name}}`);
          insertText = `${fn.name}(${params.join(", ")})`;
        }

        result[fn.name] = {
          signature,
          detail: "Engine API",
          insertText,
          description: fn.description || "",
          docs_url: fn.docs_url,
        };
      }
    }
    return result;
  };

  try {
    let schemaStr = await invoke<string>("load_engine_schema");
    let builtins = parseModules(schemaStr);

    // Self-heal: if nothing came back, ask the engine to (re)generate once.
    if (Object.keys(builtins).length === 0) {
      try {
        schemaStr = await invoke<string>("sync_engine_schema");
        builtins = parseModules(schemaStr);
      } catch (syncErr) {
        // Non-fatal: a missing binary just means we keep the curated builtins.
        console.warn("[registerRhaiLanguageFeatures] Engine sync unavailable", syncErr);
      }
    }
    return builtins;
  } catch (err) {
    console.error("[registerRhaiLanguageFeatures] Failed to load engine schema", err);
    return {};
  }
}

/**
 * Merges curated builtin docs with the engine-derived schema.
 *
 * The schema (SSOT) is authoritative for `signature` and `docs_url`. Curated
 * entries supply higher-quality hand-written `description`, `detail`, and
 * snippet `insertText` where available, and remain the sole source for Rhai
 * language constructs the engine does not emit.
 */
function mergeBuiltins(
  curated: Record<string, BuiltinDoc>,
  schema: Record<string, BuiltinDoc>
): Record<string, BuiltinDoc> {
  const merged: Record<string, BuiltinDoc> = { ...curated };

  for (const [name, schemaDoc] of Object.entries(schema)) {
    const curatedDoc = merged[name];
    if (!curatedDoc) {
      merged[name] = schemaDoc;
      continue;
    }
    // Prefer the engine signature/docs link; keep curated UX text.
    merged[name] = {
      ...curatedDoc,
      signature: schemaDoc.signature || curatedDoc.signature,
      docs_url: schemaDoc.docs_url || curatedDoc.docs_url,
    };
  }

  return merged;
}

/**
 * Bootstraps the Monaco Editor with rich language features for Rhai scripts.
 * It fetches the live schema from the ChaosWrench backend and registers
 * custom completion and hover providers.
 *
 * @param monaco - The initialized Monaco editor instance.
 */
export async function registerRhaiLanguageFeatures(monaco: any) {
  if (isRegistered) return;
  isRegistered = true;

  const schemaBuiltins = await loadSchemaBuiltins();
  const allBuiltins = mergeBuiltins(rhaiBuiltins, schemaBuiltins);

  // 1. Completion Items Provider
  monaco.languages.registerCompletionItemProvider("rhai", {
    provideCompletionItems: (model: any, position: any) => {
      // Get word at cursor
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Filter to see if we are in comments
      if (textUntilPosition.trim().startsWith("//") || textUntilPosition.trim().startsWith("/*")) {
        return { suggestions: [] };
      }

      const suggestions = Object.entries(allBuiltins).map(([key, doc]) => {
        let mdValue = `**${doc.signature}**\n\n${doc.description}`;
        if (doc.docs_url) {
          mdValue += `\n\n**Docs:** ${formatDocsLink(doc.docs_url)}`;
        }
        return {
          label: key,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: doc.detail,
          documentation: {
            value: mdValue,
          },
          insertText: doc.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: undefined,
        };
      });

      // Add standard Rhai keywords as helper items
      const keywords = [
        "fn",
        "let",
        "const",
        "if",
        "else",
        "for",
        "while",
        "loop",
        "return",
        "break",
        "continue",
        "try",
        "catch",
        "throw",
        "print",
        "type_of",
        "import",
        "as",
        "true",
        "false",
      ];

      keywords.forEach((kw) => {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: "Rhai keyword",
          documentation: { value: `Built-in Rhai control flow keyword: \`${kw}\`.` },
          insertText: kw,
          insertTextRules: 0,
          range: undefined,
        });
      });

      // Add structural templates as Snippet type completions
      const snippets = [
        {
          label: "register_tool_block",
          detail: "Snippet: Complete MCP Tool Registration block with JSON Schema",
          documentation:
            "Registers a tool with description and JSON Schema properties, ready for AI agent calls.",
          insertText:
            'register_mcp_tool(\n  PLUGIN_NAME,\n  "${1:tool_name}",\n  "${2:tool_description}",\n  "{\\"type\\": \\"object\\", \\"properties\\": {\\"${3:param_name}\\\": {\\"type\\": \\"string\\", \\"description\\": \\"${4:param_description}\\"}}, \\"required\\": [\\"${3:param_name}\\"]}"\n);',
        },
        {
          label: "try_catch_block",
          detail: "Snippet: Try / Catch exception handling block",
          documentation: "Catches runtime exceptions and logs them safely to the plugin logger.",
          insertText:
            'try {\n  ${1:// protected script operations}\n} catch (err) {\n  log_error(PLUGIN_NAME, "Execution failed: " + err);\n  ${2:// fallback handler}\n}',
        },
        {
          label: "http_get_json_block",
          detail: "Snippet: HTTP GET and JSON parsing template",
          documentation:
            "Performs a synchronous HTTP GET, parses the response as JSON, and maps to a dynamic variable.",
          insertText:
            'let response = http_get("${1:https://api.github.com}");\nlet payload = from_json(response);\n${2:// process dynamic payload}',
        },
        {
          label: "db_query_loop_block",
          detail: "Snippet: Database query and row iteration template",
          documentation:
            "Executes a database query with parameter bindings and iterates over each row.",
          insertText:
            'let rows = db_query("${1:db_id}", "${2:SELECT * FROM users WHERE active = ?}", [${3:true}]);\nfor row in rows {\n  let ${4:username} = row.get("${5:username}");\n  ${6:// process username}\n}',
        },
      ];

      snippets.forEach((snip) => {
        suggestions.push({
          label: snip.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snip.detail,
          documentation: { value: snip.documentation },
          insertText: snip.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: undefined,
        });
      });

      return { suggestions };
    },
  });

  // 2. Hover Provider
  monaco.languages.registerHoverProvider("rhai", {
    provideHover: (model: any, position: any) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const key = word.word;
      if (allBuiltins[key]) {
        const doc = allBuiltins[key];
        const contents = [
          { value: `\`\`\`rhai\n${doc.signature}\n\`\`\`` },
          { value: doc.description },
        ];
        if (doc.docs_url) {
          contents.push({ value: `**Docs:** ${formatDocsLink(doc.docs_url)}` });
        }
        return {
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          ),
          contents,
        };
      }
      return null;
    },
  });
}
