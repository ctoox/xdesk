import { RTCPeerConnection, RTCDataChannel } from 'werift';
import { SignalClient } from './client';
import { SignalMessage } from './message';

export class WebRTCPeer {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private signalClient: SignalClient;
  private targetPeer: string | null = null;
  private onFrameCallback: ((frame: Buffer) => void) | null = null;
  private connected: boolean = false;

  constructor(signalClient: SignalClient) {
    this.signalClient = signalClient;
  }

  async connect(targetPeer: string): Promise<void> {
    this.targetPeer = targetPeer;
    
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.pc.onicecandidate = (candidate: any) => {
      if (this.targetPeer && candidate) {
        this.signalClient.send({
          type: 'ice',
          to: this.targetPeer,
          data: { candidate }
        });
      }
    };

    this.pc.ondatachannel = (channel: RTCDataChannel) => {
      this.setupDataChannel(channel);
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      console.log(`[WebRTC] State: ${state}`);
      this.connected = state === 'connected';
    };

    this.dataChannel = this.pc.createDataChannel('screen');
    this.setupDataChannel(this.dataChannel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    if (this.targetPeer) {
      this.signalClient.send({
        type: 'offer',
        to: this.targetPeer,
        data: { sdp: offer }
      });
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onmessage = (msg: any) => {
      if (Buffer.isBuffer(msg) && this.onFrameCallback) {
        this.onFrameCallback(msg);
      }
    };

    channel.onopen = () => {
      console.log('[WebRTC] Data channel opened');
      this.connected = true;
    };

    channel.onclose = () => {
      console.log('[WebRTC] Data channel closed');
      this.connected = false;
    };
  }

  async handleOffer(offer: any, fromPeer: string): Promise<void> {
    this.targetPeer = fromPeer;
    
    if (!this.pc) {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      this.pc.onicecandidate = (candidate: any) => {
        if (this.targetPeer && candidate) {
          this.signalClient.send({
            type: 'ice',
            to: this.targetPeer,
            data: { candidate }
          });
        }
      };

      this.pc.ondatachannel = (channel: RTCDataChannel) => {
        this.setupDataChannel(channel);
      };

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState;
        console.log(`[WebRTC] State: ${state}`);
        this.connected = state === 'connected';
      };
    }

    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.signalClient.send({
      type: 'answer',
      to: fromPeer,
      data: { sdp: answer }
    });
  }

  async handleAnswer(answer: any): Promise<void> {
    if (this.pc) {
      await this.pc.setRemoteDescription(answer);
    }
  }

  async handleIceCandidate(candidate: any): Promise<void> {
    if (this.pc) {
      await this.pc.addIceCandidate(candidate);
    }
  }

  sendFrame(frame: Buffer): void {
    if (this.dataChannel && this.connected) {
      try {
        this.dataChannel.send(frame);
      } catch (e) {
        console.error('[WebRTC] Send error:', e);
      }
    }
  }

  onFrame(callback: (frame: Buffer) => void): void {
    this.onFrameCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  close(): void {
    if (this.dataChannel) this.dataChannel.close();
    if (this.pc) this.pc.close();
    this.connected = false;
  }
}
