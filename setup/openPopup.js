var popupWindow = null

chrome.tabs.query(
  {
    active: true, 
    currentWindow: true
  }, 
  currentTab => {      
    popupWindow.tabURL = currentTab[0].url
})

openPopup()
function openPopup(){
  window.close()
  popupWindow = window.open(
    chrome.extension.getURL("viewer.html"),
    "SiteViewer",
    "width=1200,height=500"
  )
}
