import { Injectable, NgZone } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private dbPromise: Promise<IDBPDatabase>;

  // True = socket is connected to server, False = server unreachable
  private _isOnline$ = new BehaviorSubject<boolean>(navigator.onLine);

  constructor(private zone: NgZone) {
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
    if (!message?.id) return;           // skip messages without a DB id
    const db = await this.dbPromise;
    await db.put('messages', message);
  }

  async getMessagesByRoom(room: string): Promise<any[]> {
    const db = await this.dbPromise;
    const all = await db.getAllFromIndex('messages', 'room', room);
    // Sort ascending by createdAt string (yyyy-MM-dd HH:mm:ss sorts lexicographically)
    return all.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }

  async updateMessageStatus(id: number, status: number) {
    const db = await this.dbPromise;
    const msg = await db.get('messages', id);
    if (msg && status > (msg.status ?? -1)) {
      msg.status = status;
      await db.put('messages', msg);
    }
  }

  // ── Pending sync queue ──

  async addPendingSync(message: { room: string; sender: string; content: string }) {
    const db = await this.dbPromise;
    return await db.add('pending_sync', { ...message, queuedAt: new Date().toISOString() });
  }

  async getPendingSync(): Promise<any[]> {
    const db = await this.dbPromise;
    return await db.getAll('pending_sync');
  }

  async removePendingSync(localId: number) {
    const db = await this.dbPromise;
    await db.delete('pending_sync', localId);
  }
}
