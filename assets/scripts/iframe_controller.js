document.addEventListener('DOMContentLoaded', function () {
    const iframes = document.querySelectorAll('.post-frame iframe');

    iframes.forEach(iframe => {
        const container = iframe.closest('.post-frame');
        const placeholder = container.querySelector('.youtube-placeholder');
        const errorBlock = container.querySelector('.youtube-error');
        const videoId = new URL(iframe.src).searchParams.get('v') || iframe.src.split('/').pop();

        let isLoaded = false;
        let loadTimer;

        iframe.addEventListener('load', function () {
            isLoaded = true;
            clearTimeout(loadTimer);
            placeholder.style.display = 'none';
            iframe.classList.add('loaded');
        });

        loadTimer = setTimeout(function () {
            if (!isLoaded) {
                placeholder.style.display = 'none';
                errorBlock.style.display = 'flex';
            }
        }, 10000);
    });
});