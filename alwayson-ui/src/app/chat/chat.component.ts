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
  status: number; // -1=pending, 0=sent(✓), 1=delivered(✓✓), 2=read(blue ✓✓)
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
  readonly API = 'http://localhost:8080/alwayson-api';

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
  ) {}

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

    // ── 2a. E2EE Key Synchronization ──
    await this.syncE2EEKeys();

    // ── 3. Join ALL group rooms ──
    for (const room of this.rooms) {
      this.socketService.joinRoom(room);
      this.joinedRooms.add(room);
    }

    // ── 4. Load user list or employees if privileged ──
    try {
      // Always fetch from employees directory for the full list
      const employees = await firstValueFrom(this.http.get<any[]>(`${this.API}/api/employees`));
      this.allUsers = employees.filter((e: any) => e.username !== this.currentUser);
    } catch (e) {
      console.warn('[AlwaysOn] Could not load employee list:', e);
      // Fallback to database users if employees.json is unavailable
      try {
        const users = await firstValueFrom(this.http.get<string[]>(`${this.API}/api/users`));
        this.allUsers = users.filter((u: string) => u !== this.currentUser).map(u => ({ username: u, name: u }));
      } catch (e2) {
        console.error('[AlwaysOn] Fatal: Could not load any user list');
      }
    }

    // ── 4. Load dynamic rooms ──
    try {
      this.rooms = await firstValueFrom(this.http.get<string[]>(`${this.API}/api/rooms`));
    } catch (e) {
      console.warn('[AlwaysOn] Could not load rooms:', e);
      this.rooms = ['general', 'engineering', 'support', 'random'];
    }

    // ── 5. Open default room (Try offline first if necessary) ──
    await this.openRoom('general', false);

    // ── 6. Wire up reactive listeners ──
    this.subscriptions.push(
      this.socketService.onNewMessage().subscribe(async (msg: any) => {
        // ── E2EE Decryption ──
        if (msg.sender !== 'System' && msg.content) {
          msg.content = await this.decryptContent(msg.content);
        }

        const isSelf = msg.sender === this.currentUser;

        // Persist to Offline DB
        this.offlineService.saveMessage(msg);

        if (!isSelf && msg.sender !== 'System') {
          if (msg.room === this.activeRoom && this.isFocused) {
            // User is actively looking at this room → mark Read
            if (msg.id) this.socketService.sendStatusUpdate(msg.id, msg.room, 2);
          } else {
            // User is elsewhere → Delivered + toast
            if (msg.id) this.socketService.sendStatusUpdate(msg.id, msg.room, 1);
            this.showToast(msg.sender, msg.room, msg.content ?? '');
          }
        }

        // Render only for the active room, never echo own messages
        if (!isSelf && msg.room === this.activeRoom) {
          this.chatHistory.push({
            id:     msg.id,
            sender: msg.sender,
            text:   msg.content ?? '',
            isSelf: false,
            status: msg.status ?? 0
          });
          this.scrollToBottom();
        }
      }),

      this.socketService.onStatusUpdate().subscribe((data: any) => {
        const target = this.chatHistory.find(m => m.id === data.id);
        if (target && data.status > target.status) target.status = data.status;
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

  // ── Room navigation ──
  async openRoom(roomId: string, isDm: boolean, dmPeer?: string) {
    this.activeRoom     = roomId;
    this.isDmRoom       = isDm;
    this.activeRoomLabel = isDm ? (dmPeer ?? roomId) : roomId;
    this.chatHistory    = [];
    this.whoIsTyping    = '';

    // Groups: join if not already joined
    if (!isDm && !this.joinedRooms.has(roomId)) {
      this.socketService.joinRoom(roomId);
      this.joinedRooms.add(roomId);
    }

    // ── Load from Offline DB first ──
    const offlineHistory = await this.offlineService.getMessagesByRoom(roomId);
    if (offlineHistory.length > 0) {
      for (const msg of offlineHistory) {
        let text = msg.content;
        if (msg.sender !== 'System') text = await this.decryptContent(text);
        this.chatHistory.push({
          id: msg.id,
          sender: msg.sender,
          text: text,
          isSelf: msg.sender === this.currentUser,
          status: msg.status
        });
      }
      this.scrollToBottom();
    }

    const url = isDm
      ? `${this.API}/api/messages/dm/${this.currentUser}/${dmPeer}`
      : `${this.API}/api/messages/room/${roomId}`;

    try {
      const history = await firstValueFrom(this.http.get<any[]>(url));
      this.chatHistory = []; // Clear local cache to sync with server truth
      for (const msg of (history as any[])) {
        let text = msg.content;
        if (msg.sender !== 'System') text = await this.decryptContent(text);
        
        this.chatHistory.push({
          id:     msg.id,
          sender: msg.sender,
          text:   text,
          isSelf: msg.sender === this.currentUser,
          status: msg.status
        });
        // Update local DB
        this.offlineService.saveMessage(msg);
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
      if (!m.isSelf && m.sender !== 'System' && m.status < 2 && m.id) {
        m.status = 2;
        this.socketService.sendStatusUpdate(m.id, this.activeRoom, 2);
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
    
    // ── E2EE Encryption ──
    const encryptedText = await this.encryptContent(text);
    
    const localMsg: ChatMessage = { sender: this.currentUser, text, isSelf: true, status: -1 };
    this.chatHistory.push(localMsg);
    this.scrollToBottom();

    if (this.offlineService.isOnline()) {
      const ack = await this.socketService.sendMessage(this.activeRoom, this.currentUser, encryptedText);
      if (ack?.id) {
        localMsg.id = ack.id;
        localMsg.status = 0;
      }
    } else {
      console.log('[Offline] Queueing message for sync…');
      this.offlineService.addPendingSync({ room: this.activeRoom, sender: this.currentUser, content: encryptedText });
    }
  }

  private async syncE2EEKeys() {
    try {
      const keys: any = await firstValueFrom(this.http.get(`${this.API}/api/keys/download`));
      if (keys.publicKey && keys.encryptedPrivateKey) {
        // Recovery from server (Use dummy password for POC - in real app, ask user)
        this.myPrivateKey = await this.cryptoService.decryptPrivateKey(keys.encryptedPrivateKey, 'password123');
        console.log('[E2EE] Private key recovered from server.');
      } else {
        // Generate new keys
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
      const peer = this.activeRoomLabel; // In DM, label is the peer username
      const pubKey = await this.getPeerPublicKey(peer);
      if (pubKey) return await this.cryptoService.encryptMessage(text, pubKey);
    }
    // For groups, in this POC we just return as is (Group E2EE is more complex)
    // or we could use a shared room key.
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

  logout() {
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
