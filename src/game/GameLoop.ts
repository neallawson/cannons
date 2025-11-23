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

        const deltaTime = (timestamp - this.lastTime) / 1000; // in seconds
        this.lastTime = timestamp;

        this.updateCallback(deltaTime);
        this.renderCallback();

        requestAnimationFrame(this.loop);
    };
}
