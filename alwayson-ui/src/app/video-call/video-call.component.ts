import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../socket.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-video-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-call.component.html',
  styleUrl: './video-call.component.css'
})
export class VideoCallComponent implements OnInit {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  
  activeCall = false;
  audioEnabled = true;
  videoEnabled = true;
  localStream?: MediaStream;
  peers: any[] = []; // { id, username, pc }
  room = '';
  username = '';

  constructor(
    private socketService: SocketService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.username = this.authService.getCurrentUser() || 'Anonymous';
    this.setupSignaling();
  }

  async startCall(room: string) {
    this.room = room;
    this.activeCall = true;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (this.localVideo) this.localVideo.nativeElement.srcObject = this.localStream;

      this.socketService.joinRoom(room);

      // In a mesh network, the initiator creates an offer for others.
      // Since we don't have a 'peer list' for the room yet, we'll broadcast a 'call_initiated'
      // signal or just attempt to create an offer if we know the target (DMs).
      if (room.startsWith('dm_')) {
        const parts = room.split('_');
        const peer = parts[1] === this.username ? parts[2] : parts[1];
        await this.initiatePeerConnection(peer);
      }
    } catch (e) {
      console.error('[VideoCall] Could not start call:', e);
      this.activeCall = false;
    }
  }

  private async initiatePeerConnection(remoteUser: string) {
    const pc = this.getOrCreatePeerConnection(remoteUser);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socketService.sendWebRTCOffer(this.room, this.username, offer);
  }

  private setupSignaling() {
    this.socketService.onWebRTCOffer().subscribe(async (data: any) => {
      if (data.sender === this.username) return;
      this.room = data.room;
      this.activeCall = true;
      const pc = this.getOrCreatePeerConnection(data.sender);
      await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socketService.sendWebRTCAnswer(this.room, this.username, answer);
    });

    this.socketService.onWebRTCAnswer().subscribe(async (data: any) => {
      if (data.sender === this.username) return;
      const peer = this.peers.find((p: any) => p.username === data.sender);
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.signal));
      }
    });

    this.socketService.onWebRTCIceCandidate().subscribe(async (data: any) => {
      if (data.sender === this.username) return;
      const peer = this.peers.find((p: any) => p.username === data.sender);
      if (peer) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(data.signal));
      }
    });
  }

  private getOrCreatePeerConnection(remoteUser: string): RTCPeerConnection {
    let peer = this.peers.find(p => p.username === remoteUser);
    if (!peer) {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) {
          this.socketService.sendWebRTCIceCandidate(this.room, this.username, event.candidate);
        }
      };

      pc.ontrack = (event: RTCTrackEvent) => {
        const remoteVideo = document.getElementById(remoteUser) as HTMLVideoElement;
        if (remoteVideo) remoteVideo.srcObject = event.streams[0];
      };

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
      }

      peer = { id: remoteUser, username: remoteUser, pc };
      this.peers.push(peer);
    }
    return peer.pc;
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    this.localStream?.getAudioTracks().forEach(t => t.enabled = this.audioEnabled);
  }

  toggleVideo() {
    this.videoEnabled = !this.videoEnabled;
    this.localStream?.getVideoTracks().forEach(t => t.enabled = this.videoEnabled);
  }

  endCall() {
    this.activeCall = false;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.peers.forEach(p => p.pc.close());
    this.peers = [];
  }
}
