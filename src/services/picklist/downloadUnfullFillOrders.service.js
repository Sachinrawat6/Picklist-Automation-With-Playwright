import { chromium } from 'playwright';
import { ApiError } from '../../utils/ApiError.js';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs';

// Helper function to emit progress
const emitProgress = (socketId, step, message, data = {}) => {
  if (socketId && global.io) {
    console.log(`📡 Emitting progress to ${socketId}: ${step} - ${message}`);
    global.io.to(socketId).emit('fullfill-progress', {
      step,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  } else {
    console.log(`⚠️ Cannot emit progress: socketId=${socketId}, io exists=${!!global.io}`);
  }
};

const generateFullFillFile = async (channel, user, socketId = null) => {
  console.log('🚀 Starting generateFullFillFile with:', { channel, user, socketId });

  const channels = {
    ajio: 'checkbox46180',
    myntra: 'checkbox46241',
    nykaa: 'checkbox47950',
    shopify: 'checkbox46242',
    tatacliq: 'checkbox46240',
    allchannel: 'filterOptionsSelectAll_channel_company_id',
  };

  if (!user) {
    emitProgress(socketId, 'error', 'User is required');
    throw new ApiError(400, 'User is required');
  }

  emitProgress(socketId, 'start', 'Starting unfulfilled orders download...', { channel, user });

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  emitProgress(socketId, 'browser-launch', 'Browser launched successfully');

  const context = await browser.newContext();
  const page = await context.newPage();
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;

  // *******************************************************************************************
  //   ********************** PART 1 OMS UNFULLFILL ORDERS DOWNLOAD ***********************
  // *******************************************************************************************

  emitProgress(socketId, 'navigate-oms', 'Navigating to OMS Guru...');
  await page.goto('https://client.omsguru.com/');

  emitProgress(socketId, 'login', 'Logging into OMS Guru...');
  await page.getByPlaceholder('Email Address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();

  emitProgress(socketId, 'navigate-orders', 'Navigating to unfulfillable orders...');
  await page.goto('https://client.omsguru.com/orders/unfulfillableOrders');
  await page.locator('#forceWarehouseSelector').selectOption('22784');

  emitProgress(socketId, 'filter-channel', `Applying filter for ${channel} channel...`);
  await page.locator('[filter-field="channel_company_id"]').click();
  const popover = page.locator('#popoverchannel_company_id:visible');
  await popover.waitFor({ state: 'visible' });
  await popover.locator(`#${channels[channel?.trim().toLowerCase()]}`).click();
  await popover.locator('button.editable-submit').click();

  emitProgress(socketId, 'export-orders', 'Exporting orders...');
  await Promise.all([
    page.waitForEvent('dialog').then((d) => d.accept()),
    page.locator('a[title="Export Orders"]').click(),
  ]);

  emitProgress(socketId, 'waiting-notification', 'Waiting for export notification...');
  await page.locator('i.fa-bell').click();
  await page.waitForSelector('#ClientNotificationsList li.item');

  const exportLink = page
    .locator('#ClientNotificationsList li.item a[title="Click to download the exported orders"]')
    .first();

  emitProgress(socketId, 'download-zip', 'Downloading orders zip file...');
  const [download] = await Promise.all([page.waitForEvent('download'), exportLink.click()]);
  const zipPath = path.join(process.cwd(), await download.suggestedFilename());
  await download.saveAs(zipPath);

  emitProgress(socketId, 'zip-downloaded', 'Orders zip file downloaded successfully');

  //   ******************************************************************************************
  //   ************************************* ZIP EXTRACT + RENAME ****************************
  // *********************************************************************************************

  emitProgress(socketId, 'extracting', 'Extracting zip file...');

  // folder path
  const extractPath = path.join(process.cwd(), 'src', 'picklistFiles', 'extracted_orders_info');

  // folder create if not exists
  if (!fs.existsSync(extractPath)) {
    fs.mkdirSync(extractPath, { recursive: true });
  }

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractPath, true);

  const extractedFiles = fs.readdirSync(extractPath);
  // find CSV file
  const csvFile = extractedFiles.find((file) => file.endsWith('.csv'));

  emitProgress(socketId, 'csv-found', `Found CSV file: ${csvFile}`);

  const finalFilePath = path.join(extractPath, 'orders_info.csv');
  if (fs.existsSync(finalFilePath)) fs.unlinkSync(finalFilePath);

  // rename csv
  fs.renameSync(path.join(extractPath, csvFile), finalFilePath);

  // delete zip
  fs.unlinkSync(zipPath);

  emitProgress(socketId, 'csv-ready', 'orders_info.csv is ready', {
    filePath: finalFilePath,
  });

  console.log('orders_info.csv ready at:', finalFilePath);

  // **********************************************************************************
  // ********************************** PART 2 RACKSPACE UPLOAD ********************
  // **********************************************************************************

  emitProgress(socketId, 'rackspace-start', 'Navigating to rackspace updater...');

  await page.goto('https://rackspaceupdater.netlify.app/');

  emitProgress(socketId, 'rackspace-user', `Selecting user: ${user}`);
  await page.locator('select').selectOption(user);

  emitProgress(socketId, 'rackspace-upload', 'Uploading orders info file...');
  await page.locator('input[type="file"]').setInputFiles(finalFilePath);

  const rackspaceFolder = path.join(process.cwd(), 'src', 'picklistFiles', 'rackspace');
  if (!fs.existsSync(rackspaceFolder)) fs.mkdirSync(rackspaceFolder);

  emitProgress(socketId, 'rackspace-download', 'Downloading updated stock file...');

  const [finalDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Stock' }).click(),
  ]);

  const savePath = path.join(rackspaceFolder, 'UpdateInStockQtyAnd_orLastPurchasePrice.csv');
  await finalDownload.saveAs(savePath);

  emitProgress(socketId, 'complete', 'Process completed successfully!', {
    filePath: savePath,
    channel,
    user,
  });

  console.log('Final stock file saved');
  await browser.close();

  return { success: true, fileData: savePath };
};

export { generateFullFillFile };
