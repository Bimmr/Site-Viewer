//The popupWindow instance
var popupWindow = null

/*
* Get the current tab and set the popup windows variable
* It has to be done this way otherwise it will un-focus the popup window when trying to pass the currentTab
*/
chrome.tabs.query(
    { active: true, currentWindow: true },
    currentTab => {
        popupWindow.tabURL = currentTab[0].url
    }
)

//Open the popup
openPopup()

/*
* Function to open the popup window
*/
function openPopup() {
    window.close()
    popupWindow = window.open(
        chrome.extension.getURL("viewer.html"),
        "SiteViewer",
        "width=1200,height=500"
    )
}
