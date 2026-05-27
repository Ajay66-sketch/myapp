// src/services/storageService.js
// Production-ready storage abstraction for study textbook uploads.
// Abstracted local storage that handles file writes, reads, and deletions safely.

const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

class StorageService {
  /**
   * Saves a file safely to the upload destination.
   */
  async saveFile(fileKey, buffer) {
    const filePath = path.join(UPLOAD_DIR, fileKey);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Retrieves file binary buffer from the storage.
   */
  async getFile(fileKey) {
    const filePath = path.join(UPLOAD_DIR, fileKey);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${fileKey}`);
    }
    return fs.promises.readFile(filePath);
  }

  /**
   * Removes a file from storage.
   */
  async deleteFile(fileKey) {
    const filePath = path.join(UPLOAD_DIR, fileKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

module.exports = new StorageService();
