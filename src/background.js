// Clicking the toolbar icon shows/hides the calculator on the current Classroom tab.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'grade-calc-toggle' }).catch(() => {});
});
