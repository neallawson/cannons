import type { GameStateData, Player } from './types';

export class GameState {
    private state: GameStateData;
    private listeners: ((state: GameStateData) => void)[] = [];

    private width: number;
    private height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.state = this.getInitialState();
        this.generateTerrain(); // Generate initial terrain
    }

    private getInitialState(): GameStateData {
        return {
            players: [],
            projectiles: [],
            wind: { speed: 0, variability: 0.5 },
            currentTurnPlayerId: '',
            round: 1,
            terrain: [],
            landscape: [],
            terrainDamage: [],
            gameStatus: 'waiting',
            winnerId: null,
            damage: [],
            explosions: [],
        };
    }

    private generateTerrain() {
        // Hill parameters
        const hillWidth = 300;

        // Independent heights for left and right hills
        // Increased range: 150 to 400
        const leftPeak = 150 + Math.random() * 250;
        const rightPeak = 150 + Math.random() * 250;

        // Plateaus (80% of peak)
        const leftPlateau = leftPeak * 0.8;
        const rightPlateau = rightPeak * 0.8;

        const terrain = new Array(Math.ceil(this.width)).fill(0);
        const landscape: any[] = [];

        // Base elevation increase (approx 25% higher than previous 50)
        const baseElevation = 80;

        for (let i = 0; i < this.width; i++) {
            // Left hill
            if (i < hillWidth) {
                const x = i / hillWidth * Math.PI;
                const h = Math.sin(x) * leftPeak;
                terrain[i] = Math.min(h, leftPlateau) + baseElevation;
            }
            // Right hill
            else if (i > this.width - hillWidth) {
                const x = (i - (this.width - hillWidth)) / hillWidth * Math.PI;
                const h = Math.sin(x) * rightPeak;
                terrain[i] = Math.min(h, rightPlateau) + baseElevation;
            }
            // Valley
            else {
                // Smooth valley (no random noise)
                terrain[i] = baseElevation;

                // Randomly place landscape features in the valley
                if (Math.random() < 0.02) { // 2% chance per pixel
                    const type = Math.random() > 0.5 ? 'tree' : 'building';
                    let width, height, color;

                    if (type === 'tree') {
                        // Vary tree size and color
                        width = 15 + Math.random() * 15; // 15-30
                        height = 30 + Math.random() * 30; // 30-60
                        // Random shade of green
                        const g = 100 + Math.floor(Math.random() * 100); // 100-200
                        color = `rgb(30, ${g}, 30)`;
                    } else {
                        // Vary building size (max 30x50) and color
                        width = 20 + Math.random() * 10; // 20-30
                        height = 30 + Math.random() * 20; // 30-50
                        // Random earthy/building colors
                        const r = 100 + Math.floor(Math.random() * 100);
                        const g = 80 + Math.floor(Math.random() * 80);
                        const b = 60 + Math.floor(Math.random() * 60);
                        color = `rgb(${r}, ${g}, ${b})`;
                    }

                    // Avoid overlapping too much (simple check)
                    const lastFeature = landscape[landscape.length - 1];
                    if (!lastFeature || i > lastFeature.x + lastFeature.width + 10) {
                        landscape.push({
                            x: i,
                            y: terrain[i], // Will sit on top of terrain
                            type,
                            width,
                            height,
                            seed: Math.random(),
                            color
                        });
                    }
                }
            }
        }

        this.state.terrain = terrain;
        this.state.landscape = landscape;
        this.state.terrainDamage = []; // Reset terrain damage
    }

    public getState(): GameStateData {
        return this.state;
    }

    public update(updater: (state: GameStateData) => void) {
        updater(this.state);
        this.notifyListeners();
    }

    public subscribe(listener: (state: GameStateData) => void) {
        this.listeners.push(listener);
        listener(this.state); // Initial call
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.state));
    }

    // Helper methods
    public addPlayer(player: Player) {
        this.update(state => {
            // Adjust player Y to match current terrain
            const y = this.height - state.terrain[Math.floor(player.castlePosition.x)];
            player.castlePosition.y = y;

            state.players.push(player);
            if (state.players.length === 1) {
                state.currentTurnPlayerId = player.id;
            }
        });
    }

    public nextTurn() {
        this.update(state => {
            const currentIndex = state.players.findIndex(p => p.id === state.currentTurnPlayerId);
            const nextIndex = (currentIndex + 1) % state.players.length;
            state.currentTurnPlayerId = state.players[nextIndex].id;

            // Increment round if back to first player
            if (nextIndex === 0) {
                state.round++;
                // Change wind every round
                state.wind.speed = (Math.random() * 2 - 1) * 10; // -10 to 10
            }
        });
    }
}
