

export class InputManager {
    private canvas: HTMLCanvasElement;
    private onFire: (angle: number, power: number) => void;
    private onAngleChange: (angle: number) => void;

    private currentAngle: number = 45;
    private currentPower: number = 50;
    private isMyTurn: boolean = false;

    constructor(canvas: HTMLCanvasElement, onFire: (angle: number, power: number) => void, onAngleChange: (angle: number) => void) {
        this.canvas = canvas;
        this.onFire = onFire;
        this.onAngleChange = onAngleChange;

        this.setupListeners();
    }

    public setMyTurn(isMyTurn: boolean) {
        this.isMyTurn = isMyTurn;
    }

    private setupListeners() {
        // Mouse movement for angle
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isMyTurn) return;

            const rect = this.canvas.getBoundingClientRect();
            const y = e.clientY - rect.top;

            // Calculate angle relative to bottom-left (approximate castle position for now)
            // Ideally we should know the player's castle position.
            // For now, let's just map mouseY to angle.
            // Top of screen = 90 deg, Bottom = 0 deg.
            const percentage = 1 - (y / window.innerHeight);
            this.currentAngle = percentage * 90;

            this.onAngleChange(this.currentAngle);
        });

        // Click to fire (or use UI button)
        // Let's use a UI button for firing to be precise, or Spacebar.
        window.addEventListener('keydown', (e) => {
            if (!this.isMyTurn) return;

            if (e.code === 'Space') {
                this.onFire(this.currentAngle, this.currentPower);
            }
        });
    }

    public setPower(power: number) {
        this.currentPower = power;
    }

    public fire() {
        if (this.isMyTurn) {
            this.onFire(this.currentAngle, this.currentPower);
        }
    }
}
