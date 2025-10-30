const portInput = document.getElementById('port') as HTMLInputElement | null;
const saveButton = document.getElementById('submit') as HTMLButtonElement | null;

if (portInput) {
    portInput.addEventListener('change', () => {
        console.log('Port input changed:', portInput.value);
    });
}

if (saveButton && portInput) {
    saveButton.addEventListener('click', () => {
        console.log('Save button clicked');
        const port = parseInt(portInput.value);
        if (port) {
            (window as any).electronAPI.setPort(port);
            console.log('Port changed to:', port);
            window.close();
        }
    });
}
