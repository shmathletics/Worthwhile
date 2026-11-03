// Clicking the toolbar icon toggles the injected drawer on the current tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' });
  } catch {
    try { // tab was open before install: inject on demand
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' });
    } catch { /* chrome:// pages, Web Store, etc. */ }
  }
});
