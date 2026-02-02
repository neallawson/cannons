export interface Point {
    x: number;
    y: number;
}

export interface Vector {
    x: number;
    y: number;
}

export interface Player {
    id: string;
    name: string;
    color: string;
    castlePosition: Point;
    cannonAngle: number; // in degrees or radians
    health: number;
    wins: number;
    isMyTurn: boolean;
    difficultyLabel?: string;
}

export interface Projectile {
    id: string;
    position: Point;
    velocity: Vector;
    ownerId: string;
    active: boolean;
    damageSeed: number;
}

export interface Wind {
    speed: number; // positive for right, negative for left
    angle: number; // Added angle
}

export interface GameConfig {
    gravity: number;
    windEnabled: boolean;
}

export type WeatherType = 'calm' | 'breezy' | 'stormy';

export interface WeatherConfig {
    name: string;
    windRange: number;      // Max speed (+/-)
    changeRate: number;     // Noise step per second
    dampening: number;      // Interpolation decay (higher = faster/snappier)
}

export interface LandscapeFeature {
    x: number;
    y: number;
    type: 'tree' | 'building';
    width: number;
    height: number;
    seed: number;
    color: string;
}

export interface GameStateData {
    players: Player[];
    projectiles: Projectile[];
    wind: Wind;
    currentTurnPlayerId: string;
    round: number;
    terrain: number[]; // Simple heightmap for collision/initial generation
    landscape: LandscapeFeature[];
    terrainDamage: { x: number; y: number; r: number; seed: number }[];
    gameStatus: 'waiting' | 'playing' | 'ending' | 'finished';
    winnerId: string | null;
    damage: { x: number; y: number; r: number; seed: number }[];
    explosions: Explosion[];
}

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    life: number; // 0 to 1
    size: number;
    growth?: number; // Optional growth rate
    alphaDecay?: number; // Optional alpha decay rate
}

export interface Explosion {
    id: string;
    x: number;
    y: number;
    particles: Particle[];
    duration: number; // in seconds
    elapsed: number;
    type: 'small' | 'big';
}
