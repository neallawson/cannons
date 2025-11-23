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
}

export interface Projectile {
    id: string;
    position: Point;
    velocity: Vector;
    ownerId: string;
    active: boolean;
}

export interface Wind {
    speed: number; // positive for right, negative for left
    variability: number; // how much it changes per turn
}

export interface GameConfig {
    gravity: number;
    windEnabled: boolean;
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
    gameStatus: 'waiting' | 'playing' | 'finished';
    winnerId: string | null;
    damage: { x: number; y: number; r: number; seed: number }[];
}
