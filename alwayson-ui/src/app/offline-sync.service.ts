import { Injectable } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = openDB('alwayson-db', 1, {
      upgrade(db) {
        // Store for messages
        const messageStore = db.createObjectStore('messages', {
          keyPath: 'id',
          autoIncrement: true
        });
        messageStore.createIndex('room', 'room');
        messageStore.createIndex('status', 'status');

        // Store for pending messages to sync
        db.createObjectStore('pending_sync', {
          keyPath: 'id',
          autoIncrement: true
        });
      }
    });
  }

  async saveMessage(message: any) {
    const db = await this.dbPromise;
    await db.put('messages', message);
  }

  async getMessagesByRoom(room: string) {
    const db = await this.dbPromise;
    return await db.getAllFromIndex('messages', 'room', room);
  }

  async addPendingSync(message: any) {
    const db = await this.dbPromise;
    return await db.put('pending_sync', message);
  }

  async getPendingSync() {
    const db = await this.dbPromise;
    return await db.getAll('pending_sync');
  }

  async removePendingSync(id: number) {
    const db = await this.dbPromise;
    await db.delete('pending_sync', id);
  }

  isOnline(): boolean {
    return navigator.onLine;
  }
}
