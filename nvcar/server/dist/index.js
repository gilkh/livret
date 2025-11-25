"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const os_1 = __importDefault(require("os"));
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = (0, app_1.createApp)();
app.listen(port, () => {
    const nets = os_1.default.networkInterfaces();
    const addrs = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal)
                addrs.push(net.address);
        }
    }
    console.log(`server listening on http://localhost:${port}`);
    if (addrs.length) {
        for (const a of addrs)
            console.log(`server shared on http://${a}:${port}`);
    }
});
