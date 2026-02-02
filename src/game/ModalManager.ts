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
        this.overlay.style.display = 'flex';
    }

    public showSelectionDialog(title: string, options: { label: string, value: any }[], onSelect: (value: any) => void) {
        this.clear();
        this.messageEl.innerHTML = `<h2 style="margin-bottom: 20px;">${title}</h2>`;

        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '10px';
        list.style.width = '100%';

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'modal-button';
            btn.style.width = '100%';
            btn.style.fontSize = '1.2rem';
            btn.style.padding = '10px';
            btn.innerText = opt.label;
            btn.onclick = () => {
                this.hide();
                onSelect(opt.value);
            };
            list.appendChild(btn);
        });

        this.messageEl.appendChild(list);
        this.overlay.style.display = 'flex';
    }

    public showMessage(text: string) {
        // Persistent message with no buttons (e.g. "Waiting...")
        this.clear();
        this.messageEl.innerHTML = text;
        this.overlay.style.display = 'flex';
    }

    public showCustomContent(content: HTMLElement) {
        // Show arbitrary HTML content in the modal (for lobby screens)
        this.clear();
        this.messageEl.appendChild(content);
        this.overlay.style.display = 'flex';
    }

    public updateCustomContent(content: HTMLElement) {
        // Update content without clearing timer (for lobby screen transitions)
        this.messageEl.innerHTML = '';
        this.buttonContainer.innerHTML = '';
        this.messageEl.appendChild(content);
    }

    public isVisible(): boolean {
        return this.overlay.style.display !== 'none';
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
        this.messageEl.innerHTML = '';
        this.buttonContainer.innerHTML = '';
    }
}
