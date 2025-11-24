export class GameLoop {
    private lastTime: number = 0;
    private running: boolean = false;
    private updateCallback: (deltaTime: number) => void;
    private renderCallback: () => void;

    constructor(update: (dt: number) => void, render: () => void) {
        this.updateCallback = update;
        this.renderCallback = render;
    }

    public start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    public stop() {
        this.running = false;
    }

    private loop = (timestamp: number) => {
        if (!this.running) return;

        let deltaTime = (timestamp - this.lastTime) / 1000; // in seconds
        this.lastTime = timestamp;

        // Cap deltaTime to prevent spiral of death
        if (deltaTime > 0.25) deltaTime = 0.25;



        // We will just pass the raw delta time for now, but the PhysicsEngine 
        // should ideally handle the fixed step. 
        // Actually, let's implement the accumulator here for better control.

        // For this specific request, I will modify PhysicsEngine to handle the fixed step
        // to minimize changes to GameLoop interface if possible, OR just enforce it here.
        // Let's enforce it here.

        this.updateCallback(deltaTime);
        this.renderCallback();

        requestAnimationFrame(this.loop);
    };
}
