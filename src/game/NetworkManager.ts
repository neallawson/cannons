export class NetworkManager {
    private signalingUrl: string = 'ws://localhost:8080';
    private ws: WebSocket | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private onDataCallback: ((data: any) => void) | null = null;
    private onGameStartCallback: ((seed: number) => void) | null = null;
    private isHost: boolean = false;

    constructor(onData: (data: any) => void, onGameStart: (seed: number) => void, _logger: (msg: string) => void) {
        this.onDataCallback = onData;
        this.onGameStartCallback = onGameStart;
        // this.logger = logger;
    }

    private log(_msg: string) {
        // if (this.logger) this.logger(msg);
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
        this.log(`Connecting to signaling: ${this.signalingUrl}`);
        this.ws = new WebSocket(this.signalingUrl);

        this.ws.onopen = () => {
            this.log('Connected to signaling server');
            this.setupPeerConnection();
            if (!this.isHost) {
                this.log('Sending join-request');
                this.sendSignaling({ type: 'join-request' });
            }
        };

        this.ws.onmessage = async (event) => {
            let message;
            try {
                if (event.data instanceof Blob) {
                    message = JSON.parse(await event.data.text());
                } else {
                    message = JSON.parse(event.data);
                }
            } catch (e) {
                this.log('Error parsing signaling message');
                return;
            }

            // this.log(`Signaling received: ${message.type}`);

            if (message.type === 'join-request') {
                if (this.isHost) {
                    this.log('Received join-request, creating offer');
                    this.createOffer();
                }
            } else if (message.type === 'offer') {
                if (!this.isHost) {
                    this.log('Received offer');
                    await this.handleOffer(message.offer);
                }
            } else if (message.type === 'answer') {
                if (this.isHost) {
                    this.log('Received answer');
                    await this.handleAnswer(message.answer);
                }
            } else if (message.type === 'candidate') {
                await this.handleCandidate(message.candidate);
            }
        };
    }

    private setupPeerConnection() {
        this.log('Setting up PeerConnection');
        const config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
        this.peerConnection = new RTCPeerConnection(config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignaling({ type: 'candidate', candidate: event.candidate });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            this.log(`PeerConnection state: ${this.peerConnection?.connectionState}`);
        };

        if (this.isHost) {
            this.log('Creating DataChannel');
            this.dataChannel = this.peerConnection.createDataChannel('game');
            this.setupDataChannel(this.dataChannel);
            // Host waits for join-request to create offer
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.log('Received DataChannel');
                this.dataChannel = event.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }
    }

    private setupDataChannel(channel: RTCDataChannel) {
        const onOpen = () => {
            this.log('Data channel open');
            if (!this.isHost) {
                this.log('Sending READY');
                this.sendData({ type: 'ready' });
            }
        };

        if (channel.readyState === 'open') {
            onOpen();
        } else {
            channel.onopen = onOpen;
        }

        channel.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.log(`DC Message: ${message.type}`);
            if (message.type === 'ready') {
                if (this.isHost) {
                    const seed = Date.now();
                    this.log(`Sending START with seed ${seed}`);
                    this.sendData({ type: 'start', seed });
                    if (this.onGameStartCallback) {
                        this.onGameStartCallback(seed);
                    }
                }
            } else if (message.type === 'start') {
                this.log(`Received START with seed ${message.seed}`);
                if (this.onGameStartCallback) {
                    this.onGameStartCallback(message.seed);
                }
            } else if (this.onDataCallback) {
                this.onDataCallback(message);
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
