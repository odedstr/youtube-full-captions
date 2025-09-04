// content.js
(() => {
	// Cross-browser API alias
	const api = typeof browser !== "undefined" ? browser : chrome;

	// Prevent duplicate injection across reinjections
	if (window.__YTFULLCAP_BOOTED__) {
		console.log("[YTFULLCAP] duplicate injection ignored");
		return;
	}
	window.__YTFULLCAP_BOOTED__ = true;
	console.log("[YTFULLCAP] content.js loaded");

	// Long-lived handles / state
	const H = (window.__YTFULLCAP_HANDLES__ ||= {
		on: false,
		resizeObserver: null,
		fullscreenResizeObserver: null,
		stopMonitorMain: null,
		stopMonitorFull: null,
		hideTimeout: null,
		// Time-based transcript sync
		segments: [],
		currentSegIndex: -1,
		segmentsObserver: null,
		videoListener: null,
	});

	api.runtime.onMessage.addListener(async (req) => {
		if (req.message === "turnOn") {
			if (H.on) {
				console.log("[YTFULLCAP] already ON, ignoring");
				return;
			}
			H.on = true;
			try {
				await turnOn();
			} catch (e) {
				console.error("[YTFULLCAP] turnOn failed:", e);
			}
		} else if (req.message === "turnOff") {
			location.reload();
		}
	});

	// ---------- Helpers ----------
	function waitForElement(selector, timeout = 30000) {
		return new Promise((resolve, reject) => {
			const intervalTime = 100;
			let elapsed = 0;
			const it = setInterval(() => {
				const el = document.querySelector(selector);
				if (el) {
					clearInterval(it);
					resolve(el);
				} else if (timeout !== -1 && elapsed > timeout) {
					clearInterval(it);
					reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
				}
				elapsed += intervalTime;
			}, intervalTime);
		});
	}

	function adjustFontSize(entry, percentage, textElement, minPx, maxPx) {
		const containerWidth = entry.target.offsetWidth;
		let fontSize = containerWidth * (percentage / 100);
		fontSize = Math.max(minPx, Math.min(fontSize, maxPx));
		textElement.style.fontSize = fontSize + "px";
	}

	function monitorElementPosition(element, container, onOut, onIn) {
		let isOutside = false;
		const check = () => {
			const elemRect = element.getBoundingClientRect();
			const contRect = container.getBoundingClientRect();
			const outsideH = elemRect.right < contRect.left || elemRect.left > contRect.right;
			const outsideV = elemRect.bottom < contRect.top || elemRect.top > contRect.bottom;

			if ((outsideH || outsideV) && !isOutside) {
				isOutside = true; onOut(element);
			} else if (!outsideH && !outsideV && isOutside) {
				isOutside = false; onIn(element);
			}
		};

		document.addEventListener("mousemove", check);
		document.addEventListener("mouseup", check);
		window.addEventListener("resize", check);
		check();

		return () => {
			document.removeEventListener("mousemove", check);
			document.removeEventListener("mouseup", check);
			window.removeEventListener("resize", check);
		};
	}

	function makeDivDraggable(div) {
		let startY, startTopPercent, containerHeight;

		function onMouseDown(e) {
			startY = e.clientY;
			containerHeight = div.parentElement.offsetHeight;
			const startTop = parseInt(getComputedStyle(div).top, 10);
			startTopPercent = (startTop / containerHeight) * 100;
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		}
		function onMouseMove(e) {
			const deltaY = e.clientY - startY;
			const newTopPercent = startTopPercent + (deltaY / containerHeight) * 100;
			div.style.top = newTopPercent + "%";
		}
		function onMouseUp() {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		}

		div.addEventListener("mousedown", onMouseDown);
	}

	function redirectClickEventOnElement(element) {
		let isDragging = false;
		element.addEventListener("mousedown", () => { isDragging = false; });
		element.addEventListener("mousemove", () => { isDragging = true; });
		element.addEventListener("mouseup", (event) => {
			if (isDragging) return;
			event.preventDefault();
			const { clientX: x, clientY: y } = event;
			element.style.visibility = "hidden";
			const below = document.elementFromPoint(x, y);
			element.style.visibility = "visible";
			if (below) below.click();
		});
	}

	// Timestamp parsing: "mm:ss" or "hh:mm:ss" → seconds
	function parseTimestamp(text) {
		const parts = text.trim().split(":").map(p => parseInt(p, 10));
		if (!parts.length || parts.some(Number.isNaN)) return null;
		return parts.reduce((acc, v) => acc * 60 + v, 0);
	}

	// Build transcript index (start seconds → HTML text)
	function buildTranscriptIndex() {
		const nodes = document.querySelectorAll("ytd-transcript-segment-renderer");
		const segs = [];
		nodes.forEach((node) => {
			const tsEl = node.querySelector(".segment-timestamp");
			const txtEl = node.querySelector(".segment-text");
			if (!tsEl || !txtEl) return;
			const t = parseTimestamp(tsEl.textContent || "");
			if (t === null) return;
			segs.push({ start: t, html: txtEl.innerHTML });
		});
		segs.sort((a, b) => a.start - b.start);
		H.segments = segs;
		H.currentSegIndex = -1;
		// console.log("[YTFULLCAP] transcript indexed:", segs.length, "segments");
	}

	// Binary search for current segment by time 't'
	function indexForTime(t) {
		const segs = H.segments;
		if (!segs || segs.length === 0) return -1;
		let lo = 0, hi = segs.length - 1, ans = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (segs[mid].start <= t) { ans = mid; lo = mid + 1; }
			else { hi = mid - 1; }
		}
		return ans;
	}

	// Attach a single timeupdate listener (idempotent)
	function startTimeSync(video, allCaptionTexts) {
		if (H.videoListener) return;

		H.videoListener = () => {
			if (!H.segments || H.segments.length === 0) return;
			const t = video.currentTime || 0;
			const i = indexForTime(t);
			if (i < 0 || i === H.currentSegIndex) return;

			H.currentSegIndex = i;
			const html = H.segments[i].html;
			allCaptionTexts.forEach((el) => {
				if (H.hideTimeout) clearTimeout(H.hideTimeout);
				el.style.display = "block";
				el.innerHTML = html;
			});
			H.hideTimeout = setTimeout(() => {
				allCaptionTexts.forEach(el => { el.style.display = "none"; });
			}, 7000);
		};

		video.addEventListener("timeupdate", H.videoListener);
	}

	// Observe transcript changes (e.g., language switch) to rebuild index
	function observeTranscriptChanges(listEl) {
		if (H.segmentsObserver) return;
		H.segmentsObserver = new MutationObserver((muts) => {
			for (const m of muts) {
				if (m.type === "childList") {
					buildTranscriptIndex();
					break;
				}
			}
		});
		H.segmentsObserver.observe(listEl, { childList: true, subtree: true });
	}

	// ---------- Main ----------
	async function turnOn() {
		// Ensure CC is on
		await waitForElement("button.ytp-subtitles-button", -1);
		const ccBtn = document.querySelector('button.ytp-subtitles-button[aria-pressed="false"]');
		if (ccBtn) ccBtn.click();

		// Try to open transcript panel (some videos won’t have it)
		const transcriptBtnSel = "#structured-description .ytd-video-description-transcript-section-renderer button";
		try {
			await waitForElement(transcriptBtnSel, 8000);
			const transcriptBtn = document.querySelector(transcriptBtnSel);
			if (transcriptBtn) transcriptBtn.click();
		} catch {
			console.warn("[YTFULLCAP] transcript button not found (continuing)");
		}

		// Create/reuse caption containers
		await waitForElement("#player", -1);
		await waitForElement(".caption-window.ytp-caption-window-bottom", -1);

		const player = document.querySelector("#player");
		let captionsContainer = player.querySelector(".youtube-full-captions-container");
		if (!captionsContainer) {
			captionsContainer = document.createElement("div");
			captionsContainer.classList.add("youtube-full-captions-container");
			captionsContainer.innerHTML = "<div class='youtube-full-captions-text'>Loading...</div>";
			player.appendChild(captionsContainer);
			redirectClickEventOnElement(captionsContainer);
			makeDivDraggable(captionsContainer);
		}
		const captionsText = captionsContainer.querySelector(".youtube-full-captions-text");

		// Fullscreen overlay
		const fullPlayer = document.querySelector("#player-full-bleed-container");
		let fullCaptionsContainer = fullPlayer.querySelector(".youtube-full-captions-container");
		if (!fullCaptionsContainer) {
			fullPlayer.classList.add("youtube-full-captions-container-fullscreen");
			fullCaptionsContainer = captionsContainer.cloneNode(true);
			fullPlayer.appendChild(fullCaptionsContainer);
			makeDivDraggable(fullCaptionsContainer);
		}
		const fullCaptionsText = fullCaptionsContainer.querySelector(".youtube-full-captions-text");

		// Outside/inside class toggling (attach once)
		if (!H.stopMonitorMain) {
			H.stopMonitorMain = monitorElementPosition(
				captionsText, player,
				(el) => el.classList.add("outside-container"),
				(el) => el.classList.remove("outside-container"),
			);
		}
		if (!H.stopMonitorFull) {
			H.stopMonitorFull = monitorElementPosition(
				fullCaptionsText, fullPlayer,
				(el) => el.classList.add("outside-container"),
				(el) => el.classList.remove("outside-container"),
			);
		}

		// Resize observers (attach once)
		if (!H.resizeObserver) {
			H.resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) adjustFontSize(entry, 3, captionsText, 13.71, 27.35);
			});
			H.resizeObserver.observe(player);
		}
		if (!H.fullscreenResizeObserver) {
			H.fullscreenResizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) adjustFontSize(entry, 3, fullCaptionsText, 13.71, 35);
			});
			H.fullscreenResizeObserver.observe(fullPlayer);
		}

		const allCaptionTexts = document.querySelectorAll(
			".youtube-full-captions-container .youtube-full-captions-text"
		);

		// Build transcript index & start time-based sync
		try {
			const listEl = await waitForElement("#segments-container.ytd-transcript-segment-list-renderer", 10000);
			buildTranscriptIndex();
			observeTranscriptChanges(listEl);
		} catch {
			console.warn("[YTFULLCAP] transcript segments not found (continuing; no captions will show)");
		}

		const video = document.querySelector("video");
		if (video) {
			startTimeSync(video, allCaptionTexts);
		} else {
			console.warn("[YTFULLCAP] <video> element not found");
		}
	}
})();
