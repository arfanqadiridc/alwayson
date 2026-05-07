import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  private rsaParams = {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  };

  /**
   * Generates a new RSA Key Pair for E2EE.
   */
  async generateKeyPair(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
      this.rsaParams,
      true, // extractable
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Export Key to String (Base64)
   */
  async exportKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey(
      key.type === 'public' ? 'spki' : 'pkcs8',
      key
    );
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  /**
   * Import Key from String
   */
  async importKey(keyStr: string, type: 'public' | 'private'): Promise<CryptoKey> {
    const binary = atob(keyStr);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return await window.crypto.subtle.importKey(
      type === 'public' ? 'spki' : 'pkcs8',
      bytes.buffer,
      this.rsaParams,
      true,
      type === 'public' ? ["encrypt"] : ["decrypt"]
    );
  }

  /**
   * Encrypt Private Key with User Password (PBKDF2 + AES-GCM)
   */
  async encryptPrivateKey(privateKey: CryptoKey, password: string): Promise<string> {
    const exportedKey = await window.crypto.subtle.exportKey("pkcs8", privateKey);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const baseKey = await this.deriveKeyFromPassword(password, salt);
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      baseKey,
      exportedKey
    );

    // Combine Salt + IV + EncryptedData for storage
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt Private Key using User Password
   */
  async decryptPrivateKey(encryptedStr: string, password: string): Promise<CryptoKey> {
    const combined = new Uint8Array(atob(encryptedStr).split("").map(c => c.charCodeAt(0)));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);

    const baseKey = await this.deriveKeyFromPassword(password, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      baseKey,
      data
    );

    return await this.importKey(btoa(String.fromCharCode(...new Uint8Array(decrypted))), 'private');
  }

  private async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );
    return await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * E2EE Encryption: RSA Encrypt a message
   */
  async encryptMessage(message: string, publicKey: CryptoKey): Promise<string> {
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
      this.rsaParams,
      publicKey,
      enc.encode(message)
    );
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  }

  /**
   * E2EE Decryption: RSA Decrypt a message
   */
  async decryptMessage(encryptedStr: string, privateKey: CryptoKey): Promise<string> {
    const binary = atob(encryptedStr);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const decrypted = await window.crypto.subtle.decrypt(
      this.rsaParams,
      privateKey,
      bytes.buffer
    );
    return new TextDecoder().decode(decrypted);
  }
}
