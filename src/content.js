

// chrome.runtime.onInstalled.addListener(() => {
//   chrome.action.setBadgeText({
//     text: 'OFF'
//   });
// });
//
// "content_scripts": [
// 	{
// 		"js": ["content.js"],
// 		"matches": [
// 			"https://youtube.com/*",
// 			"https://www.youtube.com/*"
// 		]
// 	}
// ],


// When the user clicks on the extension action
// chrome.action.onClicked.addListener(async (tab) => {


	console.debug('document.querySelector(\'[aria-label="Show transcript"]\')',
		document.querySelector('[aria-label="Show transcript"]'));

	document.querySelector('[aria-label="Show transcript"]').click();



// Create a new div element
var newDiv = document.createElement("div");

// Set an ID for the div
newDiv.id = "yourTargetDivId";

newDiv.style.position = "fixed";
newDiv.style.left = "0";
newDiv.style.top = "100px";


// Optionally, add some content to the div
newDiv.innerHTML = "This is a new div with an ID.";

// Append the new div to the body or another element in the document
document.body.appendChild(newDiv);

// Step 1: Select the target div
const targetDiv = document.getElementById('yourTargetDivId');

// Step 2: Function to copy contents
function copyContents() {
	const activeElement = document.querySelector('.ytd-transcript-segment-list-renderer.active');
	if (activeElement) {
		targetDiv.innerHTML = activeElement.querySelector("yt-formatted-string").innerHTML;
	}
}

// Function to set up MutationObserver
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






	// if (tab.url.startsWith(extensions) || tab.url.startsWith(webstore)) {
  //   // We retrieve the action badge to check if the extension is 'ON' or 'OFF'
  //   const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
  //   // Next state will always be the opposite
  //   const nextState = prevState === 'ON' ? 'OFF' : 'ON';
  //
  //   // Set the action badge to the next state
  //   await chrome.action.setBadgeText({
  //     tabId: tab.id,
  //     text: nextState
  //   });
  //
  //   if (nextState === 'ON') {
  //     // Insert the CSS file when the user turns the extension on
  //     await chrome.scripting.insertCSS({
  //       files: ['focus-mode.css'],
  //       target: { tabId: tab.id }
  //     });
  //   } else if (nextState === 'OFF') {
  //     // Remove the CSS file when the user turns the extension off
  //     await chrome.scripting.removeCSS({
  //       files: ['focus-mode.css'],
  //       target: { tabId: tab.id }
  //     });
  //   }
  // }
// });
