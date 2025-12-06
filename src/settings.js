// --- Defaults ---
const DEFAULTS = {
	fontScale: 1.0,
	fontPreset: "system-sans",
	fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
	fontColor: "#ffffff",
	fontWeight: "500",
	bgOpacity: 0.61
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Map preset → CSS stack. "inherit" returns null so content.js removes inline font-family
function presetToFamily(preset) {
	switch (preset) {
		case "inherit":      return null;
		case "system-serif": return "ui-serif, Georgia, 'Times New Roman', Times, serif";
		case "system-mono":  return "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
		case "system-sans":
		default:             return "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
	}
}

// --- Element refs (define ONCE) ---
const fontScaleEl    = document.querySelector("#fontScale");
const fontScaleValEl = document.querySelector("#fontScaleVal");
const fontPresetEl   = document.querySelector("#fontPreset");
const fontColorEl    = document.querySelector("#fontColor");
const fontColorHex   = document.querySelector("#fontColorHex");
const fontWeightEl   = document.querySelector("#fontWeight");
const bgOpacityEl    = document.querySelector("#bgOpacity");
const resetBtn = document.querySelector("#reset");


// helper to show value like "1.25×"
function showScaleLabel(v) {
	const num = clamp(Number(v) || 1, 0.5, 2);
	fontScaleValEl.textContent = num.toFixed(2) + "×";
}

// Debounced instant save + broadcast
function debounce(fn, ms=120){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

const saveAndBroadcast = debounce(async () => {
	const preset   = fontPresetEl.value;
	const resolved = presetToFamily(preset); // null if "inherit"

	// If preset is "inherit", keep existing stored family (unused by content.js in this mode)
	let finalFamily = resolved;
	if (finalFamily === null) {
		const cur = await chrome.storage.sync.get("fontFamily");
		finalFamily = cur.fontFamily ?? DEFAULTS.fontFamily;
	}

	const cfg = {
		fontScale: clamp(parseFloat(fontScaleEl.value), 0.5, 2),
		fontPreset: preset,
		fontFamily: finalFamily,
		fontColor: (fontColorEl.value || DEFAULTS.fontColor).toLowerCase(),
		fontWeight: fontWeightEl.value,            // 100–900 from your dropdown
		bgOpacity: parseFloat(bgOpacityEl.value)
	};

	await chrome.storage.sync.set(cfg);

	// Notify all YouTube tabs to apply immediately
	const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
	await Promise.all(
		tabs.map(t => chrome.tabs.sendMessage(t.id, { message: "ytfc:applySettings" }).catch(() => {}))
	);
}, 120);

resetBtn.addEventListener("click", async () => {
	// 1) Write defaults to storage
	await chrome.storage.sync.set(DEFAULTS);

	// 2) Reflect defaults in the UI immediately
	fontScaleEl.value  = DEFAULTS.fontScale;
	showScaleLabel(DEFAULTS.fontScale);
	fontPresetEl.value = DEFAULTS.fontPreset;
	fontColorEl.value  = DEFAULTS.fontColor;
	fontColorHex.value = DEFAULTS.fontColor;
	fontWeightEl.value = DEFAULTS.fontWeight;
	bgOpacityEl.value  = DEFAULTS.bgOpacity;

	// 3) Notify all YouTube tabs to apply now (don’t wait for debounce)
	const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
	await Promise.all(
		tabs.map(t => chrome.tabs.sendMessage(t.id, { message: "ytfc:applySettings" }).catch(() => {}))
	);
});


// --- Wire inputs to save instantly ---
fontScaleEl.addEventListener("input", () => {
	showScaleLabel(fontScaleEl.value);
	saveAndBroadcast();
});
fontPresetEl.addEventListener("change", saveAndBroadcast);
fontWeightEl.addEventListener("change", saveAndBroadcast);
bgOpacityEl.addEventListener("input",   saveAndBroadcast);

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

// --- Initial load ---
(async function load() {
	const data = await chrome.storage.sync.get(Object.keys(DEFAULTS));
	const cfg  = { ...DEFAULTS, ...data };

	fontScaleEl.value    = cfg.fontScale;
	fontPresetEl.value   = cfg.fontPreset;
	fontColorEl.value    = cfg.fontColor;
	fontColorHex.value   = cfg.fontColor;
	fontWeightEl.value   = cfg.fontWeight;
	bgOpacityEl.value    = cfg.bgOpacity;

	showScaleLabel(cfg.fontScale);
})();
