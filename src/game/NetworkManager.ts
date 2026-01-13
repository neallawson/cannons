export class NetworkManager {
    private signalingUrl: string = this.getSignalingUrl();
    private ws: WebSocket | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;

    private getSignalingUrl(): string {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // If dev server (Vite default), connect to local backend port
        if (window.location.port === '5173') {
            return `${protocol}//${window.location.hostname}:8080`;
        }
        // Otherwise (Production/Docker), connect to same host/port and path
        // We ensure we preserve the path (e.g. /games/cannons/) for Caddy path matching
        return `${protocol}//${window.location.host}${window.location.pathname}`;
    }

    // Callbacks
    private onDataCallback: ((data: any) => void) | null = null;
    private onGameStartCallback: ((seed: number, isHost: boolean) => void) | null = null;

    // Lobby Callbacks
    public onLobbyList: ((games: any[]) => void) | null = null;
    public onGameCreated: ((roomId: string, isPublic: boolean) => void) | null = null;
    public onGameJoined: ((roomId: string, name: string) => void) | null = null;
    public onPlayerJoined: (() => void) | null = null;
    public onError: ((msg: string) => void) | null = null;

    private isHost: boolean = false;
    // @ts-ignore
    private roomId: string | null = null;

    constructor(onData: (data: any) => void, onGameStart: (seed: number, isHost: boolean) => void, _logger: (msg: string) => void) {
        this.onDataCallback = onData;
        this.onGameStartCallback = onGameStart;
        this.connectSignaling();
    }

    // ...



    private log(_msg: string) {
        // console.log(`[Net] ${msg}`);
    }

    private connectSignaling() {
        this.log(`Connecting to signaling: ${this.signalingUrl}`);
        this.ws = new WebSocket(this.signalingUrl);

        this.ws.onopen = () => {
            this.log('Connected to signaling server');
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

            this.handleMessage(message);
        };

        this.ws.onclose = () => {
            this.log('Disconnected from signaling server');
            // Optional: Auto-reconnect logic could go here
        };
    }

    private async handleMessage(message: any) {
        switch (message.type) {
            case 'game_list':
                if (this.onLobbyList) this.onLobbyList(message.games);
                break;
            case 'game_created':
                this.roomId = message.roomId;
                this.isHost = true;
                if (this.onGameCreated) this.onGameCreated(message.roomId, message.isPublic);
                break;
            case 'joined_game':
                this.roomId = message.roomId;
                this.isHost = false;
                if (this.onGameJoined) this.onGameJoined(message.roomId, message.name);
                // Client starts WebRTC setup immediately upon joining
                // But wait! We need to wait for Host to send Offer? 
                // Actually, standard flow: Host creates offer when they see player join.
                break;
            case 'player_joined':
                if (this.isHost) {
                    if (this.onPlayerJoined) this.onPlayerJoined();
                    // Host initiates WebRTC
                    this.setupPeerConnection();
                    this.createOffer();
                }
                break;
            case 'error':
                if (this.onError) this.onError(message.message);
                break;

            // WebRTC Signaling
            case 'offer':
                if (!this.isHost) {
                    // Client sets up PC when they receive Offer
                    if (!this.peerConnection) this.setupPeerConnection();
                    await this.handleOffer(message.offer);
                }
                break;
            case 'answer':
                if (this.isHost) {
                    await this.handleAnswer(message.answer);
                }
                break;
            case 'candidate':
                await this.handleCandidate(message.candidate);
                break;
        }
    }

    // --- Lobby API ---

    public createLobby(name: string, isPublic: boolean) {
        this.sendSignaling({ type: 'create_game', name, isPublic });
    }

    public joinLobby(roomId: string) {
        this.sendSignaling({ type: 'join_game', roomId });
    }

    public listLobbies() {
        this.sendSignaling({ type: 'list_games' });
    }

    // --- WebRTC ---

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
                        this.onGameStartCallback(seed, true);
                    }
                }
            } else if (message.type === 'start') {
                this.log(`Received START with seed ${message.seed}`);
                if (this.onGameStartCallback) {
                    this.onGameStartCallback(message.seed, false);
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

    public resetConnection() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.roomId = null;
        this.isHost = false;
        this.log('Connection reset.');
    }
}
