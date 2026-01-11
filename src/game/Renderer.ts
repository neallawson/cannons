
import type { GameStateData, Point } from './types';

export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number = 0;
    private height: number = 0;

    // Fixed Logical Resolution
    private readonly LOGICAL_WIDTH = 2488;
    private readonly LOGICAL_HEIGHT = 1332;

    private scale: number = 1;
    private viewOffset: { x: number, y: number } = { x: 0, y: 0 };

    // Offscreen layers
    private castleCanvas: HTMLCanvasElement;
    private castleCtx: CanvasRenderingContext2D;

    private terrainCanvas: HTMLCanvasElement;
    private terrainCtx: CanvasRenderingContext2D;

    private damageIndex: number = 0;
    private terrainDamageIndex: number = 0;
    private terrainDrawn: boolean = false;
    private castlesDrawn: boolean = false;

    private resizeHandler: () => void;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get 2D context');
        }
        this.ctx = context;

        // Offscreen canvas for castle destruction (Static + Mask)
        this.castleCanvas = document.createElement('canvas');
        this.castleCtx = this.castleCanvas.getContext('2d')!;

        // Offscreen canvas for terrain destruction (Static + Mask)
        this.terrainCanvas = document.createElement('canvas');
        this.terrainCtx = this.terrainCanvas.getContext('2d')!;

        this.terrainCtx = this.terrainCanvas.getContext('2d')!;

        this.resizeHandler = () => {
            this.resize();
            // Force redraw of static layers on resize
            this.terrainDrawn = false;
            this.castlesDrawn = false;
        };
        window.addEventListener('resize', this.resizeHandler);
        this.resize();
    }

    public destroy() {
        window.removeEventListener('resize', this.resizeHandler);
    }

    public getViewOffset() {
        return this.viewOffset;
    }

    public getScale() {
        return this.scale;
    }

    private resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Calculate Scale to fit window while maintaining aspect ratio
        const scaleX = this.width / this.LOGICAL_WIDTH;
        const scaleY = this.height / this.LOGICAL_HEIGHT;
        this.scale = Math.min(scaleX, scaleY);

        // Calculate Offset to center the view
        this.viewOffset.x = Math.floor((this.width - (this.LOGICAL_WIDTH * this.scale)) / 2);
        this.viewOffset.y = Math.floor((this.height - (this.LOGICAL_HEIGHT * this.scale)) / 2);

        // Resize offscreen canvases to LOGICAL dimensions
        this.castleCanvas.width = this.LOGICAL_WIDTH;
        this.castleCanvas.height = this.LOGICAL_HEIGHT;

        this.terrainCanvas.width = this.LOGICAL_WIDTH;
        this.terrainCanvas.height = this.LOGICAL_HEIGHT;

        // Invalidate cache
        this.terrainDrawn = false;
        this.castlesDrawn = false;
    }

    public render(state: GameStateData) {
        // Initialize Static Layers if needed
        if (!this.terrainDrawn) {
            this.drawTerrainBase(state);
            this.terrainDrawn = true;
            this.terrainDamageIndex = 0; // Re-apply all damage if redrawn
        }
        if (!this.castlesDrawn && state.players.length > 0) {
            this.drawCastlesBase(state);
            this.castlesDrawn = true;
            this.damageIndex = 0; // Re-apply all damage if redrawn
        }

        // Apply Incremental Damage
        this.applyIncrementalTerrainDamage(state);
        this.applyIncrementalCastleDamage(state);

        // Clear main canvas (Window)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Letterbox Background (Dark Grey)
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context and apply transformation
        this.ctx.save();
        this.ctx.translate(this.viewOffset.x, this.viewOffset.y);
        this.ctx.scale(this.scale, this.scale);

        // Clip to game area (Logical Size)
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.LOGICAL_WIDTH, this.LOGICAL_HEIGHT);
        this.ctx.clip();

        // Draw Sky
        this.drawSky();

        // Draw Cached Terrain Layer
        this.ctx.drawImage(this.terrainCanvas, 0, 0);

        // Draw Cached Castle Layer (Houses/Towers/Magazine)
        this.ctx.drawImage(this.castleCanvas, 0, 0);

        // Draw Dynamic Elements
        state.players.forEach(player => {
            this.drawCannon(player.castlePosition, player.cannonAngle);
        });

        this.drawProjectiles(state);
        this.drawExplosions(state);

        // Draw Border around Logical Area
        this.ctx.strokeStyle = '#FFD700'; // Gold border
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, this.LOGICAL_WIDTH, this.LOGICAL_HEIGHT);

        // Draw Wind Indicator
        this.drawWindIndicator(state);

        // Restore context
        this.ctx.restore();
    }

    private drawWindIndicator(state: GameStateData) {
        const x = this.LOGICAL_WIDTH / 2;
        const y = 60;
        const windSpeed = state.wind.speed;
        const windDir = Math.sign(windSpeed) || 1;
        const windMag = Math.abs(windSpeed);

        this.ctx.save();
        this.ctx.translate(x, y);

        // Draw Pole
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(-3, 0, 6, 80);

        // Draw Flag
        const time = performance.now() / 150;

        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.moveTo(0, 5);

        const flagWidth = Math.min(120, 40 + windMag * 5);
        const segments = 10;
        const step = flagWidth / segments;
        const lift = Math.min(1.0, Math.max(0.1, windMag / 10.0));

        for (let i = 0; i <= segments; i++) {
            const wx = i * step * windDir * lift;
            const waveAmp = (i / segments) * (windMag * 1.5);
            const waveFreq = 0.5 + windMag * 0.1;
            const wave = Math.sin(time * waveFreq + i * 0.5) * waveAmp;
            const droop = (i * step) * (1 - lift) * 1.2;
            this.ctx.lineTo(wx, 5 + wave + droop);
        }

        for (let i = segments; i >= 0; i--) {
            const wx = i * step * windDir * lift;
            const waveAmp = (i / segments) * (windMag * 1.5);
            const waveFreq = 0.5 + windMag * 0.1;
            const wave = Math.sin(time * waveFreq + i * 0.5) * waveAmp;
            const droop = (i * step) * (1 - lift) * 1.2;
            this.ctx.lineTo(wx, 45 + wave + droop);
        }

        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = '#DAA520';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '42px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${windSpeed.toFixed(1)}`, 0, 100);

        this.ctx.restore();
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
        // Simple gradient sky - Precalculate if optimization needed, but Gradient is fast enough
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.LOGICAL_HEIGHT);
        gradient.addColorStop(0, '#87CEEB');
        gradient.addColorStop(1, '#E0F7FA');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.LOGICAL_WIDTH, this.LOGICAL_HEIGHT);
    }

    private drawTerrainBase(state: GameStateData) {
        if (!state.terrain || state.terrain.length === 0) return;

        const ctx = this.terrainCtx;
        const { width, height } = this.terrainCanvas;

        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createLinearGradient(0, height - 400, 0, height);
        gradient.addColorStop(0, '#808080');
        gradient.addColorStop(0.6, '#5d4037');
        gradient.addColorStop(0.9, '#388E3C');
        gradient.addColorStop(1, '#2E7D32');

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
                    ctx.fillStyle = '#3e2723';
                    ctx.fillRect(feature.x + feature.width * 0.4, y - feature.height * 0.2, feature.width * 0.2, feature.height * 0.2);
                    ctx.fillStyle = feature.color;
                    ctx.beginPath();
                    ctx.moveTo(feature.x, y - feature.height * 0.2);
                    ctx.lineTo(feature.x + feature.width / 2, y - feature.height);
                    ctx.lineTo(feature.x + feature.width, y - feature.height * 0.2);
                    ctx.closePath();
                    ctx.fill();
                } else if (feature.type === 'building') {
                    ctx.fillStyle = feature.color;
                    ctx.fillRect(feature.x, y - feature.height * 0.6, feature.width, feature.height * 0.6);
                    ctx.fillStyle = '#3e2723';
                    ctx.beginPath();
                    ctx.moveTo(feature.x - 2, y - feature.height * 0.6);
                    ctx.lineTo(feature.x + feature.width / 2, y - feature.height);
                    ctx.lineTo(feature.x + feature.width + 2, y - feature.height * 0.6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#212121';
                    ctx.fillRect(feature.x + feature.width * 0.4, y - feature.height * 0.2, feature.width * 0.2, feature.height * 0.2);
                }
            });
        }
    }

    private applyIncrementalTerrainDamage(state: GameStateData) {
        const ctx = this.terrainCtx;
        ctx.globalCompositeOperation = 'destination-out';

        // Process only new damage entries
        for (let i = this.terrainDamageIndex; i < state.terrainDamage.length; i++) {
            const d = state.terrainDamage[i];
            ctx.beginPath();
            const spikes = 12;
            const step = (Math.PI * 2) / spikes;
            let angle = 0;
            const random = (seed: number) => {
                const x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            };
            let currentSeed = d.seed;

            for (let j = 0; j < spikes; j++) {
                const r = d.r * (0.8 + random(currentSeed + j) * 0.4);
                const x = d.x + Math.cos(angle) * r;
                const y = d.y + Math.sin(angle) * r;
                if (j === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                angle += step;
            }
            ctx.closePath();
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
        this.terrainDamageIndex = state.terrainDamage.length;
    }

    public isTerrainSolid(x: number, y: number): boolean {
        if (x < 0 || x >= this.terrainCanvas.width || y < 0 || y >= this.terrainCanvas.height) return false;
        const pixel = this.terrainCtx.getImageData(x, y, 1, 1).data;
        return pixel[3] > 0;
    }

    public isPixelSolid(x: number, y: number): boolean {
        // Use castleCtx (now separate from dynamic cannons)
        if (x < 0 || x >= this.LOGICAL_WIDTH || y < 0 || y >= this.LOGICAL_HEIGHT) return false;
        const pixel = this.castleCtx.getImageData(x, y, 1, 1).data;
        return pixel[3] > 0;
    }

    private drawCastlesBase(state: GameStateData) {
        this.castleCtx.clearRect(0, 0, this.LOGICAL_WIDTH, this.LOGICAL_HEIGHT);

        // Draw Magazine (behind castle layer)
        state.players.forEach(player => {
            this.drawMagazine(player.castlePosition);
        });

        // Draw castles normally
        state.players.forEach(player => {
            this.drawCastleOnLayer(player.castlePosition, player.color);
        });
    }

    private applyIncrementalCastleDamage(state: GameStateData) {
        this.castleCtx.globalCompositeOperation = 'destination-out';
        this.castleCtx.fillStyle = '#000';

        for (let i = this.damageIndex; i < state.damage.length; i++) {
            const d = state.damage[i];
            this.castleCtx.beginPath();
            const spikes = 12;
            const step = (Math.PI * 2) / spikes;
            let angle = 0;
            const random = (seed: number) => {
                const x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            };
            let currentSeed = d.seed;

            for (let j = 0; j < spikes; j++) {
                const r = d.r * (0.8 + random(currentSeed + j) * 0.4);
                const x = d.x + Math.cos(angle) * r;
                const y = d.y + Math.sin(angle) * r;
                if (j === 0) this.castleCtx.moveTo(x, y);
                else this.castleCtx.lineTo(x, y);
                angle += step;
            }
            this.castleCtx.closePath();
            this.castleCtx.fill();
        }

        this.castleCtx.globalCompositeOperation = 'source-over';
        this.damageIndex = state.damage.length;
    }

    private drawCannon(position: Point, angle: number) {
        this.ctx.save();

        // 1. Draw Cannon Body 
        const bodyX = position.x;
        const bodyY = position.y - 60;
        this.ctx.fillStyle = '#444';
        this.ctx.beginPath();
        this.ctx.arc(bodyX, bodyY, 20, Math.PI, 0);
        this.ctx.fill();

        // 2. Draw Barrel
        const pivotY = bodyY - 10;
        this.ctx.translate(bodyX, pivotY);
        this.ctx.rotate(-angle * (Math.PI / 180));
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(0, -8, 60, 16);

        this.ctx.restore();
    }

    private drawCastleOnLayer(position: Point, color: string) {
        const width = 80;
        const height = 60;
        this.castleCtx.fillStyle = color;
        this.castleCtx.fillRect(position.x - width / 2, position.y - height, width, height);

        const towerWidth = 20;
        const towerHeight = 80;
        this.castleCtx.fillRect(position.x - width / 2, position.y - towerHeight, towerWidth, towerHeight);
        this.castleCtx.fillRect(position.x + width / 2 - towerWidth, position.y - towerHeight, towerWidth, towerHeight);

        this.castleCtx.fillRect(position.x - width / 2 - 5, position.y - towerHeight - 10, towerWidth + 10, 10);
        this.castleCtx.fillRect(position.x + width / 2 - towerWidth - 5, position.y - towerHeight - 10, towerWidth + 10, 10);

        this.castleCtx.fillStyle = '#000';
        this.castleCtx.fillRect(position.x - width / 2 + 5, position.y - towerHeight + 20, 10, 20);
        this.castleCtx.fillRect(position.x + width / 2 - towerWidth + 5, position.y - towerHeight + 20, 10, 20);

        this.castleCtx.beginPath();
        this.castleCtx.arc(position.x, position.y, 20, Math.PI, 0);
        this.castleCtx.fill();
    }

    private drawMagazine(position: Point) {
        const width = 40;
        const height = 20;
        const x = position.x - width / 2;
        const y = position.y - height;

        this.castleCtx.fillStyle = '#FFD700';
        this.castleCtx.fillRect(x, y, width, height);

        this.castleCtx.fillStyle = '#000';
        this.castleCtx.font = '10px Arial';
        this.castleCtx.fillText('TNT', x + 8, y + 14);
    }

    private drawProjectiles(state: GameStateData) {
        state.projectiles.forEach(proj => {
            const owner = state.players.find(p => p.id === proj.ownerId);
            this.ctx.fillStyle = owner ? owner.color : '#000';
            this.ctx.beginPath();
            this.ctx.arc(proj.position.x, proj.position.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

}
