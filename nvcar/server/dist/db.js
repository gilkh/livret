"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectId = exports.connectDb = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn';
const connectDb = async () => {
    await mongoose_1.default.connect(uri);
};
exports.connectDb = connectDb;
exports.objectId = mongoose_1.default.Types.ObjectId;
