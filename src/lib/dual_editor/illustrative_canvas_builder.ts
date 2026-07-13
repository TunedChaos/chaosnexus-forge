// chaosnexus-forge/src/lib/dual_editor/illustrative_canvas_builder.ts
//
// Builds fully-wired, display-only v3 canvas sidecars that illustrate bundled
// sample plugin logic for the ChaosNexus Forge visual editor. Rhai remains runtime SSOT.

import {
  CANVAS_SCHEMA_VERSION,
  type CanvasDocumentV3,
  type CanvasEdgeRecord,
  type CanvasNodeRecord,
  type CanvasPinDescriptor,
} from "./canvas_schema";
import { col, finalizeLayout, row } from "./illustrative_layout";

type N = CanvasNodeRecord;
type E = CanvasEdgeRecord;

let nodeSeq = 0;
let edgeSeq = 0;

function resetIds(): void {
  nodeSeq = 0;
  edgeSeq = 0;
}

function nid(prefix: string): string {
  nodeSeq += 1;
  return `${prefix}_${nodeSeq}`;
}

function eid(): string {
  edgeSeq += 1;
  return `wire_${edgeSeq}`;
}

function group(id: string, label: string, w: number, h: number): N {
  return {
    id,
    label,
    x: 50,
    y: 50,
    type: "group",
    style: `width: ${w}px; height: ${h}px;`,
    class: "main-logic-group border-2 !border-primary/80 bg-primary/5 rounded-xl shadow-lg shadow-primary/20 backdrop-blur-md",
  };
}

function evt(id: string, eventId: string, x: number, y: number, parentId = "main_group"): N {
  return { id, label: eventId, x, y, parentId, kind: "event", eventId };
}

/**
 * Typed pin layout for a Script block whose `return` carries a concrete engine
 * type. Mirrors the catalog "script" pins (exec in/out + data return) but tints
 * the return pin so its outgoing data wire reads as that type (Unreal-style).
 */
function scriptPins(returnType: string): CanvasPinDescriptor[] {
  return [
    { id: "exec_in", label: "in", direction: "input", pinKind: "exec" },
    { id: "exec_out", label: "out", direction: "output", pinKind: "exec" },
    { id: "return", label: "return", direction: "output", pinKind: "data", dataType: returnType },
  ];
}

function script(
  id: string,
  label: string,
  body: string,
  x: number,
  y: number,
  parentId = "main_group",
  returnType?: string
): N {
  const node: N = { id, label, x, y, parentId, kind: "script", scriptBody: body };
  // Only attach explicit pins when a meaningful return type is declared; absent
  // overrides fall back to the catalog defaults at render time (DRY).
  if (returnType) node.pins = scriptPins(returnType);
  return node;
}

function rhaiFn(id: string, fnName: string, x: number, y: number, parentId = "main_group"): N {
  return { id, label: fnName, x, y, parentId, type: "codeNativeNode", fn: fnName, kind: "function" };
}

function branch(id: string, label: string, x: number, y: number, parentId = "main_group"): N {
  return { id, label, x, y, parentId, kind: "branch" };
}

function setVar(id: string, varName: string, x: number, y: number, parentId = "main_group"): N {
  return { id, label: `Set ${varName}`, x, y, parentId, kind: "set-variable", varName };
}

function forEach(id: string, x: number, y: number, parentId = "main_group"): N {
  return { id, label: "For Each", x, y, parentId, kind: "for-each" };
}

function ret(id: string, x: number, y: number, parentId = "main_group"): N {
  return { id, label: "Return", x, y, parentId, kind: "return" };
}

function tryCatch(id: string, x: number, y: number, parentId = "main_group"): N {
  return { id, label: "Try / Catch", x, y, parentId, kind: "try-catch" };
}

function execEdge(source: string, target: string, sourceHandle = "then", targetHandle = "exec_in"): E {
  return { id: eid(), source, target, sourceHandle, targetHandle, kind: "exec" };
}

function dataEdge(source: string, target: string, sourceHandle: string, targetHandle: string): E {
  return { id: eid(), source, target, sourceHandle, targetHandle, kind: "data" };
}

function doc(nodes: N[], edges: E[]): CanvasDocumentV3 {
  return {
    version: CANVAS_SCHEMA_VERSION,
    displayOnly: true,
    nodes: finalizeLayout(nodes),
    edges,
  };
}

/** Event -> script chain (one lifecycle hook illustrated). */
function hookScript(eventId: string, scriptBody: string, rowIndex: number): { nodes: N[]; edges: E[] } {
  const e = evt(nid("evt"), eventId, col(0), row(rowIndex));
  const s = script(nid("scr"), eventId, scriptBody, col(1), row(rowIndex));
  return { nodes: [e, s], edges: [execEdge(e.id, s.id, "then", "exec_in")] };
}

/**
 * Builds the Safe plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildSafeIllustration(): CanvasDocumentV3 {
  resetIds();
  const h1 = hookScript("on_plugin_start", 'print("safe is starting...");', 0);
  const h2 = hookScript("on_all_plugins_loaded", 'print("safe is calling crash_test...");', 1);
  return doc([group("main_group", "Main Logic", 620, 280), ...h1.nodes, ...h2.nodes], [...h1.edges, ...h2.edges]);
}

/**
 * Builds the ST plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildStIllustration(): CanvasDocumentV3 {
  resetIds();
  const h1 = hookScript("on_plugin_start", 'log_info("Plugin st initialized!");', 0);
  const h2 = hookScript("on_plugin_stop", 'log_info("Plugin st stopped.");', 1);
  return doc([group("main_group", "Main Logic", 620, 280), ...h1.nodes, ...h2.nodes], [...h1.edges, ...h2.edges]);
}

/**
 * Builds the Crash Test plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildCrashTestIllustration(): CanvasDocumentV3 {
  resetIds();
  const e = evt("evt_start", "on_plugin_start", col(0), row(0));
  const s = script("scr_throw", "throw fatal", 'throw "FATAL ERROR INTENTIONALLY THROWN!";', col(1), row(0));
  const e2 = evt("evt_loaded", "on_all_plugins_loaded", col(0), row(1));
  const s2 = script("scr_skip", "unreachable", 'print("This should not run...");', col(1), row(1));
  return doc(
    [group("main_group", "Main Logic", 620, 280), e, s, e2, s2],
    [execEdge(e.id, s.id), execEdge(e2.id, s2.id)]
  );
}

/**
 * Builds the Translation Test plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildTranslationTestIllustration(): CanvasDocumentV3 {
  resetIds();
  const start = hookScript("on_plugin_start", "perform_test_translations();", 0);
  const perfEvt = evt("evt_perf", "perform_test_translations", col(0), row(2));
  const t1 = script("scr_t1", "translate hello/en", 'log_info(PLUGIN_NAME, translate(PLUGIN_NAME, "hello", "en", ["World"]));', col(1), row(2));
  const t2 = script("scr_t2", "translate welcome/es", 'log_info(PLUGIN_NAME, translate(PLUGIN_NAME, "welcome", "es", ["ChaosNexus Anvil", "Amigo"]));', col(1), row(3));
  const t3 = script("scr_t3", "fallback_test", 'log_info(PLUGIN_NAME, translate(PLUGIN_NAME, "fallback_test", "es", []));', col(1), row(4));
  const t4 = script("scr_t4", "missing_key", 'log_info(PLUGIN_NAME, translate(PLUGIN_NAME, "missing_key", "en", []));', col(1), row(5));
  const loaded = hookScript("on_all_plugins_loaded", 'log_info(PLUGIN_NAME, "All translation checks completed successfully.");', 6);
  return doc(
    [group("main_group", "Main Logic", 680, 640), ...start.nodes, perfEvt, t1, t2, t3, t4, ...loaded.nodes],
    [
      ...start.edges,
      execEdge(perfEvt.id, t1.id),
      execEdge(t1.id, t2.id, "exec_out", "exec_in"),
      execEdge(t2.id, t3.id, "exec_out", "exec_in"),
      execEdge(t3.id, t4.id, "exec_out", "exec_in"),
      ...loaded.edges,
    ]
  );
}

/**
 * Builds the Time plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildTimeIllustration(): CanvasDocumentV3 {
  resetIds();
  const start = hookScript(
    "on_plugin_start",
    "register_mcp_tool(get_system_time); register_mcp_tool(get_ntp_time);",
    0
  );
  const loaded = hookScript("on_all_plugins_loaded", 'print("[time] Time plugin is ready!");', 1);

  const execEvt = evt("evt_execute", "execute", col(0), row(2));
  const brSys = branch("br_sys", "get_system_time", col(1), row(2));
  const brNtp = branch("br_ntp", "get_ntp_time", col(1), row(3));
  const fnSys = rhaiFn("fn_sys", "get_system_time", col(2), row(2));
  const fnNtp = rhaiFn("fn_ntp", "get_ntp_time", col(2), row(3));
  const retUnknown = ret("ret_unknown", col(2), row(4));

  const sysHook = hookScript("get_system_time", 'system_time(tz); // tz defaults UTC, override from args', 5);
  const ntpHook = hookScript("get_ntp_time", 'ntp_request(srv, 123); // srv defaults pool.ntp.org', 6);

  return doc(
    [
      group("main_group", "Main Logic", 820, 780),
      ...start.nodes,
      ...loaded.nodes,
      execEvt,
      brSys,
      brNtp,
      fnSys,
      fnNtp,
      retUnknown,
      ...sysHook.nodes,
      ...ntpHook.nodes,
    ],
    [
      ...start.edges,
      ...loaded.edges,
      execEdge(execEvt.id, brSys.id),
      execEdge(brSys.id, fnSys.id, "true", "exec_in"),
      execEdge(brSys.id, brNtp.id, "false", "exec_in"),
      execEdge(brNtp.id, fnNtp.id, "true", "exec_in"),
      execEdge(brNtp.id, retUnknown.id, "false", "exec_in"),
      ...sysHook.edges,
      ...ntpHook.edges,
    ]
  );
}

/**
 * Builds the Dependencies plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildDependenciesIllustration(): CanvasDocumentV3 {
  resetIds();
  const start = hookScript("on_plugin_start", 'register_mcp_tool(PLUGIN_NAME, "check_dependency", ...);', 0);
  const loaded = hookScript("on_all_plugins_loaded", 'print("[dependencies] Loaded successfully!");', 1);
  const execEvt = evt("evt_execute", "execute", col(0), row(2));
  const br = branch("br_dep", "check_dependency", 280, 280);
  const setPkg = setVar("set_pkg", "pkg", 520, 240);
  const setMgr = setVar("set_mgr", "mgr", 520, 320);
  const brCargo = branch("br_cargo", 'mgr == "cargo"', 760, 240);
  const brNpm = branch("br_npm", 'mgr == "npm"', 760, 340);
  const brPip = branch("br_pip", 'mgr == "pip" || "uv"', 760, 440);
  const httpCargo = script("scr_cargo", "http_get crates.io", 'http_get("https://crates.io/api/v1/crates/" + pkg);', 1000, 200);
  const httpNpm = script("scr_npm", "http_get npm", 'http_get("https://registry.npmjs.org/" + pkg + "/latest");', 1000, 320);
  const httpPip = script("scr_pip", "http_get pypi", 'http_get("https://pypi.org/pypi/" + pkg + "/json");', 1000, 440);
  const retUnsup = ret("ret_unsup", 1000, 540);

  return doc(
    [
      group("main_group", "Main Logic", 1280, 640),
      ...start.nodes,
      ...loaded.nodes,
      execEvt,
      br,
      setPkg,
      setMgr,
      brCargo,
      brNpm,
      brPip,
      httpCargo,
      httpNpm,
      httpPip,
      retUnsup,
    ],
    [
      ...start.edges,
      ...loaded.edges,
      execEdge(execEvt.id, br.id),
      execEdge(br.id, setPkg.id, "true", "exec_in"),
      execEdge(setPkg.id, setMgr.id),
      execEdge(setMgr.id, brCargo.id),
      execEdge(brCargo.id, httpCargo.id, "true", "exec_in"),
      execEdge(brCargo.id, brNpm.id, "false", "exec_in"),
      execEdge(brNpm.id, httpNpm.id, "true", "exec_in"),
      execEdge(brNpm.id, brPip.id, "false", "exec_in"),
      execEdge(brPip.id, httpPip.id, "true", "exec_in"),
      execEdge(brPip.id, retUnsup.id, "false", "exec_in"),
    ]
  );
}

/**
 * Builds the Database Test plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildDbTestIllustration(): CanvasDocumentV3 {
  resetIds();
  const startEvt = evt("evt_start", "on_plugin_start", col(0), row(0));
  const regTool = script("scr_reg", "register_mcp_tool", 'register_mcp_tool(PLUGIN_NAME, "test_db", ...);', col(1), row(0));
  const dbConn = script("scr_conn", "db_connect", 'db_connect(PLUGIN_NAME, "test_db", "sqlite::memory:");', col(2), row(0));
  const dbInit = script("scr_init", "db_execute CREATE", 'db_execute("test_db", create_sql, []);', col(3), row(0));
  const loaded = hookScript("on_all_plugins_loaded", 'print("[db_test] Ready.");', 1);

  const execEvt = evt("evt_execute", "execute", col(0), row(2));
  const br = branch("br_test", "test_db", col(1), row(2));
  const setName = setVar("set_name", "name", col(2), row(2));
  const brArgs = branch("br_args", "args.contains(name)", col(2), row(3));
  const dbInsert = script("scr_insert", "db_execute INSERT", 'db_execute("test_db", insert_sql, [name]);', col(3), row(2));
  const dbSelect = script("scr_select", "db_query SELECT", 'db_query("test_db", select_sql, []);', col(4), row(3), "main_group", "array");
  const loop = forEach("loop_rec", col(4), row(4));
  const buildStr = script("scr_build", "build result_str", "result_str += record details;", col(5), row(4));
  const retNode = ret("ret_result", col(5), row(5));

  return doc(
    [
      group("main_group", "Main Logic", 1280, 620),
      startEvt,
      regTool,
      dbConn,
      dbInit,
      ...loaded.nodes,
      execEvt,
      br,
      setName,
      brArgs,
      dbInsert,
      dbSelect,
      loop,
      buildStr,
      retNode,
    ],
    [
      execEdge(startEvt.id, regTool.id),
      execEdge(regTool.id, dbConn.id),
      execEdge(dbConn.id, dbInit.id),
      ...loaded.edges,
      execEdge(execEvt.id, br.id),
      execEdge(br.id, setName.id, "true", "exec_in"),
      execEdge(setName.id, brArgs.id),
      execEdge(brArgs.id, dbInsert.id, "true", "exec_in"),
      execEdge(brArgs.id, dbInsert.id, "false", "exec_in"),
      execEdge(dbInsert.id, dbSelect.id),
      execEdge(dbSelect.id, loop.id),
      dataEdge(dbSelect.id, loop.id, "return", "items"),
      execEdge(loop.id, buildStr.id, "item", "exec_in"),
      execEdge(loop.id, retNode.id, "completed", "exec_in"),
    ]
  );
}

/**
 * Builds the HTTP / WebSocket Example plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildHttpWsExampleIllustration(): CanvasDocumentV3 {
  resetIds();
  const start = hookScript("on_plugin_start", "register_tool(http_get_demo, ws_connect_demo, ws_close_demo);", 0);
  const loaded = hookScript("on_all_plugins_loaded", 'print("HTTP/WS Example plugin fully loaded.");', 1);
  const stop = hookScript("on_plugin_stop", 'print("Stopping HTTP/WS Example plugin...");', 2);
  const wsEvt = evt("evt_ws_msg", "on_ws_message", 30, 345);
  const wsScr = script("scr_ws_msg", "print message", 'print("Received WS message in HTTP/WS Example: " + msg);', 280, 345);
  const wsMsg = { nodes: [wsEvt, wsScr], edges: [execEdge(wsEvt.id, wsScr.id)] };

  const execEvt = evt("evt_execute", "execute", 30, 460);
  const brHttp = branch("br_http", "http_get_demo", 280, 420);
  const brWs = branch("br_ws", "ws_connect_demo", 280, 520);
  const brClose = branch("br_close", "ws_close_demo", 280, 620);
  const scrGet = script("scr_get", "http_get", "let response = http_get(params.url); return response;", 520, 400);
  const scrWs = script("scr_ws", "ws_connect", 'ws_connect(PLUGIN_NAME, url, "on_ws_message");', 520, 500, "main_group", "object");
  const scrClose = script("scr_close", "ws_close", "ws_close(url);", 520, 600);
  const retUnknown = ret("ret_unk", 520, 700);
  const callbackWire = dataEdge(scrWs.id, wsEvt.id, "return", "payload");

  return doc(
    [
      group("main_group", "Main Logic", 820, 800),
      ...start.nodes,
      ...loaded.nodes,
      ...stop.nodes,
      ...wsMsg.nodes,
      execEvt,
      brHttp,
      brWs,
      brClose,
      scrGet,
      scrWs,
      scrClose,
      retUnknown,
    ],
    [
      ...start.edges,
      ...loaded.edges,
      ...stop.edges,
      ...wsMsg.edges,
      execEdge(execEvt.id, brHttp.id),
      execEdge(brHttp.id, scrGet.id, "true", "exec_in"),
      execEdge(brHttp.id, brWs.id, "false", "exec_in"),
      execEdge(brWs.id, scrWs.id, "true", "exec_in"),
      execEdge(brWs.id, brClose.id, "false", "exec_in"),
      execEdge(brClose.id, scrClose.id, "true", "exec_in"),
      execEdge(brClose.id, retUnknown.id, "false", "exec_in"),
      callbackWire,
    ]
  );
}

/**
 * Builds the MCP Bridge Demo plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildMcpBridgeDemoIllustration(): CanvasDocumentV3 {
  resetIds();
  const start = hookScript("on_plugin_start", "register_mcp_tool(probe); register_mcp_tool(relay);", 0);
  const execEvt = evt("evt_execute", "execute", 30, 180);
  const brProbe = branch("br_probe", "mcp_bridge_probe", 280, 160);
  const brRelay = branch("br_relay", "mcp_bridge_relay", 280, 260);
  const fnProbe = rhaiFn("fn_probe", "probe", 520, 140);
  const fnRelay = rhaiFn("fn_relay", "relay", 520, 240);
  const retUnk = ret("ret_unk", 520, 340);

  const probeFlow = [
    script("scr_pconn", "mcp_connect", 'mcp_connect(PLUGIN_NAME, "probe_conn", command, cmd_args);', 760, 80),
    script("scr_plist", "mcp_list_tools", 'mcp_list_tools("probe_conn");', 1000, 80),
    script("scr_pdisc", "mcp_disconnect", 'mcp_disconnect("probe_conn");', 1240, 80),
    forEach("loop_tools", 760, 180),
    script("scr_names", "collect names", "names.push(t.name);", 1000, 180),
  ];
  const relayFlow = [
    script("scr_rconn", "mcp_connect", 'mcp_connect(PLUGIN_NAME, "relay_conn", command, cmd_args);', 760, 280),
    script("scr_rcall", "mcp_call_tool", 'mcp_call_tool("relay_conn", args.tool, tool_args);', 1000, 280),
    script("scr_rdisc", "mcp_disconnect", 'mcp_disconnect("relay_conn");', 1240, 280),
  ];

  return doc(
    [
      group("main_group", "Main Logic", 1480, 400),
      ...start.nodes,
      execEvt,
      brProbe,
      brRelay,
      fnProbe,
      fnRelay,
      retUnk,
      ...probeFlow,
      ...relayFlow,
    ],
    [
      ...start.edges,
      execEdge(execEvt.id, brProbe.id),
      execEdge(brProbe.id, fnProbe.id, "true", "exec_in"),
      execEdge(brProbe.id, brRelay.id, "false", "exec_in"),
      execEdge(brRelay.id, fnRelay.id, "true", "exec_in"),
      execEdge(brRelay.id, retUnk.id, "false", "exec_in"),
      execEdge(fnProbe.id, probeFlow[0].id),
      execEdge(probeFlow[0].id, probeFlow[1].id),
      execEdge(probeFlow[1].id, probeFlow[2].id),
      execEdge(probeFlow[2].id, probeFlow[3].id),
      execEdge(probeFlow[3].id, probeFlow[4].id, "item", "exec_in"),
      execEdge(fnRelay.id, relayFlow[0].id),
      execEdge(relayFlow[0].id, relayFlow[1].id),
      execEdge(relayFlow[1].id, relayFlow[2].id),
    ]
  );
}

/**
 * Builds the Terminal plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildTerminalIllustration(): CanvasDocumentV3 {
  resetIds();
  const startEvt = evt("evt_start", "on_plugin_start", col(0), row(0));
  const loadCfg = script("scr_load", "load_config", 'load_config(PLUGIN_NAME, "config.toml");', col(1), row(0));
  const keysVar = script("scr_keys", "cfg.commands.keys()", "let keys = cfg.commands.keys();", col(2), row(0), "main_group", "array");
  const loop = forEach("loop_keys", col(3), row(0));
  const regTool = script("scr_reg", "register_mcp_tool", "register_mcp_tool(PLUGIN_NAME, key, desc, schema_str);", col(4), row(0));
  const loaded = hookScript("on_all_plugins_loaded", 'print("[terminal] Ready.");', 1);

  const execEvt = evt("evt_execute", "execute", col(0), row(2));
  const loadExec = script("scr_load2", "load_config", 'load_config(PLUGIN_NAME, "config.toml");', col(1), row(2));
  const setCmd = setVar("set_cmd", "cmd", col(2), row(2));
  const setFull = setVar("set_full", "full_cmd", col(2), row(3));
  const brArgs = branch("br_args", "args.contains(args)", col(2), row(4));
  const loopArgs = forEach("loop_args", col(3), row(4));
  const concat = script("scr_concat", "full_cmd += a", 'full_cmd += " " + a;', col(4), row(4));
  const osCall = script("scr_os", "sys_os", 'let os = sys_os();', col(2), row(5));
  const setShell = setVar("set_shell", "shell", col(3), row(5));
  const brWin = branch("br_win", 'os == "windows"', col(4), row(5));
  const brMac = branch("br_mac", 'os == "macos"', col(4), row(6));
  const getShell = script("scr_getenv", "get_env SHELL", 'get_env("SHELL");', col(5), row(6));
  const brEnv = branch("br_env", 'env_shell != ""', col(6), row(6));
  const brDefShell = branch("br_defshell", "cfg.default_shell", col(5), row(7));
  const brCmdShell = branch("br_cmdshell", "per-command shell", col(6), row(7));
  const runCmd = script("scr_run", "run_command", "run_command(shell, full_cmd);", col(7), row(7));

  return doc(
    [
      group("main_group", "Main Logic", 800, 600),
      startEvt,
      loadCfg,
      keysVar,
      loop,
      regTool,
      ...loaded.nodes,
      execEvt,
      loadExec,
      setCmd,
      setFull,
      brArgs,
      loopArgs,
      concat,
      osCall,
      setShell,
      brWin,
      brMac,
      getShell,
      brEnv,
      brDefShell,
      brCmdShell,
      runCmd,
    ],
    [
      execEdge(startEvt.id, loadCfg.id),
      execEdge(loadCfg.id, keysVar.id),
      execEdge(keysVar.id, loop.id),
      dataEdge(keysVar.id, loop.id, "return", "items"),
      execEdge(loop.id, regTool.id, "item", "exec_in"),
      ...loaded.edges,
      execEdge(execEvt.id, loadExec.id),
      execEdge(loadExec.id, setCmd.id),
      execEdge(setCmd.id, setFull.id),
      execEdge(setFull.id, brArgs.id),
      execEdge(brArgs.id, loopArgs.id, "true", "exec_in"),
      execEdge(loopArgs.id, concat.id, "item", "exec_in"),
      execEdge(brArgs.id, osCall.id, "false", "exec_in"),
      execEdge(osCall.id, setShell.id),
      execEdge(setShell.id, brWin.id),
      execEdge(brWin.id, brMac.id, "false", "exec_in"),
      execEdge(brMac.id, getShell.id, "false", "exec_in"),
      execEdge(getShell.id, brEnv.id),
      execEdge(brEnv.id, brDefShell.id, "completed", "exec_in"),
      execEdge(brDefShell.id, brCmdShell.id),
      execEdge(brCmdShell.id, runCmd.id),
    ]
  );
}

/**
 * Builds the Core Plugin Manager illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildCorePluginManagerIllustration(): CanvasDocumentV3 {
  resetIds();
  const regEvt = evt("evt_reg", "module_init", 30, 45);
  const regTool = script("scr_reg", "register_tool", 'register_tool(..., Fn("handle_plugin_install"));', 280, 45);
  const regPrint = script("scr_print", "print registered", 'print("[core_plugin_manager] Registered...");', 530, 45);

  const fnEvt = evt("evt_install", "handle_plugin_install", 30, 200);
  const setRepo = setVar("set_repo", "repo_url", 280, 180);
  const setName = setVar("set_name", "plugin_name", 280, 240);
  const brSlash = branch("br_slash", 'base_url.ends_with("/")', 520, 200);
  const trim = script("scr_trim", "trim trailing slash", "base_url = base_url.sub_string(...);", 760, 180);
  const httpToml = script("scr_toml", "http_get plugin.toml", "http_get(toml_url);", 760, 260);
  const brToml = branch("br_toml", "status == 200", 1000, 260);
  const httpScript = script("scr_script", "http_get script", "http_get(script_url);", 1240, 240);
  const brScript = branch("br_script", "status == 200", 1480, 240);
  const tc = tryCatch("tc_install", 1720, 240);
  const install = script("scr_install", "sys_install_plugin", "sys_install_plugin(...);", 1960, 200);
  const catchRet = script("scr_catch", "catch err", 'return "Failed to install: " + err;', 1960, 300);
  const retOk = ret("ret_ok", 2200, 200);

  return doc(
    [
      group("main_group", "Main Logic", 2380, 400),
      regEvt,
      regTool,
      regPrint,
      fnEvt,
      setRepo,
      setName,
      brSlash,
      trim,
      httpToml,
      brToml,
      httpScript,
      brScript,
      tc,
      install,
      catchRet,
      retOk,
    ],
    [
      execEdge(regEvt.id, regTool.id),
      execEdge(regTool.id, regPrint.id),
      execEdge(fnEvt.id, setRepo.id),
      execEdge(setRepo.id, setName.id),
      execEdge(setName.id, brSlash.id),
      execEdge(brSlash.id, trim.id, "true", "exec_in"),
      execEdge(brSlash.id, httpToml.id, "false", "exec_in"),
      execEdge(trim.id, httpToml.id),
      execEdge(httpToml.id, brToml.id),
      execEdge(brToml.id, httpScript.id, "true", "exec_in"),
      execEdge(httpScript.id, brScript.id),
      execEdge(brScript.id, tc.id, "true", "exec_in"),
      execEdge(tc.id, install.id, "try", "exec_in"),
      execEdge(install.id, retOk.id),
      execEdge(tc.id, catchRet.id, "catch", "exec_in"),
    ]
  );
}

/**
 * Builds the Package Manager plugin illustrative canvas.
 * @returns {CanvasDocumentV3} The initialized display-only canvas document.
 */
export function buildPkgManagerIllustration(): CanvasDocumentV3 {
  resetIds();
  const start = hookScript("on_plugin_start", "register_mcp_tool(search); register_mcp_tool(install);", 0);
  const mcpEvt = evt("evt_mcp", "on_mcp_call", 30, 200);
  const brSearch = branch("br_search", "chaoswrench_search_plugins", 280, 180);
  const brInstall = branch("br_install", "chaoswrench_install_plugin", 280, 300);
  const retUnk = ret("ret_unk", 280, 420);

  const cvarRepos = script("scr_cvar", "cvar repositories", 'cvar("pkg_manager.repositories");', 520, 140);
  const parseRepos = script("scr_parse", "from_json", "from_json(repos_str);", 760, 140);
  const loopRepos = forEach("loop_repos", 1000, 140);
  const httpRepo = script("scr_http", "http_get repository.json", "http_get(repo + '/repository.json');", 1240, 140);
  const brJson = branch("br_json", 'res.index_of("{") >= 0', 1480, 140);
  const buildJson = script("scr_build", "aggregate JSON", "results += json_repo;", 1720, 140);

  const parseArgs = script("scr_args", "from_json args", "from_json(args_json);", 520, 280);
  const httpToml = script("scr_toml", "http_get plugin.toml", "http_get(toml_url);", 760, 260);
  const brToml = branch("br_toml", 'toml contains "name"', 1000, 260);
  const parseEntry = script("scr_entry", "parse entry from toml", "entry_name = sub_string(...);", 1240, 260);
  const httpScript = script("scr_script", "http_get script", "http_get(script_url);", 1480, 260);
  const brScript = branch("br_script", "script len > 0", 1720, 260);
  const install = script("scr_install", "sys_install_plugin", "sys_install_plugin(...);", 1960, 240);
  const retOk = ret("ret_ok", 1960, 320);

  return doc(
    [
      group("main_group", "Main Logic", 2200, 500),
      ...start.nodes,
      mcpEvt,
      brSearch,
      brInstall,
      retUnk,
      cvarRepos,
      parseRepos,
      loopRepos,
      httpRepo,
      brJson,
      buildJson,
      parseArgs,
      httpToml,
      brToml,
      parseEntry,
      httpScript,
      brScript,
      install,
      retOk,
    ],
    [
      ...start.edges,
      execEdge(mcpEvt.id, brSearch.id),
      execEdge(brSearch.id, cvarRepos.id, "true", "exec_in"),
      execEdge(cvarRepos.id, parseRepos.id),
      execEdge(parseRepos.id, loopRepos.id),
      execEdge(loopRepos.id, httpRepo.id, "item", "exec_in"),
      execEdge(httpRepo.id, brJson.id),
      execEdge(brJson.id, buildJson.id, "true", "exec_in"),
      execEdge(brSearch.id, brInstall.id, "false", "exec_in"),
      execEdge(brInstall.id, parseArgs.id, "true", "exec_in"),
      execEdge(parseArgs.id, httpToml.id),
      execEdge(httpToml.id, brToml.id),
      execEdge(brToml.id, parseEntry.id, "true", "exec_in"),
      execEdge(parseEntry.id, httpScript.id),
      execEdge(httpScript.id, brScript.id),
      execEdge(brScript.id, install.id, "true", "exec_in"),
      execEdge(install.id, retOk.id),
      execEdge(brInstall.id, retUnk.id, "false", "exec_in"),
    ]
  );
}

/**
 * Defines a target specification for illustrative canvas generation.
 */
export interface IllustrativeTarget {
  /**
   * The relative path to the sidecar JSON file to be generated.
   */
  sidecarPath: string;
  /**
   * The builder function that produces the canvas document.
   * @returns {CanvasDocumentV3} The canvas document for this target.
   */
  build: () => CanvasDocumentV3;
}

/**
 * Registry of all illustrative targets used to generate bundled canvas sidecars.
 */
export const ILLUSTRATIVE_TARGETS: IllustrativeTarget[] = [
  { sidecarPath: "scripts/plugins/safe/.chaosnexus-forge/safe_tool.rhai.canvas.json", build: buildSafeIllustration },
  { sidecarPath: "scripts/plugins/st/.chaosnexus-forge/st_tool.rhai.canvas.json", build: buildStIllustration },
  {
    sidecarPath: "scripts/plugins/disabled/crash_test/.chaosnexus-forge/crash_test_tool.rhai.canvas.json",
    build: buildCrashTestIllustration,
  },
  {
    sidecarPath: "scripts/plugins/translation_test/.chaosnexus-forge/translation_test_tool.rhai.canvas.json",
    build: buildTranslationTestIllustration,
  },
  { sidecarPath: "scripts/plugins/time/.chaosnexus-forge/time_tool.rhai.canvas.json", build: buildTimeIllustration },
  {
    sidecarPath: "scripts/plugins/dependencies/.chaosnexus-forge/dependencies_tool.rhai.canvas.json",
    build: buildDependenciesIllustration,
  },
  { sidecarPath: "scripts/plugins/db_test/.chaosnexus-forge/db_test_tool.rhai.canvas.json", build: buildDbTestIllustration },
  {
    sidecarPath: "scripts/plugins/http_ws_example/.chaosnexus-forge/http_ws_example_tool.rhai.canvas.json",
    build: buildHttpWsExampleIllustration,
  },
  {
    sidecarPath: "scripts/plugins/mcp_bridge_demo/.chaosnexus-forge/mcp_bridge_demo_tool.rhai.canvas.json",
    build: buildMcpBridgeDemoIllustration,
  },
  {
    sidecarPath: "scripts/plugins/terminal/.chaosnexus-forge/terminal_tool.rhai.canvas.json",
    build: buildTerminalIllustration,
  },
  {
    sidecarPath: "scripts/plugins/core_plugin_manager/.chaosnexus-forge/core_plugin_manager_tool.rhai.canvas.json",
    build: buildCorePluginManagerIllustration,
  },
  {
    sidecarPath: "scripts/plugins/pkg_manager/.chaosnexus-forge/pkg_manager_tool.rhai.canvas.json",
    build: buildPkgManagerIllustration,
  },
];
