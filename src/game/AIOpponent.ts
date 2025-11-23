import type { GameStateData } from './types';

export class AIOpponent {
    private playerId: string;
    private onFire: (angle: number, power: number) => void;
    private thinking: boolean = false;

    constructor(playerId: string, onFire: (angle: number, power: number) => void) {
        this.playerId = playerId;
        this.onFire = onFire;
    }

    public update(state: GameStateData) {
        if (state.currentTurnPlayerId === this.playerId && !this.thinking) {
            this.thinking = true;
            // Simulate thinking time
            setTimeout(() => {
                this.takeTurn(state);
                this.thinking = false;
            }, 1000 + Math.random() * 1000);
        }
    }

    private takeTurn(state: GameStateData) {
        // Simple AI: Random angle between 100 and 170 (facing left), random power
        // Assuming AI is Player 2 (on the right)
        // Player 2 is at x=width-100. Needs to shoot left.
        // Angles: 90 is up, 180 is left.

        const angle = 110 + Math.random() * 40; // 110 to 150
        const power = 40 + Math.random() * 40; // 40 to 80

        // Update AI's angle visually
        const player = state.players.find(p => p.id === this.playerId);
        if (player) {
            player.cannonAngle = angle;
        }

        this.onFire(angle, power);
    }
}
