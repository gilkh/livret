"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectTestDb = connectTestDb;
exports.clearTestDb = clearTestDb;
exports.closeTestDb = closeTestDb;
const mongodb_memory_server_1 = require("mongodb-memory-server");
const mongoose_1 = __importDefault(require("mongoose"));
let mongo = null;
async function connectTestDb() {
    mongo = await mongodb_memory_server_1.MongoMemoryServer.create();
    const uri = mongo.getUri();
    process.env.MONGO_URI = uri;
    await mongoose_1.default.connect(uri);
}
async function clearTestDb() {
    const collections = mongoose_1.default.connection.collections;
    for (const key of Object.keys(collections)) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
}
async function closeTestDb() {
    await mongoose_1.default.disconnect();
    if (mongo)
        await mongo.stop();
    mongo = null;
}
