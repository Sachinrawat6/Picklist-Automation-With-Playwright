import express from 'express';
const app = express();
import 'dotenv/config';
import cors from 'cors';
import { Server } from 'socket.io';
import http from 'http';
import picklistRoutes from './routes/picklist/picklist.routes.js';
import { globalErrorHandler } from './middlewares/error.middleware.js';

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    // origin: 'https://autopic.netlify.app',
    origin: 'http://localhost:5173',
    // Your frontend URL (Vite default)
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Make io available globally
global.io = io;

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);
  socket.join(socket.id);

  socket.emit('connected', {
    message: 'Connected to server',
    socketId: socket.id,
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// middleware setting
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(
  cors({
    // origin: 'https://autopic.netlify.app',
    origin: 'http://localhost:5173',
    // Your frontend URL
    credentials: true,
  })
);

// Make io available in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    socketConnections: io.engine.clientsCount,
    timestamp: new Date().toISOString(),
  });
});

// routes middleware
app.use('/api/v1/picklist', picklistRoutes);

// Error handling middleware
app.use(globalErrorHandler);

// 404 handler
app.use('/*path', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// IMPORTANT: Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 WebSocket server ready`);
});

export { app, server, io };
