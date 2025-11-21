"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = (0, app_1.createApp)();
app.listen(port, () => {
    console.log(`server listening on http://localhost:${port}`);
});
