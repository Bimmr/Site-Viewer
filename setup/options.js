import { storageGet, storageSet } from '../js/lib/storage.js'

const manageDownloadsInput = document.getElementById("options-manageDownloads")

storageGet('manageDownloads').then(manageDownloads => {
    if (manageDownloads !== null)
        manageDownloadsInput.checked = manageDownloads
}).catch(error => {
    console.error("Failed to load manageDownloads setting:", error)
})

manageDownloadsInput.addEventListener("change", event => {
    storageSet("manageDownloads", event.target.checked)
})
