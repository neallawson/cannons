import type { GameStateData, Projectile, Vector } from './types';
import { Renderer } from './Renderer';

export class PhysicsEngine {
    private gravity: number = 9.8 * 10; // Scaled gravity
    private windFactor: number = 5; // Effect of wind on projectile

    private renderer: Renderer;

    constructor(renderer: Renderer) {
        this.renderer = renderer;
    }

    public update(state: GameStateData, deltaTime: number) {
        const subSteps = 4;
        const subDt = deltaTime / subSteps;

        for (let i = 0; i < subSteps; i++) {
            this.updateProjectiles(state, subDt);
        }
    }

    private updateProjectiles(state: GameStateData, dt: number) {
        state.projectiles.forEach(proj => {
            if (!proj.active) return;

            // Apply forces
            proj.velocity.y += this.gravity * dt;
            proj.velocity.x += state.wind.speed * this.windFactor * dt;

            // Update position
            proj.position.x += proj.velocity.x * dt;
            proj.position.y += proj.velocity.y * dt;

            // Check collisions
            this.checkCollisions(proj, state);

            // Check out of bounds
            if (proj.position.y > window.innerHeight || proj.position.x < 0 || proj.position.x > window.innerWidth) {
                proj.active = false;
            }
        });

        // Remove inactive projectiles
        state.projectiles = state.projectiles.filter(p => p.active);
    }

    private checkCollisions(proj: Projectile, state: GameStateData) {
        // 1. Terrain Collision (Floor)
        if (this.checkTerrainCollision(proj, state)) {
            proj.active = false;
            return;
        }

        // 2. Player Collisions
        for (const player of state.players) {
            // A. Castle Bounding Box Check (Optimization)
            const castleW = 120; // Slightly larger to catch edges
            const castleH = 120;
            const left = player.castlePosition.x - castleW / 2;
            const right = player.castlePosition.x + castleW / 2;
            const top = player.castlePosition.y - castleH;
            const bottom = player.castlePosition.y;

            // Simple AABB check for the castle area
            if (proj.position.x < left || proj.position.x > right ||
                proj.position.y < top || proj.position.y > bottom) {
                continue; // Not near this castle
            }

            // B. Cannon Body Collision (Point vs Circle)
            // Position: Top of castle (y - 60)
            const bodyX = player.castlePosition.x;
            const bodyY = player.castlePosition.y - 60;
            const bodyRadius = 12; // Reduced from 20 to 12 (40% smaller)

            const dx = proj.position.x - bodyX;
            const dy = proj.position.y - bodyY;

            // Simple distance check (Point inside Circle)
            if (dx * dx + dy * dy < bodyRadius * bodyRadius) {
                // Hit Cannon Body
                proj.active = false;
                state.gameStatus = 'finished';
                state.winnerId = proj.ownerId;
                return;
            }

            // C. Castle Pixel Collision (Walls)
            // Check exact point for pixel collision
            if (this.renderer.isPixelSolid(Math.floor(proj.position.x), Math.floor(proj.position.y))) {
                // Hit Wall -> Stop and Damage
                proj.active = false;
                player.health -= 10;

                const damageRadius = 12; // Reduced from 20 to 12
                const seed = Math.random();

                state.damage.push({
                    x: proj.position.x,
                    y: proj.position.y,
                    r: damageRadius,
                    seed: seed
                });

                // Check Splash Damage on Cannon Body
                // Circle vs Circle (Explosion vs Cannon)
                const bodyX = player.castlePosition.x;
                const bodyY = player.castlePosition.y - 60;
                const bodyRadius = 12; // Reduced from 20 to 12 (40% smaller)
                const dx = proj.position.x - bodyX;
                const dy = proj.position.y - bodyY;
                const distSq = dx * dx + dy * dy;
                const splashRadius = damageRadius + bodyRadius; // Overlap check

                if (distSq < splashRadius * splashRadius) {
                    state.gameStatus = 'finished';
                    state.winnerId = proj.ownerId;
                    return;
                }

                // Check Splash Damage on Magazine
                // Circle vs Rect (Explosion vs Magazine)
                const magW = 30; // Reduced from 40 to 30
                const magH = 20;
                const magLeft = player.castlePosition.x - magW / 2;
                const magRight = player.castlePosition.x + magW / 2;
                const magTop = player.castlePosition.y - magH;
                const magBottom = player.castlePosition.y;

                // Find closest point on rect to explosion center
                const closestX = Math.max(magLeft, Math.min(proj.position.x, magRight));
                const closestY = Math.max(magTop, Math.min(proj.position.y, magBottom));

                const distX = proj.position.x - closestX;
                const distY = proj.position.y - closestY;

                if (distX * distX + distY * distY < damageRadius * damageRadius) {
                    state.gameStatus = 'finished';
                    state.winnerId = proj.ownerId;
                    return;
                }

                // Fallback win condition
                if (player.health <= 0) {
                    state.gameStatus = 'finished';
                    state.winnerId = proj.ownerId;
                }
                return; // STOP here.
            }

            // D. Magazine Collision (Point vs Rect)
            // 30x20 at bottom center
            const magW = 30; // Reduced from 40 to 30
            const magH = 20;
            const magLeft = player.castlePosition.x - magW / 2;
            const magRight = player.castlePosition.x + magW / 2;
            const magTop = player.castlePosition.y - magH;
            const magBottom = player.castlePosition.y;

            // Simple Point inside Rect check
            if (proj.position.x >= magLeft && proj.position.x <= magRight &&
                proj.position.y >= magTop && proj.position.y <= magBottom) {
                // Hit Magazine
                proj.active = false;
                state.gameStatus = 'finished';
                state.winnerId = proj.ownerId;
                return;
            }
        }
    }

    private checkTerrainCollision(proj: Projectile, state: GameStateData): boolean {
        // Pixel-perfect check using Renderer (handles terrain + landscape + destruction)
        if (this.renderer.isTerrainSolid(Math.floor(proj.position.x), Math.floor(proj.position.y))) {
            // Hit Terrain -> Damage
            const damageRadius = 20; // Good size for terrain holes
            const seed = Math.random();

            state.terrainDamage.push({
                x: proj.position.x,
                y: proj.position.y,
                r: damageRadius,
                seed: seed
            });

            return true;
        }
        return false;
    }



    public fireProjectile(state: GameStateData, angle: number, power: number, ownerId: string) {
        const player = state.players.find(p => p.id === ownerId);
        if (!player) return;

        const rad = angle * (Math.PI / 180);
        const velocity: Vector = {
            x: Math.cos(rad) * power * 10,
            y: -Math.sin(rad) * power * 10 // Negative because Y is down
        };

        // Spawn at the tip of the cannon barrel + margin
        // Cannon pivot is at (x, y - 60)
        const pivotX = player.castlePosition.x;
        const pivotY = player.castlePosition.y - 60;
        const barrelLength = 60;
        const spawnDist = barrelLength + 20; // 80 units from pivot

        const spawnX = pivotX + Math.cos(rad) * spawnDist;
        const spawnY = pivotY - Math.sin(rad) * spawnDist;

        const projectile: Projectile = {
            id: Math.random().toString(),
            position: { x: spawnX, y: spawnY },
            velocity: velocity,
            ownerId: ownerId,
            active: true
        };

        state.projectiles.push(projectile);
    }
}
