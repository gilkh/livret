"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopSandboxServer = exports.startSandboxServer = exports.getSandboxServerStatus = void 0;
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const SANDBOX_PORT = 4001;
const SANDBOX_DB_URI = 'mongodb://localhost:27017/nvcar_sandbox';
let proc = null;
let startedAt = null;
let lastError = null;
const runBuild = () => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const r = (0, child_process_1.spawnSync)(npmCmd, ['run', 'build'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe',
        shell: process.platform === 'win32',
        windowsHide: false,
    });
    if (r.status !== 0) {
        const out = String(r.stdout || '');
        const err = String(r.stderr || '');
        const spawnErr = r.error ? String(r.error?.message || r.error) : '';
        const status = typeof r.status === 'number' ? String(r.status) : 'null';
        const signal = r.signal ? String(r.signal) : '';
        const combined = `${out}\n${err}`.trim();
        const detailParts = [
            spawnErr ? `spawnError=${spawnErr}` : '',
            `status=${status}`,
            signal ? `signal=${signal}` : '',
            combined ? combined : '',
        ].filter(Boolean);
        const msg = detailParts.join('\n').trim().slice(0, 4000) || 'sandbox_server_build_failed';
        throw new Error(`sandbox_server_build_failed: ${msg}`);
    }
};
const getBaseUrl = () => {
    const host = process.env.PUBLIC_API_HOST || 'localhost';
    const certDir = path_1.default.resolve(process.cwd(), '..', 'certs');
    const hasCerts = fs_1.default.existsSync(path_1.default.join(certDir, 'key.pem')) && fs_1.default.existsSync(path_1.default.join(certDir, 'cert.pem'));
    const protocol = process.env.PUBLIC_API_PROTOCOL || (hasCerts ? 'https' : 'http');
    return `${protocol}://${host}:${SANDBOX_PORT}`;
};
const getSandboxServerStatus = () => {
    return {
        running: !!proc && !proc.killed,
        pid: proc?.pid || null,
        port: SANDBOX_PORT,
        baseUrl: getBaseUrl(),
        startedAt,
        lastError,
    };
};
exports.getSandboxServerStatus = getSandboxServerStatus;
const waitForHealthy = async (baseUrl) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        try {
            const isHttps = String(baseUrl).toLowerCase().startsWith('https://');
            const res = await axios_1.default.get(`${baseUrl}/health`, {
                timeout: 1500,
                validateStatus: () => true,
                ...(isHttps ? { httpsAgent: new https_1.default.Agent({ rejectUnauthorized: false }) } : {}),
            });
            if (res.status >= 200 && res.status < 300)
                return;
        }
        catch (e) {
        }
        await new Promise(resolve => setTimeout(resolve, 750));
    }
    throw new Error('sandbox_health_check_timeout');
};
const startSandboxServer = async () => {
    if (proc && !proc.killed)
        return (0, exports.getSandboxServerStatus)();
    lastError = null;
    startedAt = Date.now();
    const baseUrl = getBaseUrl();
    const serverRoot = process.cwd();
    const entry = path_1.default.join(serverRoot, 'dist', 'index.js');
    try {
        runBuild();
    }
    catch (e) {
        lastError = String(e?.message || e);
        throw e;
    }
    if (!fs_1.default.existsSync(entry)) {
        lastError = 'sandbox_server_missing_build';
        throw new Error('sandbox_server_missing_build: run `npm run build` in nvcar/server to generate dist/index.js');
    }
    // Spawn the sandbox as a detached background process and redirect logs to files
    const outPath = path_1.default.join(process.cwd(), 'sandbox.out.log');
    const errPath = path_1.default.join(process.cwd(), 'sandbox.err.log');
    const outFd = fs_1.default.openSync(outPath, 'a');
    const errFd = fs_1.default.openSync(errPath, 'a');
    proc = (0, child_process_1.spawn)(process.execPath, [entry], {
        stdio: ['ignore', outFd, errFd],
        env: {
            ...process.env,
            PORT: String(SANDBOX_PORT),
            MONGODB_URI: SANDBOX_DB_URI,
            SIMULATION_SANDBOX: 'true',
            SIMULATION_SANDBOX_MARKER: 'sandbox',
            NODE_ENV: process.env.NODE_ENV || 'development',
        },
        detached: true,
        windowsHide: false,
    });
    // Allow the child to continue running independently
    try {
        proc.unref();
    }
    catch (e) { }
    console.info(`sandbox spawned pid=${proc?.pid} out=${outPath} err=${errPath}`);
    proc.on('exit', (code) => {
        if (code && code !== 0)
            lastError = `sandbox_server_exit_${code}`;
        proc = null;
    });
    try {
        await waitForHealthy(baseUrl);
    }
    catch (e) {
        lastError = String(e?.message || e);
        throw e;
    }
    return (0, exports.getSandboxServerStatus)();
};
exports.startSandboxServer = startSandboxServer;
const stopSandboxServer = async () => {
    if (!proc || proc.killed) {
        proc = null;
        return (0, exports.getSandboxServerStatus)();
    }
    const pid = proc.pid;
    try {
        // Windows-safe kill of process tree
        (0, child_process_1.spawn)('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    catch (e) {
        try {
            proc.kill('SIGTERM');
        }
        catch (e2) {
        }
    }
    proc = null;
    return (0, exports.getSandboxServerStatus)();
};
exports.stopSandboxServer = stopSandboxServer;
