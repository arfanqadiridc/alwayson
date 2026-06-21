import { Injectable, NgZone } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private dbPromise: Promise<IDBPDatabase>;

  // True = socket is connected to server, False = server unreachable
  private _isOnline$ = new BehaviorSubject<boolean>(navigator.onLine);

  constructor(private zone: NgZone, private authService: AuthService) {
    this.dbPromise = openDB('alwayson-db', 2, {
      upgrade(db, oldVersion) {
        // Store for messages
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', {
            keyPath: 'id',
            autoIncrement: true
          });
          messageStore.createIndex('room', 'room');
          messageStore.createIndex('status', 'status');
        }

        // Store for pending messages to sync when back online
        if (!db.objectStoreNames.contains('pending_sync')) {
          db.createObjectStore('pending_sync', {
            keyPath: 'localId',
            autoIncrement: true
          });
        }
      }
    });

    // Browser network events (coarse signal — supplemented by socket events)
    window.addEventListener('online',  () => this.zone.run(() => this._isOnline$.next(true)));
    window.addEventListener('offline', () => this.zone.run(() => this._isOnline$.next(false)));
  }

  /** Derives an AES-GCM 256-bit symmetric encryption key derived from JWT token secret */
  private async getEncryptionKey(): Promise<CryptoKey | null> {
    const token = this.authService.getToken();
    if (!token) return null;

    try {
      const enc = new TextEncoder();
      // Derive key from the signature portion of the JWT (last 32 characters)
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(token.slice(-32)),
        "PBKDF2",
        false,
        ["deriveKey"]
      );

      // Stable salt for key derivation
      const salt = enc.encode("alwayson-offline-salt-9823");

      return await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 1000,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    } catch (e) {
      console.error('[Crypto] Key derivation failed:', e);
      return null;
    }
  }

  private async encryptData(obj: any): Promise<string | null> {
    try {
      const key = await this.getEncryptionKey();
      if (!key) return null;

      const enc = new TextEncoder();
      const encodedData = enc.encode(JSON.stringify(obj));

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
      );

      // Combine IV + Encrypted Data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (e) {
      console.error('[Crypto] Encryption failed:', e);
      return null;
    }
  }

  private async decryptData(encryptedStr: string): Promise<any | null> {
    try {
      const key = await this.getEncryptionKey();
      if (!key) return null;

      const combined = new Uint8Array(
        atob(encryptedStr).split("").map(c => c.charCodeAt(0))
      );
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      // Decryption will fail if logged out or using different user credentials
      return null;
    }
  }

  /** Call this when the Socket.IO socket connects */
  setOnline() {
    this.zone.run(() => this._isOnline$.next(true));
  }

  /** Call this when the Socket.IO socket disconnects / errors */
  setOffline() {
    this.zone.run(() => this._isOnline$.next(false));
  }

  get isOnline$(): Observable<boolean> {
    return this._isOnline$.asObservable();
  }

  isOnline(): boolean {
    return this._isOnline$.value;
  }

  // ── Message cache ──

  async saveMessage(message: any) {
    if (!this.authService.isLoggedIn()) return;
    if (!message?.id) return;

    // Plaintext indexing keys for fast queries
    const record: any = {
      id: message.id,
      room: message.room,
      status: message.status
    };

    // Encrypted payload properties
    const payload = {
      sender: message.sender,
      text: message.text,
      createdAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      receivedAt: message.receivedAt,
      readAt: message.readAt
    };

    const encrypted = await this.encryptData(payload);
    if (encrypted) {
      record.encryptedPayload = encrypted;
      const db = await this.dbPromise;
      await db.put('messages', record);
    }
  }

  async getMessagesByRoom(room: string): Promise<any[]> {
    if (!this.authService.isLoggedIn()) return [];
    const db = await this.dbPromise;
    const all = await db.getAllFromIndex('messages', 'room', room);

    const decryptedList: any[] = [];
    for (const record of all) {
      if (record.encryptedPayload) {
        const payload = await this.decryptData(record.encryptedPayload);
        if (payload) {
          decryptedList.push({
            id: record.id,
            room: record.room,
            status: record.status,
            ...payload
          });
        }
      }
    }

    // Sort ascending by createdAt string (yyyy-MM-dd HH:mm:ss sorts lexicographically)
    return decryptedList.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }

  async updateMessageStatus(id: any, status: number, deliveredAt?: string, receivedAt?: string, readAt?: string) {
    if (!this.authService.isLoggedIn()) return;
    const db = await this.dbPromise;
    const record = await db.get('messages', id);
    if (record) {
      if (status > (record.status ?? -1)) {
        record.status = status;

        if (record.encryptedPayload) {
          const payload = await this.decryptData(record.encryptedPayload);
          if (payload) {
            if (deliveredAt) payload.deliveredAt = deliveredAt;
            if (receivedAt)  payload.receivedAt  = receivedAt;
            if (readAt)      payload.readAt      = readAt;
            record.encryptedPayload = await this.encryptData(payload);
          }
        }

        await db.put('messages', record);
      }
    }
  }

  // ── Pending sync queue ──

  async addPendingSync(message: { room: string; sender: string; content: string }) {
    if (!this.authService.isLoggedIn()) return null;

    const payload = {
      room: message.room,
      sender: message.sender,
      content: message.content,
      queuedAt: new Date().toISOString()
    };

    const encrypted = await this.encryptData(payload);
    if (encrypted) {
      const db = await this.dbPromise;
      return await db.add('pending_sync', { encryptedPayload: encrypted });
    }
    return null;
  }

  async getPendingSync(): Promise<any[]> {
    if (!this.authService.isLoggedIn()) return [];
    const db = await this.dbPromise;
    const all = await db.getAll('pending_sync');

    const decryptedList: any[] = [];
    for (const record of all) {
      if (record.encryptedPayload) {
        const payload = await this.decryptData(record.encryptedPayload);
        if (payload) {
          decryptedList.push({
            localId: record.localId,
            ...payload
          });
        }
      }
    }
    return decryptedList;
  }

  async removePendingSync(localId: number) {
    if (!this.authService.isLoggedIn()) return;
    const db = await this.dbPromise;
    await db.delete('pending_sync', localId);
  }

  /** Wipes all local chat history and pending messages if explicitly requested */
  async clearAllData() {
    const db = await this.dbPromise;
    const tx = db.transaction(['messages', 'pending_sync'], 'readwrite');
    await tx.objectStore('messages').clear();
    await tx.objectStore('pending_sync').clear();
    await tx.done;
    console.log('[Security] IndexedDB wiped successfully.');
  }
}
