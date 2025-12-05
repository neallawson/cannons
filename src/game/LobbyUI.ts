import { NetworkManager } from './NetworkManager';

export class LobbyUI {
    private container: HTMLDivElement;
    private networkManager: NetworkManager;
    // private onGameStart: () => void;

    constructor(networkManager: NetworkManager) {
        this.networkManager = networkManager;
        // this.onGameStart = onGameStart;
        this.container = document.createElement('div');
        this.container.id = 'lobby-ui';
        this.container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            font-family: sans-serif;
        `;
        document.body.appendChild(this.container);

        this.setupNetworkCallbacks();
        // this.showMainMenu(); // Don't show by default
        this.hide();
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
            const status = this.container.querySelector('#lobby-status');
            if (status) status.textContent = 'Player joined! Starting game...';
        };

        this.networkManager.onError = (msg) => {
            alert(`Error: ${msg}`);
            this.showMainMenu();
        };
    }

    public hide() {
        this.container.style.display = 'none';
    }

    public show() {
        this.container.style.display = 'flex';
    }

    private clear() {
        this.container.innerHTML = '';
    }

    public showMainMenu() {
        this.clear();

        const title = document.createElement('h1');
        title.textContent = 'CANNONS';
        title.style.fontSize = '4rem';
        title.style.marginBottom = '2rem';
        title.style.color = '#FFD700';

        const createBtn = this.createButton('Create Game', () => this.showCreateScreen());
        const joinBtn = this.createButton('Join Game', () => this.networkManager.listLobbies());
        const closeBtn = this.createButton('Back to Single Player', () => this.hide());

        this.container.appendChild(title);
        this.container.appendChild(createBtn);
        this.container.appendChild(joinBtn);
        this.container.appendChild(closeBtn);
    }

    private showCreateScreen() {
        this.clear();

        const title = document.createElement('h2');
        title.textContent = 'Create Game';

        const nameInput = document.createElement('input');
        nameInput.placeholder = 'Game Name';
        nameInput.style.fontSize = '1.5rem';
        nameInput.style.padding = '10px';
        nameInput.style.margin = '10px';

        const publicLabel = document.createElement('label');
        publicLabel.style.fontSize = '1.5rem';
        const publicCheck = document.createElement('input');
        publicCheck.type = 'checkbox';
        publicCheck.checked = true;
        publicCheck.style.transform = 'scale(1.5)';
        publicCheck.style.marginRight = '10px';
        publicLabel.appendChild(publicCheck);
        publicLabel.appendChild(document.createTextNode(' Public Game'));

        const createBtn = this.createButton('Create', () => {
            const name = nameInput.value || 'My Game';
            this.networkManager.createLobby(name, publicCheck.checked);
        });

        const backBtn = this.createButton('Back', () => this.showMainMenu());

        this.container.appendChild(title);
        this.container.appendChild(nameInput);
        this.container.appendChild(publicLabel);
        this.container.appendChild(createBtn);
        this.container.appendChild(backBtn);
    }

    private showJoinScreen(games: any[]) {
        this.clear();

        const title = document.createElement('h2');
        title.textContent = 'Join Game';
        this.container.appendChild(title);

        const list = document.createElement('div');
        list.style.cssText = `
            width: 80%;
            max-width: 600px;
            height: 300px;
            overflow-y: auto;
            border: 1px solid #555;
            margin: 20px;
            padding: 10px;
        `;

        if (games.length === 0) {
            list.textContent = 'No public games found.';
        } else {
            games.forEach(game => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 15px;
                    background: #333;
                    margin-bottom: 10px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                `;
                item.innerHTML = `<span>${game.name}</span> <span style="color:#aaa">${game.id}</span>`;
                item.onmouseover = () => item.style.background = '#444';
                item.onmouseout = () => item.style.background = '#333';
                item.onclick = () => this.networkManager.joinLobby(game.id);
                list.appendChild(item);
            });
        }
        this.container.appendChild(list);

        // Private Code Input
        const codeContainer = document.createElement('div');
        const codeInput = document.createElement('input');
        codeInput.placeholder = 'Enter Room Code';
        codeInput.style.fontSize = '1.2rem';
        codeInput.style.padding = '5px';

        const joinCodeBtn = this.createButton('Join via Code', () => {
            if (codeInput.value) this.networkManager.joinLobby(codeInput.value);
        });
        joinCodeBtn.style.fontSize = '1.2rem';
        joinCodeBtn.style.padding = '5px 15px';

        codeContainer.appendChild(codeInput);
        codeContainer.appendChild(joinCodeBtn);
        this.container.appendChild(codeContainer);

        const backBtn = this.createButton('Back', () => this.showMainMenu());
        this.container.appendChild(backBtn);
    }

    private showWaitingScreen(roomId: string, isHost: boolean, gameName?: string, isPublic: boolean = false) {
        this.clear();

        const title = document.createElement('h2');
        title.textContent = isHost ? 'Waiting for Players...' : `Joined: ${gameName || roomId}`;
        this.container.appendChild(title);

        if (!isPublic || !isHost) {
            const code = document.createElement('div');
            code.innerHTML = `Room Code: <span style="color:#FFD700; font-size: 2rem; font-family: monospace;">${roomId}</span>`;
            code.style.margin = '20px';
            this.container.appendChild(code);
        }

        const status = document.createElement('div');
        status.id = 'lobby-status';
        if (isHost) {
            status.textContent = isPublic ? 'Your game is listed publicly. Waiting for someone to join...' : 'Share this code with your friend.';
        } else {
            status.textContent = 'Waiting for host to start...';
        }
        status.style.color = '#aaa';
        this.container.appendChild(status);

        // Back button (leaves game)
        // TODO: Implement leave game logic
    }

    private createButton(text: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.onclick = onClick;
        btn.style.cssText = `
            font-size: 1.5rem;
            padding: 10px 30px;
            margin: 10px;
            background: #333;
            color: white;
            border: 2px solid white;
            cursor: pointer;
            min-width: 200px;
        `;
        btn.onmouseover = () => btn.style.background = '#555';
        btn.onmouseout = () => btn.style.background = '#333';
        return btn;
    }
}
