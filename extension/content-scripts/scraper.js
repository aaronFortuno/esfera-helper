/**
 * Esfer@ Helper - Content Script (Scraper)
 * 
 * S'injecta a les pagines d'avaluacio d'esfer@ i exposa funcions per:
 * 1. Detectar en quina pantalla estem (llista alumnes vs formulari alumne)
 * 2. Capturar la llista d'alumnes (pantalla de seleccio)
 * 3. Capturar l'estructura d'items/materies (formulari d'un alumne)
 * 4. Capturar les opcions valides de cada select
 * 5. Omplir els selects amb valors proporcionats
 */

(function () {
  'use strict';

  // =========================================================================
  // SELECTORS (centralitzats per facilitar manteniment)
  // =========================================================================

  const SELECTORS = {
    // Pantalla llista d'alumnes
    studentTable: [
      'table[data-st-safe-src="vm.students_src"]',
      'table[data-st-safe-src="vm.students"]'
    ].join(', '),
    studentRows: 'tr[data-ng-repeat*="alumne in vm.dummyStudents"]',
    studentActionLink: 'a[data-ng-click*="toQualificacions"]',
    
    // Pantalla formulari
    subjectRows: 'tr[data-ng-repeat*="scope in vm.scope_subjects"]',
    childRows: 'div[data-ng-repeat*="area in scope.childs"]',
    
    // Capcaleres per color (principal) + fallback per estructura
    subjectHeader: [
      'div[style*="rgb(191, 189, 189)"]',
      'div[style*="191, 189, 189"]',
      'div[style*="#bfbdbd"]',
      'div[style*="background-color: rgb(191"]',
      'div.subject-header'
    ].join(', '),
    itemHeader: [
      'div[style*="rgb(224, 224, 224)"]',
      'div[style*="224, 224, 224"]',
      'div[style*="#e0e0e0"]',
      'div[style*="background-color: rgb(224"]',
      'div.item-header'
    ].join(', '),
    
    // Selects del formulari
    formSelect: 'select[data-ng-model="el.value"]',
    
    // Breadcrumb
    breadcrumb: '.breadcrumb li',
    
    // Boto seguent
    nextButtons: 'button, a.btn, input[type="button"]',
    nextArrows: '.glyphicon-chevron-right, .glyphicon-arrow-right, .fa-arrow-right, .fa-chevron-right'
  };

  /**
   * Busca una capcalera de materia o item per codi, amb fallback.
   * Estrategia: primer per selector de color, despres per text del codi.
   * @param {string} code - Codi a buscar
   * @param {string} type - 'subject', 'item' o 'any'
   * @returns {Element|null}
   */
  function findHeaderByCode(code, type) {
    const selectors = [];
    if (type === 'subject' || type === 'any') selectors.push(SELECTORS.subjectHeader);
    if (type === 'item' || type === 'any') selectors.push(SELECTORS.itemHeader);

    for (const selector of selectors) {
      const headers = document.querySelectorAll(selector);
      for (const header of headers) {
        const firstDiv = header.querySelector(':scope > div');
        if (firstDiv && firstDiv.textContent.trim() === code) {
          return header;
        }
      }
    }

    // Fallback: busquem qualsevol div amb un fill directe que contingui el codi
    // i que tingui un <select> (indicador de fila de qualificacio)
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
      const firstChild = div.querySelector(':scope > div');
      if (firstChild && firstChild.textContent.trim() === code) {
        if (div.querySelector('select')) {
          return div;
        }
      }
    }

    return null;
  }

  // =========================================================================
  // DETECCIO DE PANTALLA
  // =========================================================================

  /**
   * Determina en quina pantalla d'esfer@ estem.
   * Esfer@ es una SPA amb AngularJS, la URL conté el hash amb la ruta.
   * @returns {'student-list'|'student-form'|'unknown'}
   */
  function detectScreen() {
    const url = window.location.href;

    // Pantalla de formulari d'un alumne concret
    if (url.includes('EntradaDades')) {
      return 'student-form';
    }

    // Pantalla de llista d'alumnes - busquem la taula
    const studentTable = document.querySelector(SELECTORS.studentTable);
    if (studentTable) {
      return 'student-list';
    }

    const studentRows = document.querySelectorAll(SELECTORS.studentRows);
    if (studentRows.length > 0) {
      return 'student-list';
    }

    return 'unknown';
  }

  // =========================================================================
  // ESPERA DE DOM (robustesa per AngularJS)
  // =========================================================================

  /**
   * Espera que un selector existeixi al DOM, amb timeout.
   * Util perque AngularJS renderitza el DOM de forma asincrona.
   * @param {string} selector - CSS selector
   * @param {number} maxWait - Temps maxim d'espera en ms (default 5000)
   * @returns {Promise<Element|null>}
   */
  function waitForElement(selector, maxWait = 5000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, maxWait);
    });
  }

  // =========================================================================
  // CAPTURA DE LLISTA D'ALUMNES
  // =========================================================================

  /**
   * Captura la llista d'alumnes de la pantalla de seleccio.
   * 
   * Cada alumne te:
   * - idRalc: codi RALC visible a la taula (ex: "14180367451") -> usat per matching
   * - idAlumne: ID intern d'esfer@ del ng-click (ex: "7936501") -> usat a les URLs
   * - nom: format "Cognoms, Nom" (ex: "Annassiri, Ibrahim")
   * 
   * @returns {Array<{id: string, idRalc: string, idAlumne: string, nom: string}>}
   */
  async function scrapeStudentList() {
    // Wait for student rows to be rendered by AngularJS
    await waitForElement(SELECTORS.studentRows);

    const students = [];
    const rows = document.querySelectorAll(SELECTORS.studentRows);

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const idRalc = cells[0].textContent.trim();
        const nom = cells[1].textContent.trim();

        // L'ID intern de l'alumne es pot extreure del ng-click del boto "Modifica"
        const actionLink = row.querySelector(SELECTORS.studentActionLink);
        let idAlumne = '';
        if (actionLink) {
          const ngClick = actionLink.getAttribute('data-ng-click') || '';
          const match = ngClick.match(/toQualificacions\((\d+)\)/);
          if (match) {
            idAlumne = match[1];
          }
        }

        // Fallback: intentem via Angular scope
        if (!idAlumne) {
          try {
            const scope = angular.element(row).scope();
            if (scope && scope.alumne) {
              idAlumne = String(scope.alumne.idAlumne || '');
            }
          } catch (e) {
            // Angular no disponible
          }
        }

        students.push({
          id: idRalc,         // idRalc com a ID principal (matching amb breadcrumb)
          idRalc: idRalc,
          idAlumne: idAlumne, // ID intern d'esfer@ (per URLs)
          nom: nom
        });
      }
    });

    return students;
  }

  // =========================================================================
  // CAPTURA D'ESTRUCTURA D'ITEMS (FORMULARI)
  // =========================================================================

  /**
   * Captura l'estructura completa d'items/materies del formulari d'un alumne.
   * @returns {Array<{code, name, type: 'subject', options, children: Array}>}
   */
  async function scrapeFormStructure() {
    // Wait for subject rows to be rendered by AngularJS
    await waitForElement(SELECTORS.subjectRows);

    const structure = [];

    // Cada materia es un <tr> amb ng-repeat="scope in vm.scope_subjects"
    const subjectRows = document.querySelectorAll(SELECTORS.subjectRows);

    subjectRows.forEach((subjectRow) => {
      // Capçalera de materia: fons gris fosc
      const subjectHeader = subjectRow.querySelector(SELECTORS.subjectHeader);

      if (!subjectHeader) return;

      const divs = subjectHeader.querySelectorAll(':scope > div');
      let subjectCode = '';
      let subjectName = '';

      if (divs.length >= 2) {
        subjectCode = divs[0].textContent.trim();
        subjectName = divs[1].textContent.trim();
      }

      const subjectOptions = extractSelectOptions(subjectHeader);

      const subject = {
        code: subjectCode,
        name: subjectName,
        type: 'subject',
        options: subjectOptions,
        children: []
      };

      // Items fills: fons gris clar
      const childRows = subjectRow.querySelectorAll(SELECTORS.childRows);

      childRows.forEach((childRow) => {
        const itemDiv = childRow.querySelector(SELECTORS.itemHeader);

        if (!itemDiv) return;

        const itemDivs = itemDiv.querySelectorAll(':scope > div');
        let itemCode = '';
        let itemName = '';

        if (itemDivs.length >= 2) {
          itemCode = itemDivs[0].textContent.trim();
          itemName = itemDivs[1].textContent.trim();
        }

        const itemOptions = extractSelectOptions(itemDiv);

        subject.children.push({
          code: itemCode,
          name: itemName,
          type: 'item',
          options: itemOptions
        });
      });

      structure.push(subject);
    });

    return structure;
  }

  /**
   * Extreu les opcions disponibles d'un <select> dins d'un contenidor.
   */
  function extractSelectOptions(container) {
    const select = container.querySelector('select');
    if (!select) return [];

    const options = [];
    select.querySelectorAll('option').forEach((opt) => {
      const value = opt.value || '';
      const cleanValue = value.replace(/^string:/, '');
      const label = opt.textContent.trim();

      if (cleanValue) {
        options.push({ value: cleanValue, label: label });
      }
    });

    return options;
  }

  // =========================================================================
  // DETECCIO D'ALUMNE ACTUAL (quan estem al formulari)
  // =========================================================================

  /**
   * Detecta quin alumne estem visualitzant al formulari.
   * 
   * Breadcrumb format (ultim element):
   * "14180367451 - Annassiri, Ibrahim - NIE Y3603046H"
   *  ^idRalc       ^nom                 ^doc
   * 
   * URL: .../EntradaDades/{sessioId}/{idIntern}/-1
   * 
   * @returns {{id: string, idRalc: string, nom: string, urlId: string} | null}
   */
  function detectCurrentStudent() {
    const url = window.location.href;
    const urlMatch = url.match(/EntradaDades\/(\d+)\/(\d+)/);
    const urlId = urlMatch ? urlMatch[2] : '';

    let idRalc = '';
    let nom = '';
    let fullBreadcrumbText = '';

    const breadcrumbs = document.querySelectorAll(SELECTORS.breadcrumb);
    if (breadcrumbs.length > 0) {
      const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
      fullBreadcrumbText = lastBreadcrumb.textContent.trim();
    }

    if (fullBreadcrumbText) {
      const parts = fullBreadcrumbText.split(' - ');

      if (parts.length >= 2) {
        const firstPart = parts[0].trim();
        if (/^\d+$/.test(firstPart)) {
          idRalc = firstPart;
          nom = parts[1].trim();
        } else {
          // Format no esperat, busquem numero llarg
          const numMatch = fullBreadcrumbText.match(/(\d{8,})/);
          if (numMatch) {
            idRalc = numMatch[1];
          }
          const afterId = fullBreadcrumbText.substring(
            fullBreadcrumbText.indexOf(idRalc) + idRalc.length
          );
          const nameParts = afterId.split(' - ').filter(p => p.trim());
          if (nameParts.length > 0) {
            nom = nameParts[0].trim();
          }
        }
      }
    }

    const id = idRalc || urlId;
    if (!id && !nom) return null;

    return {
      id: id,
      idRalc: idRalc,
      nom: nom,
      urlId: urlId
    };
  }

  // =========================================================================
  // LECTURA DE VALORS ACTUALS DEL FORMULARI
  // =========================================================================

  /**
   * Llegeix els valors actuals de tots els selects del formulari.
   * @returns {Array<{code: string, value: string}>}
   */
  async function readCurrentValues() {
    const values = [];
    const structure = await scrapeFormStructure();

    structure.forEach((subject) => {
      const subjectValue = readSelectValueByCode(subject.code, 'subject');
      values.push({ code: subject.code, value: subjectValue });

      subject.children.forEach((child) => {
        const childValue = readSelectValueByCode(child.code, 'item');
        values.push({ code: child.code, value: childValue });
      });
    });

    return values;
  }

  function readSelectValueByCode(code, type) {
    const row = findRowByCode(code, type);
    if (!row) return '';

    const select = row.querySelector('select');
    if (!select) return '';

    const value = select.value || '';
    return value.replace(/^string:/, '');
  }

  // =========================================================================
  // ESCRIPTURA DE VALORS ALS SELECTS (FILLER)
  // =========================================================================

  /**
   * Omple un conjunt de selects amb els valors proporcionats.
   * Utilitza un delay petit entre cada select per donar temps a Angular.
   * 
   * @param {Array<{code: string, value: string}>} data
   * @returns {Promise<{success: number, errors: Array}>}
   */
  async function fillFormValues(data) {
    let success = 0;
    const errors = [];

    for (const { code, value } of data) {
      if (!value) continue;

      try {
        const filled = setSelectValue(code, value);
        if (filled) {
          success++;
        } else {
          errors.push({ code, error: 'Select no trobat o valor no valid' });
        }
      } catch (e) {
        errors.push({ code, error: e.message });
      }

      // Petit delay entre selects per permetre que Angular processi
      await new Promise(r => setTimeout(r, 20));
    }

    // Forcem un digest cycle final per assegurar que tot s'ha aplicat
    try {
      const anySelect = document.querySelector(SELECTORS.formSelect);
      if (anySelect) {
        const rootScope = angular.element(anySelect).scope().$root;
        if (rootScope && !rootScope.$$phase) {
          rootScope.$apply();
        }
      }
    } catch (e) {
      // Ignorem
    }

    return { success, errors };
  }

  /**
   * Estableix el valor d'un select, notificant AngularJS.
   * @param {string} code - Codi de l'item
   * @param {string} value - Valor (ex: "AN")
   * @returns {boolean}
   */
  function setSelectValue(code, value) {
    const row = findRowByCode(code, 'any');
    if (!row) return false;

    const select = row.querySelector('select');
    if (!select) return false;

    // Comprovem que el valor existeix com a opcio
    const angularValue = 'string:' + value;
    const optionExists = Array.from(select.options).some(
      (opt) => opt.value === angularValue
    );
    if (!optionExists) return false;

    // Metode 1: Via Angular scope (preferit)
    try {
      const scope = angular.element(select).scope();
      if (scope && scope.el) {
        scope.el.value = value;
        if (!scope.$$phase && !scope.$root.$$phase) {
          scope.$apply();
        } else {
          scope.$evalAsync();
        }
        return true;
      }
    } catch (e) {
      // Fallback
    }

    // Metode 2: DOM directe + events
    select.value = angularValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));

    return true;
  }

  /**
   * Troba la fila del DOM corresponent a un codi d'item.
   */
  function findRowByCode(code, type) {
    return findHeaderByCode(code, type);
  }

  // =========================================================================
  // GENERACIO DE DADES PLANES (per CSV / Sheets)
  // =========================================================================

  async function getFlatItemList() {
    const structure = await scrapeFormStructure();
    const flat = [];

    structure.forEach((subject) => {
      flat.push({
        code: subject.code,
        name: subject.name,
        type: 'subject',
        options: subject.options,
        level: 0
      });

      subject.children.forEach((child) => {
        flat.push({
          code: child.code,
          name: child.name,
          type: 'item',
          options: child.options,
          level: 1
        });
      });
    });

    return flat;
  }

  // =========================================================================
  // NAVEGACIO D'ALUMNES
  // =========================================================================

  /**
   * Clica el boto "Seguent" d'esfer@ per anar al proxim alumne.
   * @returns {boolean} true si s'ha trobat i clicat el boto
   */
  function clickNextStudent() {
    // Busquem el boto "Seguent" o "Siguiente" o icona >>
    const buttons = document.querySelectorAll(SELECTORS.nextButtons);
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const ngClick = btn.getAttribute('data-ng-click') || '';

      if (text.includes('seg') || title.includes('seg') ||
          ngClick.includes('next') || ngClick.includes('seg') ||
          ngClick.includes('seguent')) {
        btn.click();
        return true;
      }
    }

    // Busquem per icona de fletxa
    const arrows = document.querySelectorAll(SELECTORS.nextArrows);
    for (const arrow of arrows) {
      const clickable = arrow.closest('a, button');
      if (clickable) {
        clickable.click();
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // COMUNICACIO AMB L'EXTENSIO (message passing)
  // =========================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action } = message;

    try {
      switch (action) {
        case 'detect-screen':
          sendResponse({ screen: detectScreen() });
          break;

        case 'scrape-students':
          scrapeStudentList().then((students) => {
            sendResponse({ students });
          }).catch((err) => {
            console.error('[Esfer@ Helper] Error scraping students:', err);
            sendResponse({ students: [], error: err.message });
          });
          return true;

        case 'scrape-structure':
          scrapeFormStructure().then((structure) => {
            sendResponse({ structure });
          }).catch((err) => {
            console.error('[Esfer@ Helper] Error scraping structure:', err);
            sendResponse({ structure: [], error: err.message });
          });
          return true;

        case 'scrape-flat-items':
          getFlatItemList().then((items) => {
            sendResponse({ items });
          }).catch((err) => {
            console.error('[Esfer@ Helper] Error getting flat items:', err);
            sendResponse({ items: [], error: err.message });
          });
          return true;

        case 'detect-current-student':
          sendResponse({ student: detectCurrentStudent() });
          break;

        case 'read-current-values':
          readCurrentValues().then((values) => {
            sendResponse({ values });
          }).catch((err) => {
            console.error('[Esfer@ Helper] Error reading values:', err);
            sendResponse({ values: [], error: err.message });
          });
          return true;

        case 'fill-values':
          fillFormValues(message.data || []).then((result) => {
            sendResponse(result);
          }).catch((err) => {
            console.error('[Esfer@ Helper] Error filling values:', err);
            sendResponse({ success: 0, errors: [{ code: '*', error: err.message }] });
          });
          return true;

        case 'click-next':
          sendResponse({ clicked: clickNextStudent() });
          break;

        case 'ping':
          sendResponse({ status: 'ok', screen: detectScreen() });
          break;

        default:
          sendResponse({ error: 'Accio desconeguda: ' + action });
      }
    } catch (err) {
      console.error('[Esfer@ Helper] Error inesperat al handler:', err);
      sendResponse({ error: 'Error inesperat: ' + err.message });
    }
  });

  // =========================================================================
  // OBSERVADOR DE CANVIS DE RUTA (SPA)
  // =========================================================================

  // Esfer@ es una SPA amb AngularJS. Quan naveguem entre alumnes la URL canvia
  // pero la pagina no es recarrega. Observem els canvis per notificar al background.
  let lastUrl = window.location.href;

  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      chrome.runtime.sendMessage({
        action: 'content-script-navigation',
        screen: detectScreen(),
        url: window.location.href
      }).catch(() => {});
    }
  });

  // Observem canvis al <title> o <body> que indiquin navegacio SPA
  urlObserver.observe(document.querySelector('title') || document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Tambe interceptem hashchange (Esfer@ usa hash routing)
  window.addEventListener('hashchange', () => {
    chrome.runtime.sendMessage({
      action: 'content-script-navigation',
      screen: detectScreen(),
      url: window.location.href
    }).catch(() => {});
  });

  // Notifiquem al background que el content script s'ha carregat
  chrome.runtime.sendMessage({
    action: 'content-script-loaded',
    screen: detectScreen(),
    url: window.location.href
  }).catch(() => {});

  console.log('[Esfer@ Helper] Content script carregat. Pantalla:', detectScreen());

})();
