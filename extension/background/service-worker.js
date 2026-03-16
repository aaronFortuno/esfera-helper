/**
 * Esfer@ Helper - Service Worker (Background)
 * 
 * Gestiona:
 * - Obrir el side panel quan es clica la icona
 * - Notificar al side panel quan canvia la pestanya
 * - Futur: Google Sheets API OAuth
 */

// Obrir el side panel quan es clica la icona de l'extensio
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Esfer@ Helper] Error configurant sidePanel:', error));

// Notificar al sidepanel quan una pestanya es actualitzada
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' &&
      tab.url && tab.url.includes('aplicacions.ensenyament.gencat.cat')) {
    // Notifiquem al sidepanel
    chrome.runtime.sendMessage({ action: 'tab-updated', tabId }).catch(() => {
      // El sidepanel pot no estar obert, ignorem l'error
    });
  }
});

// Escoltem missatges del content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'content-script-loaded') {
    console.log('[Esfer@ Helper] Content script carregat a:', message.url, 'Pantalla:', message.screen);
    // Re-notifiquem al sidepanel
    chrome.runtime.sendMessage({ action: 'tab-updated' }).catch(() => {});
  }
  return false;
});

console.log('[Esfer@ Helper] Service worker inicialitzat');
