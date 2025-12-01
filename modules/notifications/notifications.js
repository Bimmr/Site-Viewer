/**
 * Notification System
 * Manages toast notifications with ID-based tracking, positioning, and dismissal
 */

/**
 * Show a toast notification to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('success', 'error', 'info', 'warning')
 * @param {number} duration - How long to show the notification in ms (default: 2000, use Infinity to keep until dismissed)
 * @param {string} id - Optional unique ID for the notification (for manual dismissal)
 * @param {number} insertAtIndex - Optional index to insert the notification at (for replacing notifications)
 * @param {boolean} skipAnimation - Skip the slide-in animation (useful when replacing notifications)
 * @returns {string} - The notification ID
 */
function showNotification(message, type = 'info', duration = 2000, id = null, insertAtIndex = null, skipAnimation = false) {
  // Generate ID if not provided
  if (!id) {
    id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
  
  let timeoutId = null
  
  requestAnimationFrame(() => {
    // Create or get the notification container
    let container = document.querySelector('.notification-container')
    if (!container) {
      container = document.createElement('div')
      container.className = 'notification-container'
      document.body.appendChild(container)
    }
    
    // Create notification
    const notification = document.createElement('div')
    notification.className = `toast-notification ${type}`
    notification.dataset.notificationId = id
    
    // Add no-animation class if skipping animation
    if (skipAnimation) {
      notification.classList.add('no-animation')
    }
    
    // Icon mapping
    const icons = {
      info: 'fa-circle-info',
      success: 'fa-circle-check',
      warning: 'fa-triangle-exclamation',
      error: 'fa-circle-xmark'
    }
    
    // Build notification content
    notification.innerHTML = `
      <i class="notification-icon fas ${icons[type] || icons.info}"></i>
      <span class="notification-message">${message}</span>
      <button class="notification-close" aria-label="Close notification">
        <i class="fas fa-xmark"></i>
      </button>
    `
    
    // Add close button handler
    const closeBtn = notification.querySelector('.notification-close')
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dismissNotification(id)
    })
    
    // Insert at specific index or append to end
    if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex < container.children.length) {
      container.insertBefore(notification, container.children[insertAtIndex])
    } else {
      container.appendChild(notification)
    }
    
    // Set the countdown animation duration to match the toast duration
    notification.style.setProperty('--duration', `${duration}ms`)
    
    // Trigger animation in next frame
    requestAnimationFrame(() => {
      notification.classList.add('show')
    })
    
    // Auto remove (unless duration is Infinity)
    if (duration !== Infinity) {
      timeoutId = setTimeout(() => {
        dismissNotification(id)
      }, duration)
    }
  })
  
  return id
}

/**
 * Dismiss a notification by ID
 * @param {string} id - The notification ID to dismiss
 * @param {boolean} skipAnimation - Skip the slide-out animation (useful when replacing notifications)
 */
function dismissNotification(id, skipAnimation = false) {
  const notification = document.querySelector(`[data-notification-id="${id}"]`)
  if (notification && notification.parentElement) {
    if (skipAnimation) {
      // Remove immediately without animation
      const container = notification.parentElement
      notification.remove()
      // Remove container if empty
      if (container && container.children.length === 0) {
        container.remove()
      }
    } else {
      // Animate out
      requestAnimationFrame(() => {
        notification.classList.remove('show')
        setTimeout(() => {
          requestAnimationFrame(() => {
            const container = notification.parentElement
            notification.remove()
            // Remove container if empty
            if (container && container.children.length === 0) {
              container.remove()
            }
          })
        }, 300)
      })
    }
  }
}

/**
 * Replace an existing notification with a new one at the same position without animation
 * @param {string} oldId - The ID of the notification to replace
 * @param {string} message - The new message to display
 * @param {string} type - The type of notification ('success', 'error', 'info', 'warning')
 * @param {number} duration - How long to show the notification in ms (default: 2000)
 * @returns {string} - The new notification ID
 */
function replaceNotification(oldId, message, type = 'info', duration = 2000) {
  // Get the index of the old notification
  const notificationIndex = getNotificationIndex(oldId)
  
  // Dismiss old notification without animation
  dismissNotification(oldId, true)
  
  // Show new notification at same index without animation
  return showNotification(message, type, duration, null, notificationIndex, true)
}

/**
 * Get the index of a notification in the container by ID
 * @param {string} id - The notification ID to find
 * @returns {number} The index of the notification, or -1 if not found
 */
function getNotificationIndex(id) {
  const container = document.querySelector('.notification-container')
  if (!container) return -1
  
  const notifications = Array.from(container.children)
  return notifications.findIndex(notif => notif.dataset.notificationId === id)
}

/**
 * Dismiss all notifications
 */
function dismissAllNotifications() {
  const container = document.querySelector('.notification-container')
  if (container) {
    container.remove()
  }
}

/**
 * Update an existing notification's message and/or type
 * @param {string} id - The notification ID to update
 * @param {string} message - New message (optional)
 * @param {string} type - New type (optional)
 */
function updateNotification(id, message = null, type = null) {
  const notification = document.querySelector(`[data-notification-id="${id}"]`)
  if (notification) {
    if (message !== null) {
      notification.textContent = message
    }
    if (type !== null) {
      // Remove old type classes
      notification.classList.remove('info', 'success', 'error', 'warning')
      notification.classList.add(type)
    }
  }
}
