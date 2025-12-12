"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectId = exports.connectDb = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn';
let isConnecting = false;
const connectDb = async () => {
    if (isConnecting)
        return;
    isConnecting = true;
    try {
        await mongoose_1.default.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
    }
    catch (error) {
        console.error('Initial MongoDB connection error:', error);
        isConnecting = false;
        // Retry connection after 5 seconds
        setTimeout(() => (0, exports.connectDb)(), 5000);
        return;
    }
    isConnecting = false;
    mongoose_1.default.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error);
    });
    mongoose_1.default.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
        if (!isConnecting) {
            setTimeout(() => (0, exports.connectDb)(), 5000);
        }
    });
    mongoose_1.default.connection.on('reconnected', () => {
        console.log('MongoDB reconnected');
    });
};
exports.connectDb = connectDb;
exports.objectId = mongoose_1.default.Types.ObjectId;
