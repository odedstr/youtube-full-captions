let script_inserted = false;
let full_captions_active = false;

chrome.action.onClicked.addListener(async (tab) => {

	if(!script_inserted){
		script_inserted = true;

		await chrome.scripting.executeScript({
			target: {tabId: tab.id},
			files: ['content.js']
		});
	}

	if(!full_captions_active){
		full_captions_active = true;

		await chrome.scripting.removeCSS({
			target: {tabId: tab.id},
			files: ['content.css']
		});

		await chrome.scripting.insertCSS({
			target: {tabId: tab.id},
			files: ['content.css']
		});

		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			chrome.tabs.sendMessage(tabs[0].id, {message: "turnOn"});
		});
	}
	else{
		await chrome.scripting.removeCSS({
			target: {tabId: tab.id},
			files: ['content.css']
		});

		// Cancel everything that content.js does
		chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
			chrome.tabs.sendMessage(tabs[0].id, {message: "turnOff"});
		});
		full_captions_active = false;

	}

});
