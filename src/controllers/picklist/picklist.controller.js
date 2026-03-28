import { generateFullFillFile } from '../../services/picklist/downloadUnfullFillOrders.service.js';
import { generatePicklist } from '../../services/picklist/generatePicklist.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const fullFill = asyncHandler(async (req, res) => {
  const { channel, user, socketId } = req.body; // Make sure socketId is extracted

  console.log('📦 Fullfill controller called with:', { channel, user, socketId });

  if (!socketId) {
    console.log('⚠️ No socketId provided in request body');
  }

  // Emit initial progress
  if (socketId && global.io) {
    console.log(`📡 Emitting init progress to ${socketId}`);
    global.io.to(socketId).emit('fullfill-progress', {
      step: 'init',
      message: 'Starting unfulfilled orders download...',
      timestamp: new Date().toISOString(),
    });
  } else {
    console.log('⚠️ Cannot emit init progress:', { socketId, ioExists: !!global.io });
  }

  const result = await generateFullFillFile(channel, user, socketId);
  const filePath = result.fileData;

  // Emit completion
  if (socketId && global.io) {
    global.io.to(socketId).emit('fullfill-progress', {
      step: 'file-ready',
      message: 'File ready for download!',
      data: { filePath, channel, user },
      timestamp: new Date().toISOString(),
    });
  }

  return res.download(filePath, 'UpdateInStockQtyAnd_orLastPurchasePrice.csv');
});

const picklist = asyncHandler(async (req, res) => {
  const { channel } = req.body;
  const socketId = req.query.socketId || req.body.socketId;

  console.log('Generating picklist for channel:', channel);
  console.log('Socket ID:', socketId);

  // Emit initial progress
  if (socketId && global.io) {
    global.io.to(socketId).emit('picklist-progress', {
      step: 'start',
      message: 'Starting picklist generation...',
      timestamp: new Date().toISOString(),
    });
  }

  const result = await generatePicklist(channel, socketId);
  const filePath = result.fileData;

  // Emit completion message
  if (socketId && global.io) {
    global.io.to(socketId).emit('picklist-progress', {
      step: 'complete',
      message: 'Picklist generated successfully!',
      data: { filePath, channel },
      timestamp: new Date().toISOString(),
    });
  }

  return res.download(filePath, `${channel}_picklist.pdf`);
});

export { fullFill, picklist };
