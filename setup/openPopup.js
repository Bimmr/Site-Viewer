//The popupWindow instance
var popupWindow = null

/**
* Get the current tab and set the popup windows variable
* It has to be done this way otherwise it will un-focus the popup window when trying to pass the currentTab
*/
chrome.tabs.query(
    { active: true, currentWindow: true },
    currentTab => {
        popupWindow.tabURL = currentTab[0].url
        popupWindow.tabId = currentTab[0].id
        popupWindow.extensionId = chrome.runtime.id
        popupWindow.tab = JSON.stringify(currentTab)
        popupWindow.version = chrome.runtime.getManifest().version
    }
)

//Open the popup
openPopup()

/**
* Function to open the popup window
*/
function openPopup() {
    window.close()
    if (popupWindow === null || popupWindow.closed) {
        popupWindow = window.open(
            chrome.runtime.getURL("viewer.html"),
            "SiteViewer - "+ Math.floor(Math.random() * 100),
            "width=1280,height=600"
        )
    }
    else {
        popupWindow.focus()
    }
}
