/**
 * Open-Pax — Startup Script
 * ==========================
 * Launches both frontend and backend servers.
 * Logs output to /logs directory.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const isWindows = os.platform() === 'win32';
const isDev = process.argv.includes('--dev');

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 8000;

const LOGS_DIR = path.join(process.cwd(), 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Create log file with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(LOGS_DIR, `open-pax-${timestamp}.log`);
const errorLogFile = path.join(LOGS_DIR, `open-pax-errors-${timestamp}.log`);

// Logging function
function log(message, type = 'INFO') {
  const time = new Date().toISOString();
  const logMessage = `[${time}] [${type}] ${message}\n`;
  console.log(logMessage.trim());

  fs.appendFileSync(logFile, logMessage);
  if (type === 'ERROR') {
    fs.appendFileSync(errorLogFile, logMessage);
  }
}

// Print banner
function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ███████╗████████╗██████╗  ██████╗               ║
║   ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗              ║
║   ██████╔╝█████╗     ██║   ██████╔╝██║   ██║              ║
║   ██╔══██╗██╔══╝     ██║   ██╔══██╗██║   ██║              ║
║   ██║  ██║███████╗   ██║   ██║  ██║╚██████╔╝              ║
║   ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝               ║
║                                                           ║
║         AI Alternate History Simulator                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

// Start a process and log its output
function startProcess(name, dir, cmd, args) {
  return new Promise((resolve, reject) => {
    log(`Starting ${name}...`);

    const proc = spawn(cmd, args, {
      cwd: dir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: 'true' }
    });

    let ready = false;

    proc.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        log(`[${name.toUpperCase()}] ${output}`, name.toUpperCase());
        if (!ready && (output.includes('listening') || output.includes('Local:') || output.includes('ready in'))) {
          ready = true;
          setTimeout(() => {
            log(`${name} ready`);
            resolve(proc);
          }, 1000);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        // Ignore common non-error messages
        if (!output.includes('Deprecation') && !output.includes('ExperimentalWarning')) {
          log(`[${name.toUpperCase()} ERROR] ${output}`, 'ERROR');
        }
      }
    });

    proc.on('error', (err) => {
      log(`${name} error: ${err.message}`, 'ERROR');
      reject(err);
    });

    // Fallback timeout
    setTimeout(() => {
      if (!ready) {
        ready = true;
        log(`${name} started (timeout)`);
        resolve(proc);
      }
    }, 8000);
  });
}

// Graceful shutdown
function shutdown() {
  log('Shutting down servers...', 'WARN');
  processes.forEach(({ name, proc }) => {
    log(`Stopping ${name}...`, 'WARN');
    if (isWindows) {
      spawn('taskkill', ['/pid', proc.pid, '/f', '/t'], { shell: true, stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  });
  log('Servers stopped', 'INFO');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const processes = [];

async function main() {
  printBanner();

  log(`Open-Pax starting in ${isDev ? 'development' : 'production'} mode`);
  log(`Logs will be written to: ${LOGS_DIR}`);
  log(`Log file: ${path.basename(logFile)}`);
  log('');

  const backendDir = path.join(process.cwd(), 'backend-nest');
  const frontendDir = path.join(process.cwd(), 'frontend');

  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  try {
    // Start backend
    const backendArgs = isDev ? ['run', 'dev'] : ['run', 'start'];
    processes.push({
      name: 'Backend',
      proc: await startProcess('Backend', backendDir, npmCmd, backendArgs)
    });

    // Start frontend
    const frontendArgs = ['run', 'dev'];
    processes.push({
      name: 'Frontend',
      proc: await startProcess('Frontend', frontendDir, npmCmd, frontendArgs)
    });

    log('');
    log('═══════════════════════════════════════════════════════════');
    log('                   SERVER READY!                           ');
    log('═══════════════════════════════════════════════════════════');
    log('');
    log(`  🌐 Frontend:  http://localhost:${FRONTEND_PORT}`);
    log(`  🔌 Backend:   http://localhost:${BACKEND_PORT}/api`);
    log('');
    log(`  📝 Logs:     ${LOGS_DIR}`);
    log(`  📄 Log file: ${path.basename(logFile)}`);
    log('');
    log('  Press Ctrl+C to stop the servers');
    log('═══════════════════════════════════════════════════════════');
    log('');

  } catch (error) {
    log(`Failed to start: ${error.message}`, 'ERROR');
    shutdown();
  }
}

main();
