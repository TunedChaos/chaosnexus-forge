// chaosnexus-forge/scripts/tauri-failsafe.js
import { spawn } from 'child_process';
import net from 'net';

// Helper to check if a specific host has the port in use
function checkPortHost(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Definitely in use
      } else {
        resolve(true);  // Host unsupported or other issue, treat as available
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    try {
      server.listen(port, host);
    } catch (err) {
      resolve(true);
    }
  });
}

// Helper to check if a port is in use across multiple local hosts/interfaces
async function isPortAvailable(port) {
  const hosts = ['127.0.0.1', '::1', '0.0.0.0', '::'];
  for (const host of hosts) {
    const available = await checkPortHost(port, host);
    if (!available) {
      return false;
    }
  }
  return true;
}

// Find first available port starting from 1420
async function findAvailablePort(startPort) {
  let port = startPort;
  while (true) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
}

async function run() {
  const args = process.argv.slice(2);
  const isDev = args[0] === 'dev';

  if (!isDev) {
    // If not 'dev', just pass-through to tauri CLI directly
    const tauriProcess = spawn('pnpm', ['exec', 'tauri', ...args], {
      stdio: 'inherit',
      shell: false
    });
    tauriProcess.on('exit', (code) => {
      process.exit(code || 0);
    });
    return;
  }

  // If running 'dev', find a free port for Vite to prevent conflicts
  const port = await findAvailablePort(1420);
  console.log(`\x1b[36m[ChaosNexus Forge Failsafe] Dynamic Port Selector selected free port: ${port}\x1b[0m`);

  // Start Vite dev server on the chosen port
  console.log(`\x1b[36m[ChaosNexus Forge Failsafe] Launching Vite dev server on port ${port}...\x1b[0m`);
  const viteProcess = spawn('pnpm', ['exec', 'vite', 'dev', '--port', port.toString()], {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, PORT: port.toString() }
  });

  viteProcess.on('error', (err) => {
    console.error('[ChaosNexus Forge Failsafe] Failed to start Vite:', err);
    process.exit(1);
  });

  // Give Vite a short moment to start up and bind to its port
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Start Tauri dev pointing to our dynamic port, overriding config so it doesn't duplicate
  console.log(`\x1b[36m[ChaosNexus Forge Failsafe] Launching Tauri dev pointing to http://localhost:${port}...\x1b[0m`);
  
  // Use Tauri v2 CLI -c / --config merge override
  const configOverride = JSON.stringify({
    build: {
      beforeDevCommand: '',
      devUrl: `http://localhost:${port}`
    }
  });

  const tauriProcess = spawn('pnpm', ['exec', 'tauri', 'dev', '--config', configOverride], {
    stdio: 'inherit',
    shell: false
  });

  tauriProcess.on('error', (err) => {
    console.error('[ChaosNexus Forge Failsafe] Failed to start Tauri:', err);
    viteProcess.kill();
    process.exit(1);
  });

  // Handle cleanup on exit
  const cleanup = () => {
    viteProcess.kill();
    tauriProcess.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  tauriProcess.on('exit', (code) => {
    viteProcess.kill();
    process.exit(code || 0);
  });
}

run();
