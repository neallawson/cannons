import type { GameStateData } from './types';
import type { PhysicsEngine } from './PhysicsEngine';

export class AIOpponent {
    private playerId: string;
    private onFire: (angle: number, power: number) => void;
    private thinking: boolean = false;
    private difficulty: number = 50; // Default difficulty (1-100)

    constructor(playerId: string, onFire: (angle: number, power: number) => void) {
        this.playerId = playerId;
        this.onFire = onFire;
    }

    public setDifficulty(level: number) {
        this.difficulty = Math.max(1, Math.min(100, level));
        console.log(`AI Difficulty set to ${this.difficulty}`);
    }

    public update(state: GameStateData, physics: PhysicsEngine) {
        if (state.currentTurnPlayerId === this.playerId && !this.thinking) {
            this.thinking = true;
            // Simulate realistic delay relative to difficulty?
            // Just general pacing delay.
            setTimeout(() => {
                this.takeTurn(state, physics);
                this.thinking = false;
            }, 1000 + Math.random() * 1000);
        }
    }

    private takeTurn(state: GameStateData, physics: PhysicsEngine) {
        const me = state.players.find(p => p.id === this.playerId);
        const target = state.players.find(p => p.id !== this.playerId);

        if (!me || !target) {
            // Panic fallback
            this.onFire(this.playerId === 'p2' ? 135 : 45, 50);
            return;
        }

        // 1. Calculate Perceived Wind (Difficulty Effect)
        // Scale 0 to 100.
        // 0 = No wind awareness, 100 = Perfect.
        const windAwareness = Math.max(0, (this.difficulty - 10) / 90);
        const perceivedWind = state.wind.speed * windAwareness;

        // 2. Run Solver with Perceived Wind
        const solution = this.solveShot(me, target, perceivedWind, physics, state);

        if (solution) {
            // 3. Apply Execution Error (Jitter)
            // Difficulty 100 = 0 error.
            // Difficulty 0 = Max error.
            const errorFactor = (100 - this.difficulty) / 100;

            const angleJitterMax = 12 * errorFactor;
            const powerJitterMax = 15 * errorFactor;

            const angleNoise = (Math.random() - 0.5) * 2 * angleJitterMax;
            const powerNoise = (Math.random() - 0.5) * 2 * powerJitterMax;

            let finalAngle = solution.angle + angleNoise;
            let finalPower = solution.power + powerNoise;

            // Clamp Logic
            finalPower = Math.max(10, Math.min(60, finalPower)); // Hardcapped at 60

            // Update AI's angle visually
            me.cannonAngle = finalAngle;

            console.log(`AI (Lvl ${this.difficulty}) Firing: Solved [${solution.angle.toFixed(1)}, ${solution.power.toFixed(1)}] -> Actual [${finalAngle.toFixed(1)}, ${finalPower.toFixed(1)}]`);

            this.onFire(finalAngle, finalPower);
        } else {
            // No solution found? Just shoot randomly in direction
            console.log("AI Bot: No solution found, panic firing.");
            const fallbackAngle = this.playerId === 'p2' ? 135 : 45;
            me.cannonAngle = fallbackAngle;
            this.onFire(fallbackAngle, 50);
        }
    }

    private solveShot(
        me: any,
        target: any,
        simulatedWind: number,
        physics: PhysicsEngine,
        state: GameStateData
    ): { angle: number, power: number } | null {
        const isRight = me.castlePosition.x > target.castlePosition.x;

        // Search Angles
        const startAngle = isRight ? 110 : 20;
        const endAngle = isRight ? 160 : 80;
        const step = 5;

        const solutions: { angle: number, power: number }[] = [];
        const maxPower = 60; // Match game constraints

        for (let ang = startAngle; ang <= endAngle; ang += step) {
            let minP = 10;
            let maxP = maxPower;
            let foundP = -1;

            // Binary Search (8 iterations gives precision ~0.2)
            for (let i = 0; i < 8; i++) {
                const attemptP = (minP + maxP) / 2;

                // Replicate Spawn Logic from PhysicsEngine
                const rad = ang * (Math.PI / 180);
                const vel = {
                    x: Math.cos(rad) * attemptP * 10,
                    y: -Math.sin(rad) * attemptP * 10
                };
                const pivotX = me.castlePosition.x;
                const pivotY = me.castlePosition.y - 70;
                const spawnDist = 80;
                const origin = {
                    x: pivotX + Math.cos(rad) * spawnDist,
                    y: pivotY - Math.sin(rad) * spawnDist
                };

                const result = physics.simulateShot(origin, vel, simulatedWind, target.id, state);

                if (result.hit) {
                    foundP = attemptP;
                    break;
                }

                // Adjustment Logic
                // If P1 (Shooting Right): Miss < 0 (Short) -> More Power
                // If P2 (Shooting Left): Miss > 0 (Short) -> More Power
                const short = (!isRight && result.missDistance < 0) || (isRight && result.missDistance > 0);

                if (short) {
                    minP = attemptP;
                } else {
                    maxP = attemptP;
                }
            }

            if (foundP !== -1) {
                solutions.push({ angle: ang, power: foundP });
            }
        }

        if (solutions.length === 0) return null;

        // Pick a random valid solution
        return solutions[Math.floor(Math.random() * solutions.length)];
    }
}
