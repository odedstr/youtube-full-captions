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

	const DEFAULTS = {
		fontScale: 1.0,
		fontPreset: "system-sans", // <- NEW
		fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
		fontColor: "#ffffff",
		fontWeight: "500",
		bgOpacity: 0.61
	};
	H.settings = { ...DEFAULTS };

	async function loadSettings() {
		return new Promise((resolve) => {
			try {
				api.storage.sync.get(Object.keys(DEFAULTS), (data) => {
					H.settings = { ...DEFAULTS, ...(data || {}) };
					resolve(H.settings);
				});
			} catch {
				H.settings = { ...DEFAULTS };
				resolve(H.settings);
			}
		});
	}

	function resolveFamily(settings) {
		switch (settings.fontPreset) {
			case "inherit":     return null; // means don't set inline
			case "system-serif":return "ui-serif, Georgia, 'Times New Roman', Times, serif";
			case "system-mono": return "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
			case "system-sans":
			default:
				// Prefer stored fontFamily if present; else system-sans
				return settings.fontFamily || "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
		}
	}

	function applyStylesTo(el) {
		if (!el) return;
		const fam = resolveFamily(H.settings);

		if (fam === null) {
			// Remove any previous inline font-family so YouTube’s default takes over
			el.style.removeProperty("font-family");
		} else {
			el.style.fontFamily = fam;
		}

		el.style.color = H.settings.fontColor;
		el.style.fontWeight = H.settings.fontWeight;
		el.style.background = `rgba(0,0,0,${H.settings.bgOpacity})`;
	}






	// Unified, async onMessage handler
	api.runtime.onMessage.addListener((req) => {
		if (!req || !req.message) return;

		(async () => {
			switch (req.message) {
				case "ytfc:applySettings": {
					await loadSettings();

					// Re-apply styles to all caption nodes
					document.querySelectorAll(".youtube-full-captions-text").forEach(applyStylesTo);

					// Recompute font size now (no reliance on resize)
					const captionsText     = document.querySelector("#player .youtube-full-captions-text");
					const fullCaptionsText = document.querySelector("#player-full-bleed-container .youtube-full-captions-text");
					const player           = document.querySelector("#player");
					const fullPlayer       = document.querySelector("#player-full-bleed-container");

					recomputeFontSizeNow(player,     captionsText,     13.71, 27.35);
					recomputeFontSizeNow(fullPlayer, fullCaptionsText, 13.71, 35);

					// Optional: nudge any observers
					window.dispatchEvent(new Event("resize"));
					break;
				}

				case "turnOn": {
					if (H.on) {
						console.log("[YTFULLCAP] already ON, ignoring");
						break;
					}
					H.on = true;
					try {
						await turnOn();
					} catch (e) {
						console.error("[YTFULLCAP] turnOn failed:", e);
					}
					break;
				}

				case "turnOff": {
					location.reload();
					break;
				}

				default:
					// no-op
					break;
			}
		})().catch((e) => console.error("[YTFULLCAP] onMessage error:", e));
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

	function getScale() {
		const s = H.settings?.fontScale ?? 1;
		return Math.max(0.5, Math.min(2, Number(s) || 1));
	}


	function adjustFontSize(entry, percentage, textElement, minPx, maxPx) {
		const scale = getScale();
		const minScaled = minPx * scale;
		const maxScaled = maxPx * scale;

		const width = entry.target.offsetWidth;
		let fontSize = width * (percentage / 100) * scale;

		if (Number.isFinite(minScaled)) fontSize = Math.max(minScaled, fontSize);
		if (Number.isFinite(maxScaled)) fontSize = Math.min(maxScaled, fontSize);

		textElement.style.fontSize = `${fontSize}px`;
	}

	function recomputeFontSizeNow(containerEl, textEl, minPx, maxPx) {
		if (!containerEl || !textEl) return;
		const scale = getScale();
		const minScaled = minPx * scale;
		const maxScaled = maxPx * scale;

		const width = containerEl.offsetWidth || containerEl.getBoundingClientRect().width || 0;
		let fontSize = width * (3 / 100) * scale;

		if (Number.isFinite(minScaled)) fontSize = Math.max(minScaled, fontSize);
		if (Number.isFinite(maxScaled)) fontSize = Math.min(maxScaled, fontSize);

		textEl.style.fontSize = `${fontSize}px`;
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

	// Build transcript index (start seconds → text)
	function getTranscriptPanel() {
		return (
			document.querySelector(
				'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]'
			) ||
			document.querySelector(
				'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
			)
		);
	}

	function buildTranscriptIndex() {
		const panel = getTranscriptPanel();

		if (!panel) {
			H.segments = [];
			H.currentSegIndex = -1;
			console.warn("[YTFULLCAP] transcript panel not found");
			return;
		}

		const nodes = panel.querySelectorAll("transcript-segment-view-model");
		const segs = [];

		nodes.forEach((node) => {
			const tsEl = node.querySelector(".ytwTranscriptSegmentViewModelTimestamp");
			const txtEl = node.querySelector(
				'span[role="text"], .ytAttributedStringHost, span.yt-core-attributed-string'
			);

			if (!tsEl || !txtEl) return;

			const t = parseTimestamp(tsEl.textContent || "");
			if (t === null) return;

			segs.push({
				start: t,
				text: txtEl.textContent || ""
			});
		});

		segs.sort((a, b) => a.start - b.start);
		H.segments = segs;
		H.currentSegIndex = -1;

		console.log("[YTFULLCAP] built segments:", segs.length);
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
			const text = H.segments[i].text;
			allCaptionTexts.forEach((el) => {
				if (H.hideTimeout) clearTimeout(H.hideTimeout);
				el.style.display = "block";
				el.textContent = text;
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
		console.log("[YTFULLCAP] turnOn start");
		await loadSettings();
		// Ensure CC is on
		await waitForElement("button.ytp-subtitles-button", -1);
		console.log("[YTFULLCAP] subtitles button found");
		const ccBtn = document.querySelector('button.ytp-subtitles-button[aria-pressed="false"]');
		if (ccBtn) ccBtn.click();

		// Try to open transcript panel (some videos won’t have it)
		const transcriptBtnSel = "#structured-description .ytd-video-description-transcript-section-renderer button";
		try {
			await waitForElement(transcriptBtnSel, 8000);
			const transcriptBtn = document.querySelector(transcriptBtnSel);
			if (transcriptBtn) transcriptBtn.click();
			console.log("[YTFULLCAP] transcript button clicked");
		} catch {
			console.warn("[YTFULLCAP] transcript button not found (continuing)");
		}

		// Create/reuse caption containers
		await waitForElement("#player", -1);
		console.log("[YTFULLCAP] player found");
		await waitForElement(".caption-window.ytp-caption-window-bottom", -1);
		console.log("[YTFULLCAP] original caption window found");

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
		console.log("[YTFULLCAP] captions container added");
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
		applyStylesTo(captionsText);
		applyStylesTo(fullCaptionsText);

		// recomputeFontSizeNow(player, captionsText, 13.71, 27.35);
		// recomputeFontSizeNow(fullPlayer, fullCaptionsText, 13.71, 35);

		// recomputeFontSizeNow(player,     captionsText,     8, 90);
		// recomputeFontSizeNow(fullPlayer, fullCaptionsText, 8, 120);

		recomputeFontSizeNow(player, captionsText, 8, 60);
		recomputeFontSizeNow(fullPlayer, fullCaptionsText, 8, 80);


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
				// for (const entry of entries) adjustFontSize(entry, 3, captionsText, 13.71, 27.35);
				// for (const entry of entries) adjustFontSize(entry, 3, captionsText, 8, 90);
				for (const e of entries) adjustFontSize(e, 3, captionsText, 8, 60);
			});
			H.resizeObserver.observe(player);
		}
		if (!H.fullscreenResizeObserver) {
			H.fullscreenResizeObserver = new ResizeObserver((entries) => {
				// for (const entry of entries) adjustFontSize(entry, 3, fullCaptionsText, 13.71, 35);
				// for (const entry of entries) adjustFontSize(entry, 3, fullCaptionsText, 8, 120);
				for (const e of entries) adjustFontSize(e, 3, fullCaptionsText, 8, 80);
			});
			H.fullscreenResizeObserver.observe(fullPlayer);
		}


		const allCaptionTexts = document.querySelectorAll(
			".youtube-full-captions-container .youtube-full-captions-text"
		);

		// Build transcript index & start time-based sync
		try {
			console.log("[YTFULLCAP] waiting for transcript panel");

			const transcriptPanel = await Promise.any([
				waitForElement(
					'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]',
					10000
				),
				waitForElement(
					'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
					10000
				)
			]);

			console.log("[YTFULLCAP] transcript panel found");
			console.log(
				"[YTFULLCAP] transcript rows in PAmodern_transcript_view:",
				document.querySelectorAll(
					'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"] transcript-segment-view-model'
				).length
			);
			console.log(
				"[YTFULLCAP] transcript rows in engagement-panel-searchable-transcript:",
				document.querySelectorAll(
					'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] transcript-segment-view-model'
				).length
			);

			buildTranscriptIndex();
			observeTranscriptChanges(transcriptPanel);
		} catch {
			console.warn("[YTFULLCAP] transcript panel not found (continuing; no captions will show)");
		}

		const video = document.querySelector("video");
		if (video) {
			console.log("[YTFULLCAP] video found:", !!video);
			startTimeSync(video, allCaptionTexts);
		} else {
			console.warn("[YTFULLCAP] <video> element not found");
		}
	}
})();
