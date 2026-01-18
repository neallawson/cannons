import { NetworkManager } from './NetworkManager';
import { ModalManager } from './ModalManager';

export class LobbyUI {
    private networkManager: NetworkManager;
    private modalManager: ModalManager;

    constructor(networkManager: NetworkManager, modalManager: ModalManager) {
        this.networkManager = networkManager;
        this.modalManager = modalManager;
        this.setupNetworkCallbacks();
    }

    private setupNetworkCallbacks() {
        this.networkManager.onLobbyList = (games) => {
            this.showJoinScreen(games);
        };

        this.networkManager.onGameCreated = (roomId, isPublic) => {
            this.showWaitingScreen(roomId, true, undefined, isPublic);
        };

        this.networkManager.onGameJoined = (roomId, name) => {
            this.showWaitingScreen(roomId, false, name);
        };

        this.networkManager.onPlayerJoined = () => {
            // Host sees player join -> Game starts automatically via WebRTC negotiation
            // But we can update UI to say "Starting..."
            const status = document.getElementById('lobby-status');
            if (status) status.textContent = 'Player joined! Starting game...';
        };

        this.networkManager.onError = (msg) => {
            alert(`Error: ${msg}`);
            this.showMainMenu();
        };
    }

    public hide() {
        this.modalManager.hide();
    }

    public show() {
        // Show is called before showMainMenu, so we just ensure modal is ready
    }

    private showContent(content: HTMLElement) {
        this.modalManager.showCustomContent(content);
    }

    public showMainMenu() {
        const content = document.createElement('div');
        content.className = 'lobby-content';

        const createBtn = this.createButton('Create Game', () => this.showCreateScreen());
        const joinBtn = this.createButton('Join Game', () => this.networkManager.listLobbies());
        const closeBtn = this.createButton('Back to Single Player', () => this.hide());

        content.appendChild(createBtn);
        content.appendChild(joinBtn);
        content.appendChild(closeBtn);

        this.showContent(content);
    }

    private showCreateScreen() {
        const content = document.createElement('div');
        content.className = 'lobby-content';

        const title = document.createElement('h2');
        title.textContent = 'Create Game';
        title.className = 'lobby-subtitle';

        const nameInput = document.createElement('input');
        nameInput.placeholder = 'Game Name';
        nameInput.className = 'lobby-input';

        const publicLabel = document.createElement('label');
        publicLabel.className = 'lobby-checkbox-label';
        const publicCheck = document.createElement('input');
        publicCheck.type = 'checkbox';
        publicCheck.checked = true;
        publicLabel.appendChild(publicCheck);
        publicLabel.appendChild(document.createTextNode(' Public Game'));

        const createBtn = this.createButton('Create', () => {
            const name = nameInput.value || 'My Game';
            this.networkManager.createLobby(name, publicCheck.checked);
        }, true);

        const backBtn = this.createButton('Back', () => this.showMainMenu());

        content.appendChild(title);
        content.appendChild(nameInput);
        content.appendChild(publicLabel);
        content.appendChild(createBtn);
        content.appendChild(backBtn);

        this.showContent(content);
    }

    private showJoinScreen(games: any[]) {
        const content = document.createElement('div');
        content.className = 'lobby-content';

        const title = document.createElement('h2');
        title.textContent = 'Join Game';
        title.className = 'lobby-subtitle';
        content.appendChild(title);

        const list = document.createElement('div');
        list.className = 'lobby-game-list';

        if (games.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = 'No public games found.';
            emptyMsg.style.padding = '20px';
            emptyMsg.style.color = '#aaa';
            list.appendChild(emptyMsg);
        } else {
            games.forEach(game => {
                const item = document.createElement('div');
                item.className = 'lobby-game-item';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'game-name';
                nameSpan.textContent = game.name;
                
                item.appendChild(nameSpan);
                item.onclick = () => this.networkManager.joinLobby(game.id);
                list.appendChild(item);
            });
        }
        content.appendChild(list);

        // Private Code Input
        const codeContainer = document.createElement('div');
        codeContainer.className = 'lobby-code-section';
        
        const codeInput = document.createElement('input');
        codeInput.placeholder = 'Enter Room Code';
        codeInput.className = 'lobby-input';

        const joinCodeBtn = this.createButton('Join', () => {
            if (codeInput.value) this.networkManager.joinLobby(codeInput.value);
        }, true);

        codeContainer.appendChild(codeInput);
        codeContainer.appendChild(joinCodeBtn);
        content.appendChild(codeContainer);

        const backBtn = this.createButton('Back', () => this.showMainMenu());
        content.appendChild(backBtn);

        this.showContent(content);
    }

    private showWaitingScreen(roomId: string, isHost: boolean, gameName?: string, isPublic: boolean = false) {
        const content = document.createElement('div');
        content.className = 'lobby-content';

        const title = document.createElement('h2');
        title.textContent = isHost ? 'Waiting for Players...' : `Joined: ${gameName || roomId}`;
        title.className = 'lobby-subtitle';
        content.appendChild(title);

        if (!isPublic || !isHost) {
            const codeContainer = document.createElement('div');
            codeContainer.style.margin = '10px 0';
            
            const codeLabel = document.createElement('span');
            codeLabel.textContent = 'Room Code: ';
            
            const codeValue = document.createElement('span');
            codeValue.className = 'lobby-room-code';
            codeValue.textContent = roomId;
            
            codeContainer.appendChild(codeLabel);
            codeContainer.appendChild(codeValue);
            content.appendChild(codeContainer);
        }

        const status = document.createElement('div');
        status.id = 'lobby-status';
        status.className = 'lobby-status';
        if (isHost) {
            status.textContent = isPublic ? 'Your game is listed publicly. Waiting for someone to join...' : 'Share this code with your friend.';
        } else {
            status.textContent = 'Waiting for host to start...';
        }
        content.appendChild(status);

        this.showContent(content);
    }

    private createButton(text: string, onClick: () => void, primary: boolean = false): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.onclick = onClick;
        btn.className = primary ? 'lobby-button primary' : 'lobby-button';
        return btn;
    }
}
