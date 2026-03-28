import express from 'express';
import { fullFill, picklist } from '../../controllers/picklist/picklist.controller.js';

const router = express.Router();

// Route for downloading unfulfilled orders
router.post('/fullfill', fullFill);

// Route for generating picklist with socket.io support
router.post('/generate', picklist);

// Optional: Get progress status for a specific socket
router.get('/progress/:socketId', (req, res) => {
  const { socketId } = req.params;
  // You can implement progress tracking here if needed
  res.json({
    success: true,
    message: 'Progress tracking endpoint',
    socketId,
  });
});

export default router;
