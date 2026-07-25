// background.js (MV3)

const ICONS_OFF = {16:"images/icon-16.png",32:"images/icon-32.png",48:"images/icon-48.png",128:"images/icon-128.png"};
const ICONS_ON  = {16:"images/icon-on-16.png",32:"images/icon-on-32.png",48:"images/icon-on-48.png",128:"images/icon-on-128.png"};
const key = (tabId) => `t${tabId}`;

async function setActive(tabId, active) {
	await chrome.storage.session.set({ [key(tabId)]: { active } });
	await chrome.action.setIcon({ tabId, path: active ? ICONS_ON : ICONS_OFF });
	await chrome.action.setTitle({
		tabId,
		title: active ? "YouTube Full Captions — ON (click to turn OFF)" :
			"YouTube Full Captions — OFF (click to turn ON)"
	});
}
async function isActive(tabId) {
	const obj = await chrome.storage.session.get(key(tabId));
	return !!(obj[key(tabId)] && obj[key(tabId)].active);
}
function isYouTube(url) { return /:\/\/(www\.)?youtube\.com\//i.test(url || ""); }

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: "ytfc-settings",
		title: "Caption Settings…",
		contexts: ["action"] // right-click the toolbar icon
	});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId !== "ytfc-settings") return;
	const url = chrome.runtime.getURL("settings.html");
	await chrome.windows.create({
		url,
		type: "popup",
		width: 600,
		height: 420,
		focused: true
	});
});

// Left-click toggle (unchanged)
chrome.action.onClicked.addListener(async (tab) => {
	if (!tab || !isYouTube(tab.url)) {
		chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
		setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 800);
		return;
	}
	if (!(await isActive(tab.id))) {
		try {
			await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
			await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
			await chrome.tabs.sendMessage(tab.id, { message: "turnOn" });
			await setActive(tab.id, true);
		} catch (e) { console.error("[YTFULLCAP] inject failed:", e); }
	} else {
		try { await chrome.tabs.reload(tab.id); }
		finally { await setActive(tab.id, false); }
	}
});

// Reset icon/state on reload/close
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
	if (changeInfo.status === "loading") {
		await chrome.storage.session.remove(key(tabId));
		await chrome.action.setIcon({ tabId, path: ICONS_OFF });
		await chrome.action.setTitle({ tabId, title: "YouTube Full Captions — OFF (click to turn ON)" });
	}
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
	await chrome.storage.session.remove(key(tabId));
});
