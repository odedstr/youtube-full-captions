
if (typeof resizeObserver === 'undefined') {

	let resizeObserver = null;
	let fullscreenResizeObserver = null;
	let waitForActiveClassObserver = null;
	let captions_text_element_stop_monitor_positison = null;
	let fullscreen_captions_text_element_stop_monitor_positison = null;
	let hide_captions_timeout_handle = null

	chrome.runtime.onMessage.addListener(
		async function (request, sender, sendResponse) {
			if (request.message === "turnOn") {
				await turnOn();
			} else if (request.message === "turnOff") {
				location.reload();
			}
		}
	);

	function waitForElement(selector, timeout = 30000) {
		return new Promise((resolve, reject) => {
			const intervalTime = 100; // Interval check time in milliseconds
			let elapsedTime = 0; // Time elapsed since the function was called

			const interval = setInterval(() => {
				const element = document.querySelector(selector);
				if (element) {
					clearInterval(interval);
					resolve(element);
				} else if (timeout !== -1 && elapsedTime > timeout) {
					clearInterval(interval);
					reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms`));
				}
				elapsedTime += intervalTime;
			}, intervalTime);
		});
	}

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

	function redirectClickEventOnElement(element) {
		let isDragging = false;

		element.addEventListener('mousedown', function (event) {
			isDragging = false;
		});

		element.addEventListener('mousemove', function (event) {
			isDragging = true;
		});

		element.addEventListener('mouseup', function (event) {
			if (isDragging) {
				// The element was dragged, do not redirect the click
				return;
			}

			// Prevent the default action of the click
			event.preventDefault();

			// Get the x and y coordinates of the click
			let x = event.clientX;
			let y = event.clientY;

			// Temporarily hide the clicked element
			element.style.visibility = 'hidden';

			// Find the element below the clicked element
			let elementBelow = document.elementFromPoint(x, y);

			// Restore the visibility of the clicked element
			element.style.visibility = 'visible';

			// If there is an element below, simulate a click on it
			if (elementBelow) {
				elementBelow.click();
			}
		});
	}

	async function turnOn() {

		await waitForElement("button.ytp-subtitles-button", -1);

		const youtube_cc_button_unpressed = document.querySelector('button.ytp-subtitles-button[aria-pressed="false"]');
		if (youtube_cc_button_unpressed !== null) {
			youtube_cc_button_unpressed.click();
		}

		const show_transcript_button_selector = '#structured-description .ytd-video-description-transcript-section-renderer button';
		await waitForElement(show_transcript_button_selector, -1);
		document.querySelector(show_transcript_button_selector).click();

		const captions_container = document.createElement("div");
		captions_container.classList.add("youtube-full-captions-container");
		captions_container.innerHTML = "<div class='youtube-full-captions-text' style=''>Loading...<div>";

		await waitForElement("#player", -1);

		await waitForElement(".caption-window.ytp-caption-window-bottom", -1);

		let player_element = document.querySelector("#player");
		player_element.appendChild(captions_container);
		const captions_text_element = captions_container.querySelector(".youtube-full-captions-text");

		redirectClickEventOnElement(captions_container);

		makeDivDraggable(captions_container);

		captions_text_element_stop_monitor_positison = monitorElementPosition(captions_text_element,
			player_element,
			function (element) {
				element.classList.add("outside-container");
			},
			function (element) {
				element.classList.remove("outside-container");
			});

		resizeObserver = new ResizeObserver(function (entries) {
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

		fullscreen_captions_text_element_stop_monitor_positison = monitorElementPosition(fullscreen_captions_text_element,
			fullscreen_player_element,
			function (element) {
				element.classList.add("outside-container");
			},
			function (element) {
				element.classList.remove("outside-container");
			});


		fullscreenResizeObserver = new ResizeObserver(function (entries) {
			// For all entries (there should only be one in this case)
			for (let entry of entries) {
				adjustFontSize(entry, 3, fullscreen_captions_text_element, 13.71, 35);
			}
		});
		fullscreenResizeObserver.observe(fullscreen_player_element);


		const youtube_full_captions_text_elements = document.querySelectorAll('.youtube-full-captions-container .youtube-full-captions-text');

		function copyContents() {
			const activeElement = document.querySelector('.ytd-transcript-segment-list-renderer.active');
			if (activeElement) {
				youtube_full_captions_text_elements.forEach(function (element) {

					if(hide_captions_timeout_handle !== null) {
						clearTimeout(hide_captions_timeout_handle);
					}
					element.style.display = 'block';
					element.innerHTML = activeElement.querySelector("yt-formatted-string").innerHTML;
					hide_captions_timeout_handle = setTimeout(function() {
						element.style.display = 'none';
					}, 7000);
				});
			}
		}

		await waitForElement('#segments-container.ytd-transcript-segment-list-renderer', -1);

		waitForActiveClassObserver = new MutationObserver((mutations, obs) => {
			for (let mutation of mutations) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					copyContents();
				}
			}
		});

		const config = {attributes: true, childList: true, subtree: true};
		const parentElement = document.querySelector('#segments-container.ytd-transcript-segment-list-renderer');
		waitForActiveClassObserver.observe(parentElement, config);

	}

}
