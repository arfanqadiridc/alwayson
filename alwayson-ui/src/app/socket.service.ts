import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket!: Socket;

  connect(): Promise<void> {
    return new Promise((resolve) => {
      // Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues on some Windows setups
      this.socket = io('http://127.0.0.1:8085', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 10,
        timeout: 10000
      });

      this.socket.on('connect', () => {
        console.log('[AlwaysOn] Socket connected ✓', this.socket.id);
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        console.error('[AlwaysOn] Socket connection failed:', err.message);
        // We still resolve so the UI can finish loading, but features will be degraded
        resolve();
      });

      // Safety timeout
      setTimeout(() => resolve(), 5000);
    });
  }

  registerUser(username: string) {
    if (this.socket) {
      this.socket.emit('register', { username });
      console.log('[AlwaysOn] Registering user:', username);
    }
  }

  joinRoom(room: string) {
    if (this.socket) this.socket.emit('join_room', room);
  }

  leaveAllRooms(rooms: string[]) {
    if (this.socket) rooms.forEach(r => this.socket.emit('leave_room', r));
  }

  sendMessage(room: string, sender: string, message: string): Promise<any> {
    return new Promise((resolve) => {
      if (this.socket?.connected) {
        // Send structured JSON instead of a formatted string
        this.socket.emit('room_message', { room, sender, message }, (response: any) => resolve(response));
      } else {
        console.warn('[AlwaysOn] Socket disconnected. Message not sent.');
        resolve(null);
      }
    });
  }

  sendTyping(room: string, sender: string, typing: boolean) {
    if (this.socket?.connected) this.socket.emit('typing', { room, sender, typing });
  }

  sendStatusUpdate(id: number, room: string, status: number) {
    if (this.socket?.connected) this.socket.emit('message_status', { id, room, status });
  }

  // WebRTC Signaling
  sendWebRTCOffer(room: string, sender: string, offer: any) {
    if (this.socket?.connected) this.socket.emit('webrtc_offer', { room, sender, signal: offer });
  }

  sendWebRTCAnswer(room: string, sender: string, answer: any) {
    if (this.socket?.connected) this.socket.emit('webrtc_answer', { room, sender, signal: answer });
  }

  sendWebRTCIceCandidate(room: string, sender: string, candidate: any) {
    if (this.socket?.connected) this.socket.emit('webrtc_ice_candidate', { room, sender, signal: candidate });
  }

  onWebRTCOffer(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('webrtc_offer', handler);
      return () => this.socket?.off('webrtc_offer', handler);
    });
  }

  onWebRTCAnswer(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('webrtc_answer', handler);
      return () => this.socket?.off('webrtc_answer', handler);
    });
  }

  onWebRTCIceCandidate(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('webrtc_ice_candidate', handler);
      return () => this.socket?.off('webrtc_ice_candidate', handler);
    });
  }

  onNewMessage(): Observable<any> {
    return new Observable((observer) => {
      const handler = (msg: any) => observer.next(msg);
      this.socket.on('chat_message', handler);
      return () => this.socket?.off('chat_message', handler);
    });
  }

  onTyping(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('user_typing', handler);
      return () => this.socket?.off('user_typing', handler);
    });
  }

  onStatusUpdate(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('status_update', handler);
      return () => this.socket?.off('status_update', handler);
    });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
  }
}
