export class NetworkManager {
    private signalingUrl: string = 'ws://localhost:8080';
    private ws: WebSocket | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private onDataCallback: ((data: any) => void) | null = null;
    private isHost: boolean = false;

    constructor(onData: (data: any) => void) {
        this.onDataCallback = onData;
    }

    public async hostGame() {
        this.isHost = true;
        this.connectSignaling();
    }

    public async joinGame() {
        this.isHost = false;
        this.connectSignaling();
    }

    private connectSignaling() {
        this.ws = new WebSocket(this.signalingUrl);

        this.ws.onopen = () => {
            console.log('Connected to signaling server');
            this.setupPeerConnection();
        };

        this.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'offer') {
                if (!this.isHost) {
                    await this.handleOffer(message.offer);
                }
            } else if (message.type === 'answer') {
                if (this.isHost) {
                    await this.handleAnswer(message.answer);
                }
            } else if (message.type === 'candidate') {
                await this.handleCandidate(message.candidate);
            }
        };
    }

    private setupPeerConnection() {
        const config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
        this.peerConnection = new RTCPeerConnection(config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignaling({ type: 'candidate', candidate: event.candidate });
            }
        };

        if (this.isHost) {
            this.dataChannel = this.peerConnection.createDataChannel('game');
            this.setupDataChannel(this.dataChannel);
            this.createOffer();
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }
    }

    private setupDataChannel(channel: RTCDataChannel) {
        channel.onopen = () => {
            console.log('Data channel open');
        };
        channel.onmessage = (event) => {
            if (this.onDataCallback) {
                this.onDataCallback(JSON.parse(event.data));
            }
        };
    }

    private async createOffer() {
        if (!this.peerConnection) return;
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.sendSignaling({ type: 'offer', offer });
    }

    private async handleOffer(offer: RTCSessionDescriptionInit) {
        if (!this.peerConnection) return;
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.sendSignaling({ type: 'answer', answer });
    }

    private async handleAnswer(answer: RTCSessionDescriptionInit) {
        if (!this.peerConnection) return;
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    private async handleCandidate(candidate: RTCIceCandidateInit) {
        if (!this.peerConnection) return;
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    private sendSignaling(message: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    public sendData(data: any) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(data));
        }
    }
}
