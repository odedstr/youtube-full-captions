// Function to make a div draggable
function makeDivDraggable(div) {
	var startY, startTop;

	// Function to handle the start of dragging
	function onMouseDown(e) {
		startY = e.clientY;
		startTop = parseInt(window.getComputedStyle(div).top, 10);

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	// Function to handle the mouse movement
	function onMouseMove(e) {
		var newY = startTop + e.clientY - startY;
		div.style.top = newY + 'px';
	}

	// Function to handle the end of dragging
	function onMouseUp() {
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
	}

	div.addEventListener('mousedown', onMouseDown);
}

document.querySelector('[aria-label="Show transcript"]').click();

const captions_container = document.createElement("div");
captions_container.classList.add("youtube-full-captions-container");
captions_container.innerHTML = "<div class='youtube-full-captions-text' style=''><div>";
let player_element = document.querySelector("#player");
player_element.appendChild(captions_container);
makeDivDraggable(captions_container);

const fullscreen_captions_container = captions_container.cloneNode(true);
let fullscreen_player_element = document.querySelector("#player-full-bleed-container");
fullscreen_player_element.appendChild(fullscreen_captions_container);
makeDivDraggable(fullscreen_captions_container);


const youtube_full_captions_text_elements = document.querySelectorAll('.youtube-full-captions-container .youtube-full-captions-text');

function copyContents() {
	const activeElement = document.querySelector('.ytd-transcript-segment-list-renderer.active');
	if (activeElement) {
		youtube_full_captions_text_elements.forEach(function(element) {
			element.innerHTML = activeElement.querySelector("yt-formatted-string").innerHTML;
		});
	}
}

function setupObserver() {
	const observer = new MutationObserver((mutations, obs) => {
		for (let mutation of mutations) {
			if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
				copyContents();
			}
		}
	});

	const config = { attributes: true, childList: true, subtree: true };
	const parentElement = document.querySelector('#segments-container.ytd-transcript-segment-list-renderer');
	observer.observe(parentElement, config);

	// Optional: To stop observing at some point
	// observer.disconnect();
}

// Polling for the existence of parentElement
const checkParentElement = setInterval(() => {
	const parentElementExists = document.querySelector('#segments-container.ytd-transcript-segment-list-renderer');
	if (parentElementExists) {
		clearInterval(checkParentElement);
		setupObserver();
	}
}, 100); // checks every 500 milliseconds

