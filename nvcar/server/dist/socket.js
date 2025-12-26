"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const initSocket = (httpServer) => {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: true,
            methods: ['GET', 'POST'],
            credentials: true
        }
    });
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        socket.on('join-template', (templateId) => {
            socket.join(`template:${templateId}`);
            console.log(`Socket ${socket.id} joined template:${templateId}`);
        });
        socket.on('leave-template', (templateId) => {
            socket.leave(`template:${templateId}`);
            console.log(`Socket ${socket.id} left template:${templateId}`);
        });
        socket.on('update-template', (data, ack) => {
            // Broadcast to everyone else in the room and ack with a change id
            const { generateChangeId } = require('../utils/changeId');
            const changeId = generateChangeId();
            socket.to(`template:${data.templateId}`).emit('template-updated', { template: data.template, changeId });
            if (ack)
                ack({ status: 'ok', changeId });
        });
        // Generic room support for assignments/gradebooks
        socket.on('join-room', (roomId) => {
            socket.join(roomId);
            console.log(`Socket ${socket.id} joined room:${roomId}`);
        });
        socket.on('leave-room', (roomId) => {
            socket.leave(roomId);
            console.log(`Socket ${socket.id} left room:${roomId}`);
        });
        socket.on('broadcast-update', (data, ack) => {
            const changeId = require('uuid').v4();
            socket.to(data.roomId).emit('update-received', { ...data.payload, changeId });
            if (ack)
                ack({ status: 'ok', changeId });
        });
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });
    return io;
};
exports.initSocket = initSocket;
