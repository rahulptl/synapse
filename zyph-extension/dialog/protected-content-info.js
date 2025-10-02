document.addEventListener('DOMContentLoaded', () => {
    const okBtn = document.getElementById('ok-btn');

    function closeDialog() {
        window.close();
    }

    // Event listeners
    okBtn.addEventListener('click', closeDialog);

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDialog();
        }
    });

    // Close on background click
    document.addEventListener('click', (e) => {
        if (e.target === document.body) {
            closeDialog();
        }
    });
});