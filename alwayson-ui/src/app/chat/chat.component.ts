import { Component, OnInit, OnDestroy, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { SocketService } from '../socket.service';
import { AuthService } from '../auth.service';
import { CryptoService } from '../crypto.service';
import { OfflineSyncService } from '../offline-sync.service';
import { RightsService } from '../rights.service';
import { VideoCallComponent } from '../video-call/video-call.component';

export interface ChatMessage {
  id?: number;
  sender: string;
  text: string;
  isSelf: boolean;
  /**
   * Status codes (same as server):
   *  -1 = pending  (queued offline, awaiting sync)
   *   0 = sent     (server persisted – single grey ✓)
   *   1 = delivered (server fanned out to room – double grey ✓✓)
   *   2 = received  (recipient device received – double grey ✓✓)
   *   3 = read      (recipient opened chat – blue ✓✓)
   */
  status: number;
  // Lifecycle timestamps
  createdAt?: string;
  deliveredAt?: string;
  receivedAt?: string;
  readAt?: string;
}

type SidebarTab = 'groups' | 'dms';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, VideoCallComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy {
  @ViewChild(VideoCallComponent) videoCall!: VideoCallComponent;
  readonly API = 'http://localhost:8080';

  activeTab: SidebarTab = 'groups';
  rooms: string[] = [];
  allUsers: any[] = [];

  activeRoom = '';
  activeRoomLabel = '';
  isDmRoom = false;

  chatHistory: ChatMessage[] = [];
  messageText = '';
  currentUser = '';

  isFocused = true;
  whoIsTyping = '';
  typingTimeout: any;

  isOnline = true; // Reflects socket connection state
  private syncInProgress = false;

  private myPrivateKey?: CryptoKey;
  private peerPublicKeys: Map<string, CryptoKey> = new Map();

  joinedRooms = new Set<string>();
  private subscriptions: Subscription[] = [];

  toasts: { sender: string; room: string; msg: string }[] = [];

  constructor(
    private socketService: SocketService,
    private authService: AuthService,
    private router: Router,
    private http: HttpClient,
    private cryptoService: CryptoService,
    private offlineService: OfflineSyncService,
    public rightsService: RightsService
  ) { }

  @HostListener('window:focus') onFocus() {
    this.isFocused = true;
    this.markVisibleAsRead();
  }
  @HostListener('window:blur') onBlur() { this.isFocused = false; }

  async ngOnInit() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.currentUser = this.authService.getCurrentUser() || 'Unknown';

    await this.socketService.connect();
    this.socketService.registerUser(this.currentUser);

    // ── Wire socket connectivity into OfflineSyncService ──
    this.subscriptions.push(
      this.socketService.onConnect$.subscribe(async () => {
        this.offlineService.setOnline();
        this.isOnline = true;
        await this.flushPendingSync();
      }),
      this.socketService.onDisconnect$.subscribe(() => {
        this.offlineService.setOffline();
        this.isOnline = false;
      })
    );

    // Initial connectivity state from socket
    this.isOnline = this.socketService.isConnected();
    this.offlineService.isOnline$
      .subscribe(online => { this.isOnline = online; });

    // ── E2EE Key Synchronization ──
    await this.syncE2EEKeys();

    // ── Join ALL group rooms ──
    for (const room of this.rooms) {
      this.socketService.joinRoom(room);
      this.joinedRooms.add(room);
    }

    // ── Load user list ──
    try {
      const employees = await firstValueFrom(this.http.get<any[]>(`${this.API}/api/employees`));
      this.allUsers = employees.filter((e: any) => e.username !== this.currentUser);
    } catch (e) {
      console.warn('[AlwaysOn] Could not load employee list:', e);
      try {
        const users = await firstValueFrom(this.http.get<string[]>(`${this.API}/api/users`));
        this.allUsers = users.filter((u: string) => u !== this.currentUser).map(u => ({ username: u, name: u }));
      } catch (e2) {
        console.error('[AlwaysOn] Fatal: Could not load any user list');
      }
    }

    // ── Load dynamic rooms ──
    try {
      this.rooms = await firstValueFrom(this.http.get<string[]>(`${this.API}/api/rooms`));
    } catch (e) {
      console.warn('[AlwaysOn] Could not load rooms:', e);
      this.rooms = ['general', 'engineering', 'support', 'random'];
    }

    // ── Open default room ──
    await this.openRoom('general', false);

    // ── Wire up reactive listeners ──
    this.subscriptions.push(
      this.socketService.onNewMessage().subscribe(async (msg: any) => {
        if (msg.sender !== 'System' && msg.content) {
          msg.content = await this.decryptContent(msg.content);
        }

        const isSelf = msg.sender === this.currentUser;

        // Persist to Offline DB (only if has server id)
        if (msg.id) this.offlineService.saveMessage(msg);

        if (!isSelf && msg.sender !== 'System') {
          if (msg.room === this.activeRoom && this.isFocused) {
            // User is actively looking at this room → mark Read (status=3)
            if (msg.id) this.socketService.sendStatusUpdate(msg.id, msg.room, 3);
          } else {
            // User is elsewhere → mark Received on device (status=2)
            if (msg.id) this.socketService.sendStatusUpdate(msg.id, msg.room, 2);
            this.showToast(msg.sender, msg.room, msg.content ?? '');
          }
        }

        // Render only for the active room; never echo own messages from server
        if (!isSelf && msg.room === this.activeRoom) {
          this.chatHistory.push(this.mapServerMessage(msg, false));
          this.scrollToBottom();
        }
      }),

      this.socketService.onStatusUpdate().subscribe((data: any) => {
        const target = this.chatHistory.find(m => m.id === data.id);
        if (target && data.status > target.status) {
          target.status = data.status;
          // Attach timestamp fields if provided by server
          if (data.deliveredAt) target.deliveredAt = data.deliveredAt;
          if (data.receivedAt) target.receivedAt = data.receivedAt;
          if (data.readAt) target.readAt = data.readAt;
          // Also update IndexedDB cache
          if (data.id) {
            this.offlineService.updateMessageStatus(
              data.id,
              data.status,
              data.deliveredAt,
              data.receivedAt,
              data.readAt
            );
          }
        }
      }),

      this.socketService.onTyping().subscribe((data: any) => {
        if (data.room === this.activeRoom && data.sender !== this.currentUser) {
          this.whoIsTyping = data.typing ? `${data.sender} is typing…` : '';
          clearTimeout(this.typingTimeout);
          if (data.typing) this.typingTimeout = setTimeout(() => { this.whoIsTyping = ''; }, 3000);
        }
      })
    );
  }

  private mapServerMessage(msg: any, isSelf: boolean): ChatMessage {
    return {
      id: msg.id,
      sender: msg.sender,
      text: msg.content ?? '',
      isSelf,
      status: msg.status ?? 0,
      createdAt: msg.createdAt,
      deliveredAt: msg.deliveredAt,
      receivedAt: msg.receivedAt,
      readAt: msg.readAt
    };
  }

  // ── Room navigation ──
  async openRoom(roomId: string, isDm: boolean, dmPeer?: string) {
    this.activeRoom = roomId;
    this.isDmRoom = isDm;
    this.activeRoomLabel = isDm ? (dmPeer ?? roomId) : roomId;
    this.chatHistory = [];
    this.whoIsTyping = '';

    if (!isDm && !this.joinedRooms.has(roomId)) {
      this.socketService.joinRoom(roomId);
      this.joinedRooms.add(roomId);
    }

    // Load from Offline DB first (instant render)
    const offlineHistory = await this.offlineService.getMessagesByRoom(roomId);
    if (offlineHistory.length > 0) {
      for (const msg of offlineHistory) {
        let text = msg.content;
        if (msg.sender !== 'System') text = await this.decryptContent(text);
        this.chatHistory.push({
          id: msg.id,
          sender: msg.sender,
          text,
          isSelf: msg.sender === this.currentUser,
          status: msg.status ?? 0,
          createdAt: msg.createdAt,
          deliveredAt: msg.deliveredAt,
          receivedAt: msg.receivedAt,
          readAt: msg.readAt
        });
      }
      this.scrollToBottom();
    }

    const url = isDm
      ? `${this.API}/api/messages/dm/${this.currentUser}/${dmPeer}`
      : `${this.API}/api/messages/room/${roomId}`;

    try {
      const history = await firstValueFrom(this.http.get<any[]>(url));
      this.chatHistory = [];
      for (const msg of history) {
        let text = msg.content;
        if (msg.sender !== 'System') text = await this.decryptContent(text);
        const mapped = this.mapServerMessage({ ...msg, content: text }, msg.sender === this.currentUser);
        this.chatHistory.push(mapped);
        if (msg.id) this.offlineService.saveMessage(msg);
      }
      this.markVisibleAsRead();
      this.scrollToBottom();
    } catch (e) {
      console.warn('[AlwaysOn] History fetch failed, using offline data:', url);
    }
  }

  openGroupRoom(room: string) { this.openRoom(room, false); }

  openDmRoom(peer: string) {
    const sorted = [this.currentUser, peer].sort();
    this.openRoom(`dm_${sorted[0]}_${sorted[1]}`, true, peer);
  }

  markVisibleAsRead() {
    for (const m of this.chatHistory) {
      if (!m.isSelf && m.sender !== 'System' && m.status < 3 && m.id) {
        m.status = 3;
        this.socketService.sendStatusUpdate(m.id, this.activeRoom, 3);
        this.offlineService.updateMessageStatus(m.id, 3);
      }
    }
  }

  onType() { this.socketService.sendTyping(this.activeRoom, this.currentUser, true); }

  async createGroup() {
    const name = prompt('Enter group name:');
    if (!name) return;
    try {
      await firstValueFrom(this.http.post(`${this.API}/api/rooms`, { name }));
      this.rooms = await firstValueFrom(this.http.get<string[]>(`${this.API}/api/rooms`));
    } catch (e) {
      alert('Failed to create group');
    }
  }

  async sendMessage() {
    if (!this.messageText.trim() || !this.activeRoom) return;
    const text = this.messageText;
    this.messageText = '';

    const encryptedText = await this.encryptContent(text);

    const localMsg: ChatMessage = {
      sender: this.currentUser,
      text,
      isSelf: true,
      status: -1,
      createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    this.chatHistory.push(localMsg);
    this.scrollToBottom();

    if (this.offlineService.isOnline()) {
      const ack = await this.socketService.sendMessage(this.activeRoom, this.currentUser, encryptedText);
      if (ack?.id) {
        localMsg.id = ack.id;
        localMsg.status = ack.status ?? 0;
        localMsg.createdAt = ack.createdAt ?? localMsg.createdAt;
        // Persist to IndexedDB
        this.offlineService.saveMessage({ ...ack, content: encryptedText });
      }
    } else {
      console.log('[Offline] Queueing message for sync…');
      const localId = await this.offlineService.addPendingSync({
        room: this.activeRoom,
        sender: this.currentUser,
        content: encryptedText
      });
      (localMsg as any)._localSyncId = localId;
    }
  }

  /** Flush all queued offline messages once connection is restored */
  private async flushPendingSync() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    try {
      const pending = await this.offlineService.getPendingSync();
      for (const item of pending) {
        const ack = await this.socketService.sendMessage(item.room, item.sender, item.content);
        if (ack?.id) {
          await this.offlineService.removePendingSync(item.localId);
          // Update the matching pending local message in chatHistory
          const local = this.chatHistory.find(
            m => (m as any)._localSyncId === item.localId && m.status === -1
          );
          if (local) {
            local.id = ack.id;
            local.status = ack.status ?? 0;
            local.createdAt = ack.createdAt ?? local.createdAt;
            this.offlineService.saveMessage({ ...ack, content: item.content });
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  // ── E2EE ──
  private async syncE2EEKeys() {
    try {
      const keys: any = await firstValueFrom(this.http.get(`${this.API}/api/keys/download`));
      if (keys.publicKey && keys.encryptedPrivateKey) {
        this.myPrivateKey = await this.cryptoService.decryptPrivateKey(keys.encryptedPrivateKey, 'password123');
        console.log('[E2EE] Private key recovered from server.');
      } else {
        const pair = await this.cryptoService.generateKeyPair();
        this.myPrivateKey = pair.privateKey;
        const pubStr = await this.cryptoService.exportKey(pair.publicKey);
        const encPrivStr = await this.cryptoService.encryptPrivateKey(pair.privateKey, 'password123');
        await firstValueFrom(this.http.post(`${this.API}/api/keys/upload`, { publicKey: pubStr, encryptedPrivateKey: encPrivStr }));
        console.log('[E2EE] New key pair generated and synced to server.');
      }
    } catch (e) {
      console.warn('[E2EE] Key sync failed, using temporary local keys:', e);
    }
  }

  private async getPeerPublicKey(username: string): Promise<CryptoKey | undefined> {
    if (this.peerPublicKeys.has(username)) return this.peerPublicKeys.get(username);
    try {
      const resp: any = await firstValueFrom(this.http.get(`${this.API}/api/keys/public/${username}`));
      const key = await this.cryptoService.importKey(resp.publicKey, 'public');
      this.peerPublicKeys.set(username, key);
      return key;
    } catch (e) {
      return undefined;
    }
  }

  private async encryptContent(text: string): Promise<string> {
    if (this.isDmRoom) {
      const peer = this.activeRoomLabel;
      const pubKey = await this.getPeerPublicKey(peer);
      if (pubKey) return await this.cryptoService.encryptMessage(text, pubKey);
    }
    return text;
  }

  private async decryptContent(encrypted: string): Promise<string> {
    if (this.myPrivateKey && this.isDmRoom) {
      try {
        return await this.cryptoService.decryptMessage(encrypted, this.myPrivateKey);
      } catch (e) {
        return encrypted;
      }
    }
    return encrypted;
  }

  // ── Helpers ──
  showToast(sender: string, room: string, text: string) {
    this.toasts.push({ sender, room, msg: text });
    setTimeout(() => this.toasts.shift(), 5000);
  }

  scrollToBottom() {
    setTimeout(() => {
      const el = document.querySelector('.chat-history');
      if (el) el.scrollTop = el.scrollHeight;
    }, 60);
  }

  /**
   * Format a timestamp string for display in the tick tooltip.
   * Converts "yyyy-MM-dd HH:mm:ss" → "HH:mm" (today) or "MMM d, HH:mm" (other days).
   */
  formatTickTime(ts: string | undefined): string {
    if (!ts) return '';
    try {
      const d = new Date(ts.replace(' ', 'T') + 'Z'); // treat as UTC
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  }

  logout() {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.subscriptions = [];
    this.authService.logout();
    this.socketService.leaveAllRooms([...this.joinedRooms]);
    this.socketService.disconnect();
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.socketService.disconnect();
  }
}
