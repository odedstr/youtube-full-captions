let script_inserted = false;
let full_captions_active = false;

// chrome.runtime.onInstalled.addListener(async () => {
// 	await chrome.action.setBadgeText({
// 		text: 'OFF'
// 	});
// });

chrome.action.onClicked.addListener(async (tab) => {

	// // We retrieve the action badge to check if the extension is 'ON' or 'OFF'
	// const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
	// // Next state will always be the opposite
	// const nextState = prevState === 'ON' ? 'OFF' : 'ON';
	//
	// // Set the action badge to the next state
	// await chrome.action.setBadgeText({
	// 	tabId: tab.id,
	// 	text: nextState
	// });

	if(!script_inserted){
		script_inserted = true;

		await chrome.scripting.executeScript({
			target: {tabId: tab.id},
			files: ['content.js']
		});
	}

	if(!full_captions_active){
		full_captions_active = true;

		await chrome.scripting.insertCSS({
			target: {tabId: tab.id},
			files: ['content.css']
		});

		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			chrome.tabs.sendMessage(tabs[0].id, {message: "turnOn"});
		});
	}
	else{
		// Remove the CSS
		await chrome.scripting.removeCSS({
			target: {tabId: tab.id},
			files: ['content.css']
		});

		// Cancel everything that content.js does
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			chrome.tabs.sendMessage(tabs[0].id, {message: "turnOff"});
		});
		full_captions_active = false;
	}


});
