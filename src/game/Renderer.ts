
import type { GameStateData, Point } from './types';

export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number = 0;
    private height: number = 0;

    // Offscreen layers
    private castleCanvas: HTMLCanvasElement;
    private castleCtx: CanvasRenderingContext2D;

    private terrainCanvas: HTMLCanvasElement;
    private terrainCtx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get 2D context');
        }
        this.ctx = context;

        // Offscreen canvas for castle destruction
        this.castleCanvas = document.createElement('canvas');
        this.castleCtx = this.castleCanvas.getContext('2d')!;

        // Offscreen canvas for terrain destruction
        this.terrainCanvas = document.createElement('canvas');
        this.terrainCtx = this.terrainCanvas.getContext('2d')!;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    private resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.castleCanvas.width = this.width;
        this.castleCanvas.height = this.height;

        this.terrainCanvas.width = this.width;
        this.terrainCanvas.height = this.height;
    }

    public render(state: GameStateData) {
        // Clear main canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Sky
        this.drawSky();

        // Draw Terrain (Persistent Layer)
        // Let's use the Castle approach for now for simplicity and robustness:
        // 1. Clear Terrain Canvas
        // 2. Draw Base Terrain & Landscape
        // 3. Apply All Terrain Damage (holes)
        // This is fast enough for 2D canvas.

        this.terrainCtx.clearRect(0, 0, this.terrainCanvas.width, this.terrainCanvas.height);
        this.drawTerrainBase(state);
        this.applyTerrainDamage(state);

        // Draw Terrain Canvas to Main Canvas
        this.ctx.drawImage(this.terrainCanvas, 0, 0);

        // Draw Castles (Persistent Layer logic inside)
        this.drawCastles(state);

        // Draw Projectiles
        this.drawProjectiles(state);

        // Draw Explosions
        this.drawExplosions(state);

        // Draw HUD
        this.drawHUD(state);
    }

    private drawExplosions(state: GameStateData) {
        state.explosions.forEach(exp => {
            exp.particles.forEach(p => {
                this.ctx.globalAlpha = p.life;
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
        });
        this.ctx.globalAlpha = 1.0;
    }





    private drawSky() {
        // Simple gradient sky
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#87CEEB'); // Sky blue
        gradient.addColorStop(1, '#E0F7FA'); // Lighter blue
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    private drawTerrainBase(state: GameStateData) {
        const ctx = this.terrainCtx;
        const { width, height } = this.terrainCanvas;

        // Draw Ground (Mountains/Terrain)
        // Create gradient for mountains (Grey/Brown) -> Green Valley
        // Terrain height values are from bottom (0) to top (height).
        // But canvas Y is 0 at top, height at bottom.
        // The terrain line is at y = height - terrain[i].
        // Max terrain height is around 400 (peaks), min is 80 (valley).
        // So peaks are at Y ~ height - 400. Valley is at Y ~ height - 80.
        // We want peaks to be grey, slopes brown, valley green.

        const gradient = ctx.createLinearGradient(0, height - 400, 0, height);
        gradient.addColorStop(0, '#808080'); // Grey at peaks
        gradient.addColorStop(0.6, '#5d4037'); // Brown slopes
        gradient.addColorStop(0.9, '#388E3C'); // Medium-Dark Green valley
        gradient.addColorStop(1, '#2E7D32'); // Darker Green base

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let i = 0; i < width; i++) {
            ctx.lineTo(i, height - state.terrain[i]);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // Draw Landscape Features
        if (state.landscape) {
            state.landscape.forEach(feature => {
                const y = height - feature.y;
                if (feature.type === 'tree') {
                    // Trunk
                    ctx.fillStyle = '#3e2723'; // Dark brown trunk
                    ctx.fillRect(feature.x + feature.width * 0.4, y - feature.height * 0.2, feature.width * 0.2, feature.height * 0.2);
                    // Leaves (Triangle) - Use stored color
                    ctx.fillStyle = feature.color;
                    ctx.beginPath();
                    ctx.moveTo(feature.x, y - feature.height * 0.2);
                    ctx.lineTo(feature.x + feature.width / 2, y - feature.height);
                    ctx.lineTo(feature.x + feature.width, y - feature.height * 0.2);
                    ctx.closePath();
                    ctx.fill();
                } else if (feature.type === 'building') {
                    // House body - Use stored color
                    ctx.fillStyle = feature.color;
                    ctx.fillRect(feature.x, y - feature.height * 0.6, feature.width, feature.height * 0.6);
                    // Roof
                    ctx.fillStyle = '#3e2723'; // Dark roof
                    ctx.beginPath();
                    ctx.moveTo(feature.x - 2, y - feature.height * 0.6);
                    ctx.lineTo(feature.x + feature.width / 2, y - feature.height);
                    ctx.lineTo(feature.x + feature.width + 2, y - feature.height * 0.6);
                    ctx.closePath();
                    ctx.fill();

                    // Door
                    ctx.fillStyle = '#212121';
                    ctx.fillRect(feature.x + feature.width * 0.4, y - feature.height * 0.2, feature.width * 0.2, feature.height * 0.2);
                }
            });
        }
    }

    private applyTerrainDamage(state: GameStateData) {
        const ctx = this.terrainCtx;
        ctx.globalCompositeOperation = 'destination-out';

        state.terrainDamage.forEach(d => {
            ctx.beginPath();
            // Jagged explosion for terrain too
            const spikes = 12;
            const step = (Math.PI * 2) / spikes;
            let angle = 0;

            const random = (seed: number) => {
                const x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            };
            let currentSeed = d.seed;

            for (let i = 0; i < spikes; i++) {
                const r = d.r * (0.8 + random(currentSeed + i) * 0.4);
                const x = d.x + Math.cos(angle) * r;
                const y = d.y + Math.sin(angle) * r;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                angle += step;
            }
            ctx.closePath();
            ctx.fill();
        });

        ctx.globalCompositeOperation = 'source-over';
    }

    public isTerrainSolid(x: number, y: number): boolean {
        if (x < 0 || x >= this.terrainCanvas.width || y < 0 || y >= this.terrainCanvas.height) return false;
        const pixel = this.terrainCtx.getImageData(x, y, 1, 1).data;
        return pixel[3] > 0; // Alpha > 0 means solid
    }

    public isPixelSolid(x: number, y: number): boolean {
        // Check if within canvas bounds
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;

        // Get pixel alpha
        const pixel = this.castleCtx.getImageData(x, y, 1, 1).data;
        return pixel[3] > 0; // Alpha > 0 means solid
    }

    private drawCastles(state: GameStateData) {
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
        this.ctx.drawImage(this.castleCanvas, 0, 0);

        // Draw cannons (Body + Barrel) on top
        state.players.forEach(player => {
            this.drawCannon(player.castlePosition, player.cannonAngle);
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
        // Move pivot up to center of dome (radius is 20, so center is y - 10 relative to base)
        const pivotY = bodyY - 10;

        this.ctx.translate(bodyX, pivotY); // Pivot at body center
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
        this.ctx.fillText(`Round: ${state.round} `, 20, 30);
        this.ctx.fillText(`Wind: ${state.wind.speed.toFixed(1)} `, 20, 60);

        const currentPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);
        if (currentPlayer) {
            this.ctx.fillText(`Turn: ${currentPlayer.name} `, 20, 90);
        }

        // Scores
        const p1 = state.players.find(p => p.id === 'p1');
        const p2 = state.players.find(p => p.id === 'p2');
        if (p1 && p2) {
            this.ctx.fillText(`Score: ${p1.wins} - ${p2.wins} `, 20, 120);
        }
    }
}
