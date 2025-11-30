import type { GameStateData, Projectile, Vector } from './types';
import { Renderer } from './Renderer';

export class PhysicsEngine {
    private gravity: number = 9.8 * 10; // Scaled gravity
    private windFactor: number = 5; // Effect of wind on projectile

    private renderer: Renderer;

    constructor(renderer: Renderer) {
        this.renderer = renderer;
    }

    private accumulator: number = 0;
    private readonly fixedDt: number = 1 / 60;

    public update(state: GameStateData, deltaTime: number, updateWind: (dt: number) => void) {
        this.accumulator += deltaTime;

        // Limit accumulator to avoid spiral of death
        if (this.accumulator > 0.25) this.accumulator = 0.25;

        while (this.accumulator >= this.fixedDt) {
            updateWind(this.fixedDt); // Update wind with fixed step
            this.updatePhysicsStep(state, this.fixedDt);
            this.accumulator -= this.fixedDt;
        }

        // Interpolation could be added here for smoother rendering, 
        // but for now we just render the state as is.

        this.updateExplosions(state, deltaTime); // Explosions are visual, can use variable dt
    }

    private updatePhysicsStep(state: GameStateData, dt: number) {
        const subSteps = 4;
        const subDt = dt / subSteps;

        for (let i = 0; i < subSteps; i++) {
            this.updateProjectiles(state, subDt);
        }
    }

    private updateExplosions(state: GameStateData, dt: number) {
        state.explosions.forEach(exp => {
            exp.elapsed += dt;
            exp.particles.forEach(p => {
                let moveFactor = 1.0;
                let rise = 0;

                // Fireball logic (particles with growth)
                if (p.growth) {
                    // Expand for first half, shrink for second half
                    moveFactor = (exp.elapsed < exp.duration / 2) ? 1.0 : -1.0;
                    rise = -0.5; // Constant upward rise
                }

                p.x += p.vx * moveFactor * dt * 60; // Scale for 60fps
                p.y += (p.vy * moveFactor + rise) * dt * 60;
                p.life -= dt / exp.duration;

                // Fireball growth
                if (p.growth) {
                    p.size += p.growth * dt * 60;
                }
            });
        });

        state.explosions = state.explosions.filter(exp => exp.elapsed < exp.duration);
    }

    private createExplosion(state: GameStateData, x: number, y: number, type: 'small' | 'big') {
        const particleCount = type === 'small' ? 20 : 150; // More particles for big boom
        const duration = type === 'small' ? 0.5 : 4.0;
        const particles = [];

        for (let i = 0; i < particleCount; i++) {

            let color;
            let size;
            let growth = 0;
            let angle, speed;

            if (type === 'small') {
                angle = Math.random() * Math.PI * 2;
                speed = Math.random() * 2 + 1;
                color = `hsl(${Math.random() * 60 + 10}, 100%, 50%)`; // Orange/Yellow
                size = Math.random() * 3 + 1;

                particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: color,
                    life: 1.0,
                    size: size
                });
            } else {
                // Big Fireball: Roiling, slow moving, overlapping circles
                // Position: Bottom-center slightly below impact (y + 10), but mostly rising up
                const offsetX = (Math.random() - 0.5) * 40; // Cluster width
                const offsetY = (Math.random() - 0.5) * 40 - 20; // Cluster height, shifted up

                // Very slow velocity for "roiling" feel, not flying away
                angle = Math.random() * Math.PI * 2;
                speed = Math.random() * 0.5;

                // Colors: Yellow (60) to Red (0), mostly Orange/Yellow
                const hue = Math.random() * 40 + 10; // 10-50 (Red-Orange to Yellow)
                color = `hsla(${hue}, 100%, 50%, ${Math.random() * 0.5 + 0.5})`;

                size = Math.random() * 20 + 10; // Large circles
                growth = Math.random() * 0.8 + 0.2; // Grow to create overlapping effect

                particles.push({
                    x: x + offsetX,
                    y: y + offsetY + 10, // Start slightly lower
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed, // Pure expansion velocity (rise handled in update)
                    color: color,
                    life: 1.0,
                    size: size,
                    growth: growth
                });
            }
        }

        // Add Sparks/Fireworks for Big Explosion
        if (type === 'big') {
            const sparkCount = 100;
            for (let i = 0; i < sparkCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                // Faster speed to extend beyond the fireball
                const speed = Math.random() * 5 + 2;

                // Bright colors: White, Gold, Yellow
                const hue = Math.random() * 60; // Red to Yellow
                const lightness = Math.random() * 50 + 50; // 50-100% lightness (Bright)
                const color = `hsla(${hue}, 100%, ${lightness}%, 1.0)`;

                particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed, // Radiate outwards
                    color: color,
                    life: Math.random() * 0.5 + 0.5, // Shorter life than fireballs
                    size: Math.random() * 2 + 1, // Small sparks
                    growth: 0 // No growth
                });
            }
        }

        state.explosions.push({
            id: Math.random().toString(),
            x,
            y,
            particles,
            duration,
            elapsed: 0,
            type
        });
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

            // Check out of bounds (Logical Resolution)
            if (proj.position.y > 1332 || proj.position.x < 0 || proj.position.x > 2488) {
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
            this.createExplosion(state, proj.position.x, proj.position.y, 'small');
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
                this.createExplosion(state, proj.position.x, proj.position.y, 'small');
                this.createExplosion(state, player.castlePosition.x, player.castlePosition.y - 30, 'big'); // Big boom on castle
                state.gameStatus = 'finished';
                state.winnerId = proj.ownerId;
                return;
            }

            // C. Castle Pixel Collision (Walls)
            // Check exact point for pixel collision
            if (this.renderer.isPixelSolid(Math.floor(proj.position.x), Math.floor(proj.position.y))) {
                // Hit Wall -> Stop and Damage
                proj.active = false;
                this.createExplosion(state, proj.position.x, proj.position.y, 'small');
                player.health -= 10;

                const damageRadius = 10; // Reduced to 10 as requested
                const seed = proj.damageSeed;

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
                    this.createExplosion(state, player.castlePosition.x, player.castlePosition.y - 30, 'big');
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
                    this.createExplosion(state, player.castlePosition.x, player.castlePosition.y - 30, 'big');
                    return;
                }

                // Fallback win condition
                if (player.health <= 0) {
                    state.gameStatus = 'finished';
                    state.winnerId = proj.ownerId;
                    this.createExplosion(state, player.castlePosition.x, player.castlePosition.y - 30, 'big');
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
                this.createExplosion(state, proj.position.x, proj.position.y, 'small');
                this.createExplosion(state, player.castlePosition.x, player.castlePosition.y - 30, 'big');
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
            const damageRadius = 10; // Reduced to 10 as requested
            const seed = proj.damageSeed;

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

    public fireProjectile(state: GameStateData, angle: number, power: number, ownerId: string, damageSeed: number) {
        const player = state.players.find(p => p.id === ownerId);
        if (!player) return;

        const rad = angle * (Math.PI / 180);
        const velocity: Vector = {
            x: Math.cos(rad) * power * 10,
            y: -Math.sin(rad) * power * 10 // Negative because Y is down
        };

        // Spawn at the tip of the cannon barrel + margin
        // Cannon pivot is at (x, y - 70) (Moved up 10px)
        const pivotX = player.castlePosition.x;
        const pivotY = player.castlePosition.y - 70;
        const barrelLength = 60;
        const spawnDist = barrelLength + 20; // 80 units from pivot

        const spawnX = pivotX + Math.cos(rad) * spawnDist;
        const spawnY = pivotY - Math.sin(rad) * spawnDist;

        const projectile: Projectile = {
            id: Math.random().toString(),
            position: { x: spawnX, y: spawnY },
            velocity: velocity,
            ownerId: ownerId,
            active: true,
            damageSeed: damageSeed
        };

        state.projectiles.push(projectile);
    }
}
