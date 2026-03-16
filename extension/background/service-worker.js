/**
 * Esfer@ Helper - Service Worker (Background)
 * 
 * Gestiona:
 * - Obrir el side panel quan es clica la icona
 * - Notificar al side panel quan canvia la pestanya o la navegacio SPA
 * - Futur: Google Sheets API OAuth
 */

// Obrir el side panel quan es clica la icona de l'extensio
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Esfer@ Helper] Error configurant sidePanel:', error));

// Notificar al sidepanel quan una pestanya es actualitzada (carrega completa)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' &&
      tab.url && tab.url.includes('aplicacions.ensenyament.gencat.cat')) {
    chrome.runtime.sendMessage({ action: 'tab-updated', tabId }).catch(() => {});
  }
});

// Escoltem missatges del content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'content-script-loaded') {
    console.log('[Esfer@ Helper] Content script carregat:', message.screen);
    chrome.runtime.sendMessage({ action: 'tab-updated' }).catch(() => {});
  }

  // Reenviem navegacio SPA del content script cap al sidepanel
  if (message.action === 'content-script-navigation') {
    chrome.runtime.sendMessage({
      action: 'content-script-navigation',
      screen: message.screen,
      url: message.url
    }).catch(() => {});
  }

  return false;
});

console.log('[Esfer@ Helper] Service worker inicialitzat');
