

export class InputManager {
    private canvas: HTMLCanvasElement;
    private onFire: (angle: number, power: number) => void;
    private onAngleChange: (angle: number) => void;

    private currentAngle: number = 45;
    private currentPower: number = 50;
    private isMyTurn: boolean = false;
    private cannonPosition: { x: number, y: number } | null = null;
    private viewOffset: { x: number, y: number } = { x: 0, y: 0 };
    private scale: number = 1;

    constructor(canvas: HTMLCanvasElement, onFire: (angle: number, power: number) => void, onAngleChange: (angle: number) => void) {
        this.canvas = canvas;
        this.onFire = onFire;
        this.onAngleChange = onAngleChange;

        this.setupListeners();
    }

    public setMyTurn(isMyTurn: boolean) {
        this.isMyTurn = isMyTurn;
    }

    public setCannonPosition(x: number, y: number) {
        this.cannonPosition = { x, y };
    }

    public setViewOffset(x: number, y: number) {
        this.viewOffset = { x, y };
    }

    public setScale(scale: number) {
        this.scale = scale;
    }

    private setupListeners() {
        // Mouse movement for angle
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isMyTurn || !this.cannonPosition) return;

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - this.viewOffset.x) / this.scale;
            const mouseY = (e.clientY - rect.top - this.viewOffset.y) / this.scale;

            // Calculate angle from cannon to mouse
            // Cannon pivot is at cannonPosition (which should be the barrel pivot)
            const dx = mouseX - this.cannonPosition.x;
            const dy = mouseY - this.cannonPosition.y;

            // Math.atan2(y, x) gives angle in radians.
            // Y is positive down in canvas, but we want "up" to be positive angle?
            // In our system: 
            // 45 deg = Up-Right. (dx>0, dy<0)
            // 135 deg = Up-Left. (dx<0, dy<0)
            // atan2(dy, dx) for Up-Right (dy<0) gives negative radians (e.g. -PI/4).
            // So we want -atan2(...) converted to degrees.

            const rad = Math.atan2(dy, dx);
            let angle = -rad * (180 / Math.PI);

            // Normalize to 0-360 if needed, but our system seems to handle it.
            // Actually, let's keep it simple.
            if (angle < 0) angle += 360;

            this.currentAngle = angle;
            this.onAngleChange(this.currentAngle);
        });

        // Click to fire (Left Click)
        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.isMyTurn) return;

            // Left click is button 0
            if (e.button === 0) {
                console.log('Fire click detected', this.currentAngle, this.currentPower);
                this.onFire(this.currentAngle, this.currentPower);
            }
        });

        // Spacebar to fire
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
