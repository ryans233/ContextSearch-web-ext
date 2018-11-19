var userOptions;
var typeTimer = null;
const historyLength = 1024; // number of searches to save in userOptions
const displayCount = 10; // number of total suggestions to display (browser_action height is limited!)

// show the add search engine icon in the searchbar
// browser.runtime.sendMessage({action: "getOpenSearchHref"}).then( (result) => {
	// if (result.href) {
		// let sb = document.getElementById('quickmenusearchbar');
		// let img = document.createElement('img');
		// img.src = '/icons/add_search.png';
		// img.style = 'height:16px;position:absolute;right:4px;top:4px;z-index:2';
		// img.title = browser.i18n.getMessage('AddOfficial') || "add official search engine for this site";
		// document.body.appendChild(img);
	// }
// });

var quickMenuObject = { 
	delay: 250, // how long to hold right-click before quick menu events in ms
	keyDownTimer: 0,
	mouseDownTimer: 0,
	mouseCoords: {x:0, y:0},
	screenCoords: {x:0, y:0},
	mouseCoordsInit: {x:0, y:0},
	mouseLastClickTime: 0,
	mouseDragDeadzone: 4,
	lastSelectTime: 0,
	locked: false,
	searchTerms: "",
	disabled: false,
	mouseDownTargetIsTextBox: false
};

let columns;
let sb_width;

// context menu options
window.addEventListener('contextmenu', (e) => {
	
	browser.contextMenus.create({
		id: "showSuggestions",
		title: browser.i18n.getMessage("ShowSuggestions"),
		type: "checkbox",
		checked: userOptions.searchBarSuggestions
	});
	browser.contextMenus.create({
		id: "clearHistory",
		title: browser.i18n.getMessage("ClearSearchHistory")
	});

	setTimeout(() => {
		window.addEventListener('mousemove', ()=> {
			browser.contextMenus.remove("showSuggestions");
			browser.contextMenus.remove("clearHistory");
		}, {once: true});
	}, 1000);
});

// what was this for?
setInterval(() => {
	browser.runtime.sendMessage({action: "getUserOptions"}).then((message) => {
		userOptions = message.userOptions || {};
	});
}, 1000);

function addToHistory(terms) {
	
	terms = terms.trim();
	
	// send last search to backgroundPage for session storage
	browser.runtime.sendMessage({action: "setLastSearch", lastSearch: terms});
	
	// return if history is disabled
	if ( ! userOptions.searchBarEnableHistory ) return;
	
	// ignore duplicates
	if (userOptions.searchBarHistory.includes(terms)) return;
	
	// remove first entry if over limit
	if (userOptions.searchBarHistory.length === historyLength)
		userOptions.searchBarHistory.shift();
	
	// add new term
	userOptions.searchBarHistory.push(terms);
	
	// update prefs
	browser.runtime.sendMessage({action: "saveUserOptions", "userOptions": userOptions});
}

browser.runtime.sendMessage({action: "getUserOptions"}).then((message) => {
	userOptions = message.userOptions || {};
	
	if ( userOptions === {} ) return;
	
	let sb = document.getElementById('quickmenusearchbar');
	sb.placeholder = browser.i18n.getMessage('Search');

	browser.runtime.sendMessage({action: "getLastSearch"}).then((message) => {
		
		// skip empty 
		if (!message.lastSearch) return;
		
		sb.value = message.lastSearch;
		sb.select();
		
		function getSelectedText(el) {
			let start = el.selectionStart;
			let finish = el.selectionEnd;
			return el.value.substring(start, finish);
		}
		
		// workaround for linux 
		var selectInterval = setInterval( () => {

			if (getSelectedText(sb) == sb.value)
				clearInterval(selectInterval);
			else
				sb.select();
		}, 50);

	});

	columns = (userOptions.searchBarUseOldStyle) ? 1 : userOptions.searchBarColumns;
	let div_width = sb_width / columns;
	
	let suggest = document.getElementById('suggestions');
		
	sb.onkeypress = function(e) {
		
		clearTimeout(typeTimer);
		
		typeTimer = setTimeout(() => {
			
			if (!sb.value.trim()) {
				suggest.style.maxHeight = null;
				return;
			}

			suggest.innerHTML = null;
			
			let history = [];
			let lc_searchTerms = sb.value.toLowerCase();
			for (let h of userOptions.searchBarHistory) {
				if (h.toLowerCase().indexOf(lc_searchTerms) === 0)
					history.push({searchTerms: h, type: 0});
				
				if (history.length === displayCount) break;
			}
			
			function displaySuggestions(suggestions) {
				
				suggestions = suggestions.sort(function(a,b) {
					return a.searchTerms - b.searchTerms;
				});
				
				for (let s of suggestions) {
					let div = document.createElement('div');
					div.style.height = "20px";
					div.onclick = function() {
						let selected = suggest.querySelector('.selectedFocus');
						if (selected) selected.classList.remove('selectedFocus');
						this.classList.add('selectedFocus');
						sb.value = this.innerText;
					}
					
					div.ondblclick = function() {
						var e = new KeyboardEvent("keydown", {bubbles : true, cancelable : true, keyCode: 13});
						sb.dispatchEvent(e);
					}
					
					let img = document.createElement("img");
					img.src = "/icons/history.png";
					img.style.height = "1em";
					img.style.marginRight = "5px";
					img.style.opacity = .75;
					img.style.verticalAlign = "middle";
					img.title = browser.i18n.getMessage('History') || "history";
					
					if (s.type === 1) img.style.visibility = 'hidden';
					div.appendChild(img);
										
					// put search terms in bold
					// let matches = new RegExp("^(.*)(" + sb.value + ")(.*)").exec(s.searchTerms);
					// //browser.runtime.sendMessage({action: "log", msg: matches});

					// for (let i=1;i<matches.length;i++) {
						// let part = matches[i];
						// let el = null;
						// if (!part) continue;
						// else if (part === sb.value) {
							// el = document.createElement('b');
							// el.innerText = sb.value;
							// el.style.fontWeight = '600';
						// } else  {
							// el = document.createTextNode(part);
						// }

						// div.appendChild(el);
					// }

					
					let text = document.createTextNode(s.searchTerms);
					div.appendChild(text);
					
//					div.innerHTML = div.innerText.replace(sb.value, "<b>" + sb.value + "</b>");
					suggest.appendChild(div);
				}
				
				suggest.style.width = sb.parentNode.getBoundingClientRect().width + "px";

			//	suggest.addEventListener('transitionend', postQuickMenuSize);
				suggest.addEventListener('transitionend', (e) => {
					
					// for browser_action
					window.dispatchEvent(new Event('resize'));
					
					// for sidebar
					sideBarResize();
				});
				
				suggest.style.maxHeight = Math.min(100, suggestions.length * 20) + "px";

			}
			
			if (userOptions.searchBarSuggestions) {
				getSuggestions(sb.value, (xml) => {
					
					let suggestions = [];
					for (let s of xml.getElementsByTagName('suggestion')) {
						let searchTerms = s.getAttribute('data');
						
						let found = false;
						for (let h of history) {
							if (h.searchTerms.toLowerCase() === searchTerms.toLowerCase()) {
								found = true;
								break;
							}
						}
						if (!found)
							suggestions.push({searchTerms: searchTerms, type: 1});
					}

					suggestions = history.concat(suggestions);
					
					displaySuggestions(suggestions);
					
				});
			} else
				displaySuggestions(history);
			
		}, 250);
	}
	
	sb.onkeydown = function(e) {
		if (e.keyCode === 13) {
			
			addToHistory(sb.value);
			
			if (userOptions.searchBarCloseAfterSearch) window.close();	
		}
	}

	function getSuggestions(terms, callback) {
		
		let url = 'http://suggestqueries.google.com/complete/search?output=toolbar&hl=' + browser.i18n.getUILanguage() + '&q=' + encodeURIComponent(terms);
		callback = callback || function() {};
		var xmlhttp;

		xmlhttp = new XMLHttpRequest();

		xmlhttp.onreadystatechange = function()	{
			if (xmlhttp.readyState == XMLHttpRequest.DONE ) {
				if(xmlhttp.status == 200) {

					let parsed = new DOMParser().parseFromString(xmlhttp.responseText, 'application/xml');
					
					if (parsed.documentElement.nodeName=="parsererror") {
						console.log('xml parse error');
						
						console.log(parsed);
						parsed = false;
					}
					callback(parsed);
			   } else {
				   console.log('Error fetching ' + url);
			   }
			}
		}
		
		xmlhttp.ontimeout = function (e) {
			console.log('Timeout fetching ' + url);
			callback(false);
		};

		xmlhttp.open("GET", url, true);
		xmlhttp.timeout = 500;
		xmlhttp.send();
	}
	
	makeQuickMenu({type: "searchbar"}).then( (qme) => {
		document.body.appendChild(qme);
		document.dispatchEvent(new CustomEvent('quickMenuIframeLoaded'));
	});
		
});

document.addEventListener('quickMenuIframeLoaded', () => {
	
	let qm = document.getElementById('quickMenuElement');
	let sb = document.getElementById('quickmenusearchbar');
	let suggest = document.getElementById('suggestions');
	
	qm.style.overflowY = 'auto';
	
	for (let br of qm.querySelectorAll('br') )
		qm.removeChild(br);
	
	let divs = qm.getElementsByTagName('div');
	for (let i=0;i<divs.length;i++ ) {
		
		let div = divs[i];
		if ( (i+1) % columns === 0 )
			qm.insertBefore(document.createElement('br'), div.nextSibling);

		div.onmouseenter = function() {
			document.getElementById('searchEngineTitle').innerText = div.title;
		}
		div.onmouseleave = function() {
			document.getElementById('searchEngineTitle').innerText = ' ';
		}

	}

	// create Options button
	let div = document.getElementById('optionsButton');
	if (!div) {
		div = document.createElement('div');
		div.id = 'optionsButton';
		div.style = 'text-align:center;border-top:1px solid #e0e0e0';
		div.className = 'hover';
		let img = document.createElement('img');
		img.src = "/icons/settings.png";
		img.style.height = '16px';
		img.style.padding = '8px';

		div.onclick = function() {
			document.body.style.visibility = 'hidden';
			//location.href = browser.runtime.getURL('/options.html#browser_action');
			browser.runtime.sendMessage({action: "openOptions"});
			window.close();
		}
		
		document.getElementById('searchEngineTitle').style.width = parseFloat(window.getComputedStyle(qm).width) - 10 + "px";
		
		div.appendChild(img);

		// show on browser_action / not sidebar
		if ( window == top ) document.body.appendChild(div);
	}
	
	// focus the searchbar on open
	sb.focus();
	
	// listen for resize events, specifically the browser action resizing
	// and add scrollbars when necessary
	window.addEventListener('resize', () => {
		
		if ( window != top ) return;

		let qm = document.getElementById('quickMenuElement');
		let sb = document.getElementById('quickmenusearchbar');
		let tb = document.getElementById('searchEngineTitle');
		let suggest = document.getElementById('suggestions');
		let options = document.getElementById('optionsButton');

		if ( window.innerHeight < document.body.scrollHeight ) {
			qm.style.height = window.innerHeight - ( sb.getBoundingClientRect().height + suggest.getBoundingClientRect().height + tb.getBoundingClientRect().height + options.getBoundingClientRect().height ) + "px";
		} 
		
		if (qm.getBoundingClientRect().width < window.innerWidth ) {
			qm.querySelectorAll('div').forEach( div => {
				div.style.width = window.innerWidth / columns + "px";
			});
			
			// account for scroll bars
			qm.style.width = qm.scrollWidth + qm.offsetWidth - qm.clientWidth + "px";
		}
	});
	
	// trigger resize for sidebar. Resize triggers on load in the browser_action
	sideBarResize();

});

function sideBarResize() {
	if ( window == top ) return;
	
	let qm = document.getElementById('quickMenuElement');
	let sb = document.getElementById('quickmenusearchbar');
	let tb = document.getElementById('searchEngineTitle');
	let suggest = document.getElementById('suggestions');
	
	let allOtherElsHeight = sb.getBoundingClientRect().height + suggest.getBoundingClientRect().height + tb.getBoundingClientRect().height;
		
	let qm_height = 'calc(100% - ' + allOtherElsHeight + "px)";
	qm.style.height = qm_height;

	setTimeout( () => {
		qm.style.height = Math.min(window.innerHeight, window.innerHeight - allOtherElsHeight) + "px";
		
		// account for scrollbars
		qm.style.width = qm.scrollWidth + qm.offsetWidth - qm.clientWidth + "px";
		window.parent.postMessage({size: {width: qm.getBoundingClientRect().width}}, "*");
	}, 250);

	let rect = document.body.getBoundingClientRect();
	let rect_qm = qm.getBoundingClientRect();

	// send size to parent window for sidebar widget
	window.parent.postMessage({size: {width: rect_qm.width, height: rect.height}}, "*");

}