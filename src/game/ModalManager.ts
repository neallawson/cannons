export class ModalManager {
    private overlay: HTMLElement;
    private box: HTMLElement;
    private messageEl: HTMLElement;
    private buttonContainer: HTMLElement;
    private timerId: number | null = null;

    constructor() {
        // Create DOM elements
        this.overlay = document.createElement('div');
        this.overlay.id = 'modal-overlay';
        this.overlay.style.display = 'none';

        this.box = document.createElement('div');
        this.box.className = 'modal-box';

        this.messageEl = document.createElement('div');
        this.messageEl.className = 'modal-message';

        this.buttonContainer = document.createElement('div');
        this.buttonContainer.className = 'modal-buttons';

        this.box.appendChild(this.messageEl);
        this.box.appendChild(this.buttonContainer);
        this.overlay.appendChild(this.box);

        // Append to body (or a specific container if preferred)
        document.body.appendChild(this.overlay);
    }

    public showTemporaryMessage(text: string, durationSeconds: number) {
        this.clear();
        this.messageEl.innerHTML = text;
        this.overlay.style.display = 'flex';

        // Add fade-in animation class if desired, or just show

        if (durationSeconds > 0) {
            this.timerId = window.setTimeout(() => {
                this.hide();
            }, durationSeconds * 1000);
        }
    }

    public showConfirmation(text: string, onConfirm: () => void, buttonText: string = 'OK') {
        this.clear();
        this.messageEl.innerHTML = text;

        const btn = document.createElement('button');
        btn.className = 'modal-button';
        btn.innerText = buttonText;
        btn.onclick = () => {
            this.hide();
            onConfirm();
        };

        this.buttonContainer.appendChild(btn);
        this.overlay.style.display = 'flex';
    }

    public showMessage(text: string) {
        // Persistent message with no buttons (e.g. "Waiting...")
        this.clear();
        this.messageEl.innerHTML = text;
        this.overlay.style.display = 'flex';
    }

    public hide() {
        this.overlay.style.display = 'none';
        this.clear();
    }

    private clear() {
        if (this.timerId) {
            window.clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.messageEl.innerText = '';
        this.buttonContainer.innerHTML = '';
    }
}
