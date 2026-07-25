// --- Defaults (also the "Classic" preset) ---
const DEFAULTS = {
	fontScale: 1.0,
	fontPreset: "system-sans",
	fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
	fontColor: "#ffffff",
	fontWeight: "500",
	bgOpacity: 0.61,
	captionExtraSeconds: 0
};
const PRESETS = {
	Minimalistic: {
		fontScale: 0.9,
		fontPreset: "system-sans",
		fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
		fontColor: "#ffffff",
		fontWeight: "100",
		bgOpacity: 0.15
	},
	Classic: { ...DEFAULTS },
	HighContrast: {
		fontScale: 1.5, // ← was 1.6
		fontPreset: "system-sans",
		fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
		fontColor: "#ffd400",
		fontWeight: "700",
		bgOpacity: 0.9
	}
};


// ---- helpers ---------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function presetToFamily(preset) {
	switch (preset) {
		case "inherit":      return null;
		case "system-serif": return "ui-serif, Georgia, 'Times New Roman', Times, serif";
		case "system-mono":  return "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
		case "system-sans":
		default:             return "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
	}
}
function debounce(fn, ms=120){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

// ---- element refs (ensure these IDs exist in settings.html) -----
const presetSelect   = document.querySelector("#presetSelect");
const fontScaleEl    = document.querySelector("#fontScale");
const fontScaleValEl = document.querySelector("#fontScaleVal");
const fontPresetEl   = document.querySelector("#fontPreset");
const fontColorEl    = document.querySelector("#fontColor");
const fontColorHex   = document.querySelector("#fontColorHex");
const fontWeightEl   = document.querySelector("#fontWeight"); // 100..900
const bgOpacityEl    = document.querySelector("#bgOpacity");
const captionExtraSecondsEl = document.querySelector("#captionExtraSeconds");

// live scale label: "1.25×"
function showScaleLabel(v) {
	const num = clamp(Number(v) || 1, 0.5, 2);
	fontScaleValEl.textContent = num.toFixed(2) + "×";
}
function normalizeExtraSeconds(v) {
	const num = Number(v);
	return Number.isFinite(num) && num >= 0 ? num : DEFAULTS.captionExtraSeconds;
}

// cache for current stored family so "inherit" doesn't need async read every time
let fontFamilyCached = DEFAULTS.fontFamily;

// Build config from current UI controls
function buildCfgFromUI() {
	const preset   = fontPresetEl.value;           // inherit/system-sans/system-serif/system-mono
	const resolved = presetToFamily(preset);       // null means "inherit"
	return {
		fontScale: clamp(parseFloat(fontScaleEl.value), 0.5, 2),
		fontPreset: preset,
		fontFamily: resolved ?? fontFamilyCached,     // keep last stored if inherit
		fontColor: (fontColorEl.value || DEFAULTS.fontColor).toLowerCase(),
		fontWeight: fontWeightEl.value,
		bgOpacity: parseFloat(bgOpacityEl.value),
		captionExtraSeconds: normalizeExtraSeconds(captionExtraSecondsEl.value)
	};
}

// Apply a config object to the UI controls (no storage)
function applyCfgToUI(cfg, includeTiming = true) {
	fontScaleEl.value  = cfg.fontScale;
	showScaleLabel(cfg.fontScale);
	fontPresetEl.value = cfg.fontPreset;
	fontColorEl.value  = cfg.fontColor;
	fontColorHex.value = cfg.fontColor;
	fontWeightEl.value = cfg.fontWeight;
	bgOpacityEl.value  = cfg.bgOpacity;
	if (includeTiming) {
		captionExtraSecondsEl.value = normalizeExtraSeconds(cfg.captionExtraSeconds);
	}
}

// Core writer + broadcaster (immediate)
async function writeAndBroadcast() {
	const cfg = buildCfgFromUI();
	fontFamilyCached = cfg.fontFamily;

	await chrome.storage.sync.set(cfg);
	// mirror into "Current"
	await chrome.storage.sync.set({ currentPreset: cfg });

	const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
	const api = (typeof browser !== "undefined") ? browser : chrome;

	const tasks = tabs.map((t) => (async () => {
		try {
			await api.tabs.sendMessage(t.id, { message: "ytfc:applySettings" });
		} catch (_) {
			// ignore tabs without the content script
		}
	})());

	await Promise.all(tasks);

}

// Debounced version for sliders/typing
const saveAndBroadcast = debounce(writeAndBroadcast, 120);

// Load "Current" (or migrate from old keys) into UI on open
async function loadCurrentIntoUI() {
	const data = await chrome.storage.sync.get(["currentPreset", ...Object.keys(DEFAULTS)]);
	const current = data.currentPreset
		? { ...DEFAULTS, ...data.currentPreset }
		: { ...DEFAULTS, ...data }; // migration path
	fontFamilyCached = current.fontFamily;
	applyCfgToUI(current);
	// Per your spec: show "Current" when opening the page
	if (presetSelect) presetSelect.value = "Current";
}

// ---- event wiring ----------------------------------------------

// Preset dropdown (Minimalistic / Classic / HighContrast / Current)
if (presetSelect) {
	presetSelect.addEventListener("change", async () => {
		const choice = presetSelect.value;
		if (choice === "Current") {
			await loadCurrentIntoUI();         // just reflect Current; no write
		} else {
			const presetCfg = PRESETS[choice] || DEFAULTS;
			applyCfgToUI(presetCfg, false);    // update visual controls only
			await writeAndBroadcast();         // apply immediately + save into Current
			// Do NOT change presetSelect here — it stays on the chosen preset
		}
	});
}

// Controls that should save debounced
fontScaleEl.addEventListener("input",  () => { showScaleLabel(fontScaleEl.value); saveAndBroadcast(); });
fontPresetEl.addEventListener("change", saveAndBroadcast);
fontWeightEl.addEventListener("change", saveAndBroadcast);
bgOpacityEl.addEventListener("input",   saveAndBroadcast);
captionExtraSecondsEl.addEventListener("input", saveAndBroadcast);

// Color inputs
fontColorEl.addEventListener("input", () => {
	fontColorHex.value = (fontColorEl.value || "").toLowerCase();
	saveAndBroadcast();
});
fontColorHex.addEventListener("input", () => {
	const v = fontColorHex.value.trim();
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
		fontColorEl.value = v.toLowerCase();
		saveAndBroadcast();
	}
});

// Initial load
loadCurrentIntoUI();
