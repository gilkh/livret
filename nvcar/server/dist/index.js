"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const os_1 = __importDefault(require("os"));
const socket_1 = require("./socket");
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Store server reference for graceful shutdown
let server = null;
// Graceful shutdown function
const gracefulShutdown = (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    if (server) {
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
        // Force close after 5 seconds
        setTimeout(() => {
            console.log('Forcing shutdown...');
            process.exit(1);
        }, 5000);
    }
    else {
        process.exit(0);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit for ECONNRESET or similar non-fatal errors
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
        return;
    }
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = (0, app_1.createApp)();
try {
    // Look for certs in ../certs relative to project root (server folder)
    // If running from src/index.ts via ts-node, __dirname is src
    // If running from dist/index.js, __dirname is dist
    // So we need to go up two levels to get to server root, then up one more to get to nvcar root?
    // No, I put certs in nvcar/certs.
    // server root is nvcar/server.
    // so path is ../certs relative to server root.
    // from src: ../../certs
    const certPath = path_1.default.join(__dirname, '../../certs');
    if (fs_1.default.existsSync(path_1.default.join(certPath, 'key.pem'))) {
        const key = fs_1.default.readFileSync(path_1.default.join(certPath, 'key.pem'));
        const cert = fs_1.default.readFileSync(path_1.default.join(certPath, 'cert.pem'));
        server = https_1.default.createServer({ key, cert }, app);
        console.log('SSL certificates loaded. Starting HTTPS server.');
    }
    else {
        throw new Error('Certificates not found');
    }
}
catch (e) {
    console.warn('Could not load SSL certificates, falling back to HTTP');
    server = http_1.default.createServer(app);
}
server.listen(port, () => {
    const nets = os_1.default.networkInterfaces();
    const addrs = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal)
                addrs.push(net.address);
        }
    }
    const protocol = server instanceof https_1.default.Server ? 'https' : 'http';
    console.log(`server listening on ${protocol}://localhost:${port}`);
    if (addrs.length) {
        for (const a of addrs)
            console.log(`server shared on ${protocol}://${a}:${port}`);
    }
});
(0, socket_1.initSocket)(server);
