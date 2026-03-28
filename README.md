# 📦 Picklist Automation with Playwright

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Playwright](https://img.shields.io/badge/Playwright-Automation-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🚀 Overview

This project automates the **end-to-end picklist generation workflow**
including:

- OMS login
- Order filtering
- Picklist & packlog export
- ZIP extraction
- Rack space export
- File synchronization
- Upload to ScanReturn
- Final PDF generation

---

## ✨ Features

✅ Fully automated workflow\
✅ Multi-channel support\
✅ Real-time progress via Socket.IO\
✅ Smart file handling (CSV + ZIP)\
✅ Error handling with custom API errors\
✅ Production-ready structure

---

## 📁 Project Structure

    src/
     ├── picklistFiles/
     │    ├── ajio/
     │    ├── myntra/
     │    ├── nykaa/
     │    ├── tatacliq/
     │    ├── channelPdf/
     │
     ├── utils/
     │    └── ApiError.js

---

## ⚙️ Installation

```bash
npm install playwright adm-zip
npx playwright install
```

---

## 🔐 Environment Setup

Create `.env` file:

    EMAIL=your_email
    PASSWORD=your_password

---

## 🧪 Usage

```js
import { generatePicklist } from './script.js';

const result = await generatePicklist('myntra');
console.log(result);
```

---

## 📡 Socket Events

Step Description

---

start Process started
login Logging in
picklist Fetching picklist
download Downloading files
upload Uploading files
complete Done

---

## 🔄 Workflow

1.  Cleanup old files\
2.  Login to OMS\
3.  Apply channel filter\
4.  Download picklist CSV\
5.  Export packlog\
6.  Extract ZIP files\
7.  Export rack space\
8.  Upload all files\
9.  Download final PDF

---

## 📄 Output Example

    myntra/
     ├── myntra_picklist.csv
     ├── myntra_orders_info.csv
     ├── myntra_rack_space.csv

    channelPdf/
     └── myntra_picklist.pdf

---

## ⚠️ Important Notes

- Use `headless: true` in production\
- Keep selectors updated\
- Ensure stable internet

---

## 🛠 Tech Stack

- Node.js\
- Playwright\
- Socket.IO\
- Adm-Zip

---

## 📌 Future Enhancements

- Parallel execution\
- Retry mechanism\
- Dashboard UI\
- Logging system

---

## 👨‍💻 Author

Sachin Automation System 🚀
