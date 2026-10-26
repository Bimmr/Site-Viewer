/**
 * Asks the user to confirm an action in a modal dialog
 * Uses <dialog>, which keeps focus inside it and closes on Escape
 * @param {Object} options
 * @param {string} options.title - Short question, e.g. "Recrawl the site?"
 * @param {string} options.message - What will happen
 * @param {string} options.detail - Optional extra line shown in monospace, e.g. a URL
 * @param {string} options.confirmText - Label of the confirm button
 * @param {boolean} options.danger - Style the confirm button as destructive
 * @returns {Promise<boolean>} True if confirmed
 */
export function confirmDialog({ title, message, detail = '', confirmText = 'Confirm', danger = false }) {
  const dialog = document.createElement('dialog')
  dialog.className = 'app-dialog'
  dialog.setAttribute('aria-labelledby', 'app-dialog-title')
  dialog.setAttribute('aria-describedby', 'app-dialog-message')
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="app-dialog-title"></h2>
      <p id="app-dialog-message"></p>
      <p class="dialog-detail"></p>
      <div class="dialog-buttons">
        <button value="cancel" class="dialog-cancel">Cancel</button>
        <button value="confirm" class="dialog-confirm${danger ? ' danger' : ''}"></button>
      </div>
    </form>
  `
  // Messages can contain crawled URLs, so never treat them as HTML
  dialog.querySelector('h2').textContent = title
  dialog.querySelector('#app-dialog-message').textContent = message
  dialog.querySelector('.dialog-detail').textContent = detail
  dialog.querySelector('.dialog-detail').hidden = !detail
  dialog.querySelector('.dialog-confirm').textContent = confirmText

  document.body.appendChild(dialog)

  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm')
      dialog.remove()
    })
    // Clicking the backdrop cancels
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close('cancel')
    })
    dialog.showModal()
    // Start on Cancel so pressing Enter by accident doesn't confirm
    dialog.querySelector('.dialog-cancel').focus()
  })
}
