const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'my_secret_key_32_characters_long'; // Must be 32 chars
const ENCRYPTION_IV = process.env.ENCRYPTION_IV || 'my_secret_iv_16_'; // Must be 16 chars

/**
 * Encrypts clear text into AES-256-CBC hex string.
 * @param {string} text - Plain text password
 * @returns {string} Encrypted cipher text
 */
function encrypt(text) {
  if (!text) return null;
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    Buffer.from(ENCRYPTION_IV)
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * Decrypts AES-256-CBC hex string back to clear text.
 * @param {string} encryptedText - Encrypted cipher text
 * @returns {string} Plain text password
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY),
      Buffer.from(ENCRYPTION_IV)
    );
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Şifre çözme hatası:', error.message);
    return 'DECRYPTION_ERROR';
  }
}

module.exports = {
  encrypt,
  decrypt
};
