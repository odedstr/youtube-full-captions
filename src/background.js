// background.js (MV3 - Chrome)
const ICONS_OFF = {
	16: "images/icon-16.png",
	32: "images/icon-32.png",
	48: "images/icon-48.png",
	128: "images/icon-128.png",
};
const ICONS_ON = {
	16: "images/icon-on-16.png",
	32: "images/icon-on-32.png",
	48: "images/icon-on-48.png",
	128: "images/icon-on-128.png",
};

const key = (tabId) => `t${tabId}`;

async function setActive(tabId, active) {
	await chrome.storage.session.set({ [key(tabId)]: { active } });
	await chrome.action.setIcon({ tabId, path: active ? ICONS_ON : ICONS_OFF });
	await chrome.action.setTitle({
		tabId,
		title: active
			? "YouTube Full Captions — ON (click to turn OFF)"
			: "YouTube Full Captions — OFF (click to turn ON)",
	});
}

async function isActive(tabId) {
	const obj = await chrome.storage.session.get(key(tabId));
	return !!(obj[key(tabId)] && obj[key(tabId)].active);
}

async function ensureYouTube(tab) {
	// Optional: only run on YouTube (prevents errors on other sites)
	try {
		if (!tab || !tab.url) return false;
		return /:\/\/(www\.)?youtube\.com\//i.test(tab.url);
	} catch {
		return false;
	}
}

chrome.action.onClicked.addListener(async (tab) => {
	if (!(await ensureYouTube(tab))) {
		// Optional: flash badge or title if not on YouTube
		chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
		setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 1000);
		return;
	}

	if (!(await isActive(tab.id))) {
		// Turn ON → inject then message (chain to avoid races)
		try {
			await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				files: ["content.js"],
			});
			await chrome.scripting.insertCSS({
				target: { tabId: tab.id },
				files: ["content.css"],
			});
			await chrome.tabs.sendMessage(tab.id, { message: "turnOn" });
			await setActive(tab.id, true);
		} catch (e) {
			console.error("[YTFULLCAP] inject failed:", e);
		}
	} else {
		// Turn OFF → reload tab
		try {
			await chrome.tabs.reload(tab.id);
		} finally {
			await setActive(tab.id, false);
		}
	}
});

// Reset per-tab state on reloads/close (so second click = ON again)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status === "loading") {
		await chrome.storage.session.remove(key(tabId));
		await chrome.action.setIcon({ tabId, path: ICONS_OFF });
		await chrome.action.setTitle({
			tabId,
			title: "YouTube Full Captions — OFF (click to turn ON)",
		});
	}
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
	await chrome.storage.session.remove(key(tabId));
});

// Optional: keep icons sane on install/update
chrome.runtime.onInstalled.addListener(async () => {
	// nothing required; per-tab icons are set on-demand
});
