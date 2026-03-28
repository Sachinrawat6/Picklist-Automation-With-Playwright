import { chromium } from 'playwright';
import { ApiError } from '../../utils/ApiError.js';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs';

// Progress emit karne ka helper function
const emitProgress = (socketId, step, message, data = {}) => {
  if (socketId && global.io) {
    global.io.to(socketId).emit('picklist-progress', {
      step,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
    console.log(`Progress emitted to ${socketId}: ${step} - ${message}`);
  }
};

const generatePicklist = async (channel, socketId = null) => {
  // Agar socketId diya gaya hai to us specific client ko emit karein
  const emitToClient = (step, message, data = {}) => {
    if (socketId && global.io) {
      global.io.to(socketId).emit('picklist-progress', {
        step,
        message,
        data,
        timestamp: new Date().toISOString(),
      });
    } else {
      emitProgress(step, message, data);
    }
  };

  const channels = {
    ajio: 'checkbox46180',
    myntra: 'checkbox46241',
    nykaa: 'checkbox47950',
    tatacliq: 'checkbox46240',
    allchannel: 'filterOptionsSelectAll_channel_company_id',
  };

  const picklistBaseDir = path.join(process.cwd(), 'src', 'picklistFiles');
  const channels2 = [
    'ajio',
    'myntra',
    'nykaa',
    'tatacliq',
    'channelPdf',
    'extracted_orders_info',
    'rackspace',
  ];

  emitToClient('start', 'Process started: Cleaning up old files...');

  for (const channelName of channels2) {
    const channelFolderPath = path.join(picklistBaseDir, channelName);

    if (fs.existsSync(channelFolderPath)) {
      try {
        fs.rmSync(channelFolderPath, { recursive: true, force: true });
        emitToClient('cleanup', `Cleaned up folder: ${channelName}`);
      } catch (error) {
        console.log(`Error deleting channel folder ${channelName}:`, error.message);
      }
    }
  }

  if (!channel) {
    throw new ApiError(400, 'channel is required');
  }

  emitToClient('launch', 'Launching browser...');

  const browser = await chromium.launch({
    headless: false, // Production me headless: true rakhein
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;

  const channelClean = channel.trim().toLowerCase();

  // *******************************************************************************************
  //   ********************** PART 1 OMS LOGIN AND ORDERS DOWNLOAD ***********************
  // *******************************************************************************************

  emitToClient('login', 'Logging into OMS Guru...');

  await page.goto('https://client.omsguru.com/');
  await page.getByPlaceholder('Email Address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();

  emitToClient('orders', 'Navigating to orders page...');

  await page.goto('https://client.omsguru.com/orders/newOrders');
  await page.locator('#forceWarehouseSelector').selectOption('22784');

  emitToClient('filter', `Applying filter for ${channelClean} channel...`);

  await page.locator('[filter-field="channel_company_id"]').click();
  const popover = page.locator('#popoverchannel_company_id:visible');
  await popover.waitFor({ state: 'visible' });
  await popover.locator(`#${channels[channelClean]}`).click();
  await popover.locator('button.editable-submit').click();

  emitToClient('filter-applied', `Filter applied successfully for ${channelClean}`);

  // ***********************************************************************************************
  // ***************************** PART 2 EXPORT PICKLIST ******************************************
  // ***********************************************************************************************

  const channelNameMapping = {
    myntra: 'Qurvii - Myntra PPMP',
    nykaa: 'Qurvii - Nykaa Fashion',
    ajio: 'Qurvii - Ajio Dropship',
    tatacliq: 'Qurvii - Tatacliq',
  };

  emitToClient('picklist', 'Navigating to picklists page...');

  await page.goto('https://client.omsguru.com/picklists');

  if (!fs.existsSync(picklistBaseDir)) {
    fs.mkdirSync(picklistBaseDir, { recursive: true });
  }

  const channelFolder = path.join(picklistBaseDir, channelClean);

  if (fs.existsSync(channelFolder)) {
    try {
      fs.rmSync(channelFolder, { recursive: true, force: true });
    } catch (error) {
      console.log(`Error cleaning up ${channelClean} folder:`, error.message);
    }
  }

  fs.mkdirSync(channelFolder, { recursive: true });
  emitToClient('folder', `Created folder for ${channelClean}`);

  const row = page
    .locator('tbody tr')
    .filter({ hasText: channelNameMapping[channelClean] })
    .first();

  emitToClient('view-picklist', 'Opening picklist details...');
  await row.locator('a[title="View picklist Details"]').click();

  emitToClient('download-picklist', 'Downloading picklist CSV...');
  const [finalDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV' }).click(),
  ]);

  const savePath = path.join(channelFolder, `${channelClean}_picklist.csv`);
  await finalDownload.saveAs(savePath);
  emitToClient('picklist-downloaded', 'Picklist CSV downloaded successfully');

  // ***********************************************************************************************
  // ***************************** PART 3 EXPORT PACKLOG ******************************************
  // ***********************************************************************************************

  emitToClient('packlog', 'Navigating to packlog page...');

  await page.goto('https://client.omsguru.com/invoice_pack_logs');
  const row2 = page
    .locator('tbody tr')
    .filter({ hasText: channelNameMapping[channelClean] })
    .first();

  emitToClient('view-packlog', 'Opening packlog details...');
  await row2.locator('a[title="View PackLog Details"]').click();

  page.on('dialog', async (dialog) => {
    console.log(dialog.message());
    await dialog.accept();
  });

  emitToClient('export-orders', 'Exporting orders...');
  await page.getByRole('link', { name: 'Export Orders' }).click();
  await page.getByRole('link', { name: 'Export Orders' }).click();

  emitToClient('waiting-notification', 'Waiting for export notification...');
  await page.locator('i.fa-bell').click();
  await page.waitForSelector('#ClientNotificationsList li.item');

  const exportLink = page
    .locator('#ClientNotificationsList li.item a[title="Click to download the exported orders"]')
    .first();

  emitToClient('download-zip', 'Downloading orders zip file...');
  const [download] = await Promise.all([page.waitForEvent('download'), exportLink.click()]);
  const zipPath = path.join(channelFolder, await download.suggestedFilename());
  await download.saveAs(zipPath);

  emitToClient('extract-zip', 'Extracting orders zip file...');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(channelFolder, true);

  const extractedFiles = fs.readdirSync(channelFolder);
  const csvFile = extractedFiles.find(
    (file) => file.endsWith('.csv') && !file.includes('picklist')
  );

  if (csvFile) {
    const finalFilePath = path.join(channelFolder, `${channelClean}_orders_info.csv`);
    if (fs.existsSync(finalFilePath)) fs.unlinkSync(finalFilePath);
    fs.renameSync(path.join(channelFolder, csvFile), finalFilePath);
    emitToClient('orders-ready', 'Orders info CSV ready');
  }

  fs.unlinkSync(zipPath);
  emitToClient('cleanup', 'Cleaned up temporary files');

  // ***********************************************************************************************
  // ***************************** PART 4 EXPORT RACK SPACE DETAILS ********************************
  // ***********************************************************************************************

  emitToClient('rackspace', 'Navigating to rack space page...');

  await page.goto('https://client.omsguru.com/rack_spaces');
  await page.locator('#warehouseSelector').selectOption('22784');
  await page.getByRole('button', { name: 'Related Actions' }).click();

  emitToClient('export-rackspace', 'Exporting rack space details...');
  await page.getByRole('link', { name: 'Export Rack Details' }).click();
  await page.locator('i.fa-bell').click();
  await page.waitForSelector('#ClientNotificationsList li.item');

  const exportLink2 = page
    .locator(
      '#ClientNotificationsList li.item a[title="Click here to download the rack space inventory export file"]'
    )
    .first();

  emitToClient('download-rackspace', 'Downloading rack space zip...');
  const [download2] = await Promise.all([page.waitForEvent('download'), exportLink2.click()]);
  const zipPath2 = path.join(channelFolder, await download2.suggestedFilename());
  await download2.saveAs(zipPath2);

  emitToClient('extract-rackspace', 'Extracting rack space zip...');
  const zip2 = new AdmZip(zipPath2);
  zip2.extractAllTo(channelFolder, true);

  const extractedFiles2 = fs.readdirSync(channelFolder);
  const csvFile2 = extractedFiles2.find((file) => file.endsWith('.csv') && file.includes('rack'));

  if (csvFile2) {
    const finalFilePath2 = path.join(channelFolder, `${channelClean}_rack_space.csv`);
    if (fs.existsSync(finalFilePath2)) fs.unlinkSync(finalFilePath2);
    fs.renameSync(path.join(channelFolder, csvFile2), finalFilePath2);
    emitToClient('rackspace-ready', 'Rack space CSV ready');
  }

  fs.unlinkSync(zipPath2);

  // ***********************************************************************************************
  // ***************************** PART 5 PICKLIST SYNCRONIZATION **********************************
  // ***********************************************************************************************

  const orders_info_file_path = path.join(channelFolder, `${channelClean}_orders_info.csv`);
  const picklist_file_path = path.join(channelFolder, `${channelClean}_picklist.csv`);
  const rackspace_file_path = path.join(channelFolder, `${channelClean}_rack_space.csv`);

  emitToClient('verify-files', 'Verifying downloaded files...');

  if (!fs.existsSync(orders_info_file_path)) {
    throw new ApiError(500, `Orders info file not found for ${channelClean}`);
  }
  if (!fs.existsSync(picklist_file_path)) {
    throw new ApiError(500, `Picklist file not found for ${channelClean}`);
  }
  if (!fs.existsSync(rackspace_file_path)) {
    throw new ApiError(500, `Rack space file not found for ${channelClean}`);
  }

  emitToClient('files-verified', 'All files verified successfully');

  emitToClient('uploading', 'Uploading files to scanreturn...');

  await page.goto('https://scanreturn3.netlify.app/uploads');
  const formattedChannel = channelClean.charAt(0).toUpperCase() + channelClean.slice(1);
  await page.waitForTimeout(3000);
  await page.waitForLoadState();
  await page.locator('select').selectOption(formattedChannel);

  emitToClient('upload-orders', 'Uploading orders info...');
  await page.waitForTimeout(1000);
  await page.locator('#file-upload').setInputFiles(orders_info_file_path);

  emitToClient('upload-picklist', 'Uploading picklist...');
  await page.waitForTimeout(1000);
  await page.locator('#rack-space-upload').nth(0).setInputFiles(picklist_file_path);

  emitToClient('upload-rackspace', 'Uploading rack space...');
  await page.waitForTimeout(1000);
  await page.locator('#rack-space-upload').nth(1).setInputFiles(rackspace_file_path);

  await page.waitForTimeout(1000);
  emitToClient('uploads-complete', 'All files uploaded successfully');

  // Create channel-specific pdf folder
  const pdfFolder = path.join(picklistBaseDir, 'channelPdf');
  if (!fs.existsSync(pdfFolder)) {
    fs.mkdirSync(pdfFolder, { recursive: true });
  }

  const tempPdfPath = path.join(pdfFolder, `${channelClean}_picklist_${Date.now()}.pdf`);
  const finalPdfPath = path.join(pdfFolder, `${channelClean}_picklist.pdf`);

  emitToClient('download-pdf', 'Downloading picklist PDF...');

  const [download_picklist] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Picklist' }).click(),
  ]);

  await download_picklist.saveAs(tempPdfPath);

  if (!fs.existsSync(tempPdfPath) || fs.statSync(tempPdfPath).size === 0) {
    throw new ApiError(500, `Failed to download PDF for ${channelClean}`);
  }

  if (fs.existsSync(finalPdfPath)) {
    try {
      fs.unlinkSync(finalPdfPath);
    } catch (error) {
      console.log(`Error deleting old PDF for ${channelClean}:`, error.message);
    }
  }

  fs.renameSync(tempPdfPath, finalPdfPath);

  if (!fs.existsSync(finalPdfPath)) {
    throw new ApiError(500, `PDF file not found at ${finalPdfPath} after save`);
  }

  emitToClient('complete', 'Process completed successfully!', {
    pdfPath: finalPdfPath,
    channel: channelClean,
  });

  await browser.close();

  return {
    fileData: finalPdfPath,
    message: `Picklist generated successfully for ${channelClean}`,
    channel: channelClean,
  };
};

export { generatePicklist };
