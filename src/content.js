function adjustFontSize(entry, percentage, textElement, minFontSize, maxFontSize) {
	var container = entry.target; // The container that was resized

	var containerWidth = container.offsetWidth;

	// Calculate font size: here, it's a percentage of the container's width
	var fontSize = containerWidth * (percentage / 100);

	// Ensure the font size is within the specified bounds
	fontSize = Math.max(minFontSize, Math.min(fontSize, maxFontSize));

	textElement.style.fontSize = fontSize + 'px';
}

function monitorElementPosition(element, container, onOutCallback, onInCallback) {
	let isOutside = false;

	const checkPosition = () => {
		const elemRect = element.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();

		const outsideHorizontal = elemRect.right < containerRect.left || elemRect.left > containerRect.right;
		const outsideVertical = elemRect.bottom < containerRect.top || elemRect.top > containerRect.bottom;

		if ((outsideHorizontal || outsideVertical) && !isOutside) {
			isOutside = true;
			onOutCallback(element); // Call the out callback
		} else if (!outsideHorizontal && !outsideVertical && isOutside) {
			isOutside = false;
			onInCallback(element); // Call the in callback
		}
	};

	document.addEventListener('mousemove', checkPosition);
	document.addEventListener('mouseup', checkPosition);
	window.addEventListener('resize', checkPosition);

	// Initial check
	checkPosition();

	// Optional: Return a function to stop monitoring
	return () => {
		document.removeEventListener('mousemove', checkPosition);
		document.removeEventListener('mouseup', checkPosition);
		window.removeEventListener('resize', checkPosition);
	};

}

// Function to make a div draggable
function makeDivDraggable(div) {
	var startY, startTopPercent, containerHeight;

	// Function to handle the start of dragging
	function onMouseDown(e) {
		startY = e.clientY;
		containerHeight = div.parentElement.offsetHeight; // Get the height of the parent container
		const startTop = parseInt(window.getComputedStyle(div).top, 10);
		startTopPercent = (startTop / containerHeight) * 100; // Convert to percentage

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	// Function to handle the mouse movement
	function onMouseMove(e) {
		var deltaY = e.clientY - startY;
		var newTopPercent = startTopPercent + (deltaY / containerHeight) * 100;
		div.style.top = newTopPercent + '%'; // Set the top position in percentage
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
const captions_text_element = captions_container.querySelector(".youtube-full-captions-text");

makeDivDraggable(captions_container);

monitorElementPosition(captions_text_element,
	player_element,
	function(element){
		element.classList.add("outside-container");
	},
	function(element){
		element.classList.remove("outside-container");
	});

var resizeObserver = new ResizeObserver(function(entries) {
	// For all entries (there should only be one in this case)
	for (let entry of entries) {
		adjustFontSize(entry, 3, captions_text_element, 13.71, 27.35);
	}
});
resizeObserver.observe(player_element);



const fullscreen_captions_container = captions_container.cloneNode(true);
let fullscreen_player_element = document.querySelector("#player-full-bleed-container");
fullscreen_player_element.classList.add('youtube-full-captions-container-fullscreen');
fullscreen_player_element.appendChild(fullscreen_captions_container);
const fullscreen_captions_text_element = fullscreen_captions_container.querySelector(".youtube-full-captions-text");

makeDivDraggable(fullscreen_captions_container);

var fullscreenResizeObserver = new ResizeObserver(function(entries) {
	// For all entries (there should only be one in this case)
	for (let entry of entries) {
		adjustFontSize(entry, 3, fullscreen_captions_text_element, 13.71, 27.35);
	}
});
fullscreenResizeObserver.observe(fullscreen_player_element);


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

