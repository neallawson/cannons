import type { GameStateData, Point } from './types';

export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number = 0;
    private height: number = 0;
    private castleLayer: HTMLCanvasElement;
    private castleCtx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get 2D context');
        }
        this.ctx = context;

        // Offscreen layer for castles
        this.castleLayer = document.createElement('canvas');
        this.castleCtx = this.castleLayer.getContext('2d')!;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    private resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.castleLayer.width = this.width;
        this.castleLayer.height = this.height;
    }

    public render(state: GameStateData) {
        this.clear();
        this.drawSky();
        this.drawTerrain(state.terrain);
        this.drawCastlesWithDamage(state);
        this.drawProjectiles(state);
        this.drawHUD(state);
    }

    private clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    private drawSky() {
        // Simple gradient sky
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#87CEEB'); // Sky blue
        gradient.addColorStop(1, '#E0F7FA'); // Lighter blue
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    private drawTerrain(terrain: number[]) {
        if (terrain.length === 0) return;

        this.ctx.fillStyle = '#4CAF50'; // Green
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height);

        const step = this.width / (terrain.length - 1);

        for (let i = 0; i < terrain.length; i++) {
            this.ctx.lineTo(i * step, this.height - terrain[i]);
        }

        this.ctx.lineTo(this.width, this.height);
        this.ctx.closePath();
        this.ctx.fill();
    }

    public isPixelSolid(x: number, y: number): boolean {
        // Check if within canvas bounds
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;

        // Get pixel alpha
        const pixel = this.castleCtx.getImageData(x, y, 1, 1).data;
        return pixel[3] > 0; // Alpha > 0 means solid
    }

    private drawCastlesWithDamage(state: GameStateData) {
        // Draw Magazine (behind castle layer)
        state.players.forEach(player => {
            this.drawMagazine(player.castlePosition);
        });

        // Clear offscreen layer
        this.castleCtx.clearRect(0, 0, this.width, this.height);

        // Draw castles normally
        state.players.forEach(player => {
            this.drawCastleOnLayer(player.castlePosition, player.color);
        });

        // Apply damage mask
        this.castleCtx.globalCompositeOperation = 'destination-out';
        this.castleCtx.fillStyle = '#000'; // Color doesn't matter for destination-out

        state.damage.forEach(d => {
            this.castleCtx.beginPath();

            // Jagged explosion
            const spikes = 12;
            const step = (Math.PI * 2) / spikes;
            let angle = 0;

            // Use seed for deterministic randomness
            const random = (seed: number) => {
                const x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            };
            let currentSeed = d.seed;

            for (let i = 0; i < spikes; i++) {
                const r = d.r * (0.8 + random(currentSeed + i) * 0.4); // 80% to 120% radius
                const x = d.x + Math.cos(angle) * r;
                const y = d.y + Math.sin(angle) * r;
                if (i === 0) {
                    this.castleCtx.moveTo(x, y);
                } else {
                    this.castleCtx.lineTo(x, y);
                }
                angle += step;
            }
            this.castleCtx.closePath();
            this.castleCtx.fill();
        });

        this.castleCtx.globalCompositeOperation = 'source-over'; // Reset

        // Draw layer to main canvas
        this.ctx.drawImage(this.castleLayer, 0, 0);

        // Draw cannons (Body + Barrel) on top
        state.players.forEach(player => {
            this.drawCannon(player.castlePosition, player.cannonAngle);
        });

        // DEBUG: Draw Hitboxes
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        this.ctx.lineWidth = 2;
        state.players.forEach(player => {
            // Castle Bounds
            const castleW = 120;
            const castleH = 120;
            this.ctx.strokeRect(
                player.castlePosition.x - castleW / 2,
                player.castlePosition.y - castleH,
                castleW,
                castleH
            );

            // Cannon Body
            this.ctx.beginPath();
            this.ctx.arc(player.castlePosition.x, player.castlePosition.y - 60, 12, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; // Red for targets
            this.ctx.stroke();

            // Magazine
            this.ctx.strokeRect(
                player.castlePosition.x - 15, // x - width/2
                player.castlePosition.y - 20,
                30, // Width
                20
            );
            this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // Back to green
        });
    }

    private drawCannon(position: Point, angle: number) {
        this.ctx.save();

        // 1. Draw Cannon Body (Static Dome)
        // Position: Top of castle (y - 60)
        const bodyX = position.x;
        const bodyY = position.y - 60;

        this.ctx.fillStyle = '#444';
        this.ctx.beginPath();
        this.ctx.arc(bodyX, bodyY, 20, Math.PI, 0); // Semi-circle dome
        this.ctx.fill();

        // 2. Draw Barrel (Rotates around body center)
        this.ctx.translate(bodyX, bodyY); // Pivot at body center
        this.ctx.rotate(-angle * (Math.PI / 180));
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(0, -8, 60, 16); // Barrel

        this.ctx.restore();
    }

    private drawCastleOnLayer(position: Point, color: string) {
        // Larger castle
        const width = 80;
        const height = 60;

        this.castleCtx.fillStyle = color;
        // Main body
        this.castleCtx.fillRect(position.x - width / 2, position.y - height, width, height);

        // Towers
        const towerWidth = 20;
        const towerHeight = 80;
        this.castleCtx.fillRect(position.x - width / 2, position.y - towerHeight, towerWidth, towerHeight);
        this.castleCtx.fillRect(position.x + width / 2 - towerWidth, position.y - towerHeight, towerWidth, towerHeight);

        // Battlements
        this.castleCtx.fillRect(position.x - width / 2 - 5, position.y - towerHeight - 10, towerWidth + 10, 10);
        this.castleCtx.fillRect(position.x + width / 2 - towerWidth - 5, position.y - towerHeight - 10, towerWidth + 10, 10);

        // Windows
        this.castleCtx.fillStyle = '#000';
        this.castleCtx.fillRect(position.x - width / 2 + 5, position.y - towerHeight + 20, 10, 20);
        this.castleCtx.fillRect(position.x + width / 2 - towerWidth + 5, position.y - towerHeight + 20, 10, 20);

        // Door
        this.castleCtx.beginPath();
        this.castleCtx.arc(position.x, position.y, 20, Math.PI, 0);
        this.castleCtx.fill();
    }

    private drawMagazine(position: Point) {
        const width = 40;
        const height = 20;
        // Positioned at bottom center of castle
        const x = position.x - width / 2;
        const y = position.y - height; // Castle bottom is at position.y

        this.ctx.fillStyle = '#FFD700'; // Gold/Yellow
        this.ctx.fillRect(x, y, width, height);

        // Text
        this.ctx.fillStyle = '#000';
        this.ctx.font = '10px Arial';
        this.ctx.fillText('TNT', x + 8, y + 14);

        // Outline to make it "very visible" as a target even if covered
        this.ctx.strokeStyle = '#FF0000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
    }

    private drawProjectiles(state: GameStateData) {
        this.ctx.fillStyle = '#000';
        state.projectiles.forEach(proj => {
            this.ctx.beginPath();
            this.ctx.arc(proj.position.x, proj.position.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    private drawHUD(state: GameStateData) {
        this.ctx.fillStyle = '#000';
        this.ctx.font = '20px Arial';
        this.ctx.fillText(`Round: ${state.round}`, 20, 30);
        this.ctx.fillText(`Wind: ${state.wind.speed.toFixed(1)}`, 20, 60);

        const currentPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);
        if (currentPlayer) {
            this.ctx.fillText(`Turn: ${currentPlayer.name}`, 20, 90);
        }

        // Scores
        const p1 = state.players.find(p => p.id === 'p1');
        const p2 = state.players.find(p => p.id === 'p2');
        if (p1 && p2) {
            this.ctx.fillText(`Score: ${p1.wins} - ${p2.wins}`, 20, 120);
        }
    }
}
