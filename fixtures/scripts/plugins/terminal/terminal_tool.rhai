// chaosnexus-scripts/plugins/terminal/terminal_tool.rhai
// Allowlisted terminal commands via argv (no shell -c).

fn on_plugin_start() {
    let cfg = load_config(PLUGIN_NAME, "config.toml");
    let keys = cfg.commands.keys();
    for key in keys {
        let desc = "Run terminal command: " + key;
        let schema_str = "{\"type\":\"object\",\"properties\":{\"args\":{\"type\":\"array\",\"items\":{\"type\":\"string\"},\"description\":\"Arguments\"}}}";
        register_mcp_tool(PLUGIN_NAME, key, desc, schema_str);
    }
}

fn on_all_plugins_loaded() {
    print("[terminal] Ready (argv run_command; host must grant shell allowlist).");
}

fn execute(tool_name, args) {
    let cfg = load_config(PLUGIN_NAME, "config.toml");
    let cmd = cfg.commands[tool_name].command;

    // Split configured command into exec + base args (no shell -c).
    let parts = cmd.split(" ");
    let exec = parts[0];
    let argv = [];
    let i = 1;
    while i < parts.len() {
        if parts[i] != "" {
            argv.push(parts[i]);
        }
        i += 1;
    }
    if args.contains("args") {
        let arr = args["args"];
        for a in arr {
            argv.push(a);
        }
    }
    return run_command(exec, argv);
}
