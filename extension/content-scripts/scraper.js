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
  // DETECCIO DE PANTALLA
  // =========================================================================

  /**
   * Determina en quina pantalla d'esfer@ estem.
   * @returns {'student-list'|'student-form'|'unknown'}
   */
  function detectScreen() {
    const url = window.location.href;

    // Pantalla de formulari d'un alumne concret
    // URL: .../parcialAvaluacioGrupAlumneEntradaDades/{sessioId}/{alumneId}/-1
    // o    .../finalAvaluacioGrupAlumneEntradaDades/{sessioId}/{alumneId}/-1
    if (url.includes('EntradaDades')) {
      return 'student-form';
    }

    // Pantalla de llista d'alumnes
    // URL: .../parcialAvaluacioGrupAlumne/#/parcialAvaluacioGrupAlumne/{sessioId}
    // Comprovem que hi ha la taula d'alumnes
    const studentTable = document.querySelector(
      'table[data-st-safe-src="vm.students_src"], ' +
      'table[data-st-safe-src="vm.students"]'
    );
    if (studentTable) {
      return 'student-list';
    }

    // Tambe mirem si hi ha ng-repeat d'alumnes
    const studentRows = document.querySelectorAll(
      'tr[data-ng-repeat*="alumne in"]'
    );
    if (studentRows.length > 0) {
      return 'student-list';
    }

    return 'unknown';
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
  function scrapeStudentList() {
    const students = [];
    const rows = document.querySelectorAll(
      'tr[data-ng-repeat*="alumne in vm.dummyStudents"]'
    );

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const idRalc = cells[0].textContent.trim();
        const nom = cells[1].textContent.trim();

        // L'ID intern de l'alumne es pot extreure del ng-click del boto "Modifica"
        const actionLink = row.querySelector('a[data-ng-click*="toQualificacions"]');
        let idAlumne = '';
        if (actionLink) {
          const ngClick = actionLink.getAttribute('data-ng-click') || '';
          const match = ngClick.match(/toQualificacions\((\d+)\)/);
          if (match) {
            idAlumne = match[1];
          }
        }

        // Si no trobem l'ID al ng-click, intentem via el track by
        if (!idAlumne) {
          try {
            const scope = angular.element(row).scope();
            if (scope && scope.alumne) {
              idAlumne = String(scope.alumne.idAlumne || '');
            }
          } catch (e) {
            // Angular no disponible o error d'acces
          }
        }

        students.push({
          id: idRalc,        // Usem idRalc com a ID principal (per matching amb breadcrumb)
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
   * Retorna un array jerarquic: materia -> items fills
   * 
   * @returns {Array<{
   *   code: string,
   *   name: string,
   *   type: 'subject',
   *   options: Array<{value: string, label: string}>,
   *   children: Array<{code: string, name: string, type: 'item', options: Array}>
   * }>}
   */
  function scrapeFormStructure() {
    const structure = [];

    // Cada materia es un <tr> amb ng-repeat="scope in vm.scope_subjects"
    const subjectRows = document.querySelectorAll(
      'tr[data-ng-repeat*="scope in vm.scope_subjects"]'
    );

    subjectRows.forEach((subjectRow) => {
      // La capçalera de materia te fons gris fosc (rgb(191, 189, 189))
      const subjectHeader = subjectRow.querySelector(
        'div[style*="rgb(191, 189, 189)"], div[style*="191, 189, 189"]'
      );

      if (!subjectHeader) return;

      // Extraiem codi i nom de la materia
      const divs = subjectHeader.querySelectorAll(':scope > div');
      let subjectCode = '';
      let subjectName = '';

      if (divs.length >= 2) {
        subjectCode = divs[0].textContent.trim();
        subjectName = divs[1].textContent.trim();
      }

      // Opcions del select de la materia (nivell pare)
      const subjectOptions = extractSelectOptions(subjectHeader);

      const subject = {
        code: subjectCode,
        name: subjectName,
        type: 'subject',
        options: subjectOptions,
        children: []
      };

      // Items fills: cada un es un div amb ng-repeat="area in scope.childs"
      const childRows = subjectRow.querySelectorAll(
        'div[data-ng-repeat*="area in scope.childs"]'
      );

      childRows.forEach((childRow) => {
        // La fila de l'item te fons gris clar (rgb(224, 224, 224))
        const itemDiv = childRow.querySelector(
          'div[style*="rgb(224, 224, 224)"], div[style*="224, 224, 224"]'
        );

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
   * @param {Element} container - Element pare on buscar el select
   * @returns {Array<{value: string, label: string}>}
   */
  function extractSelectOptions(container) {
    const select = container.querySelector('select');
    if (!select) return [];

    const options = [];
    select.querySelectorAll('option').forEach((opt) => {
      const value = opt.value || '';
      // Els valors d'Angular tenen prefix "string:" 
      const cleanValue = value.replace(/^string:/, '');
      const label = opt.textContent.trim();

      // Ignorem l'opcio buida
      if (cleanValue) {
        options.push({
          value: cleanValue,
          label: label
        });
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
   * El breadcrumb d'esfer@ te aquest format a l'ultim element:
   * "14180367451 - Annassiri, Ibrahim - NIE Y3603046H"
   *  ^idRalc       ^nom                 ^doc
   * 
   * La URL conte un ID intern diferent de l'idRalc:
   * .../EntradaDades/{sessioId}/{idIntern}/-1
   * 
   * Per fer matching amb la llista d'alumnes, necessitem l'idRalc.
   * 
   * @returns {{id: string, idRalc: string, nom: string, urlId: string} | null}
   */
  function detectCurrentStudent() {
    // ID intern de la URL (no es l'idRalc, es un ID de la BD)
    const url = window.location.href;
    const urlMatch = url.match(/EntradaDades\/(\d+)\/(\d+)/);
    const urlId = urlMatch ? urlMatch[2] : '';

    // Busquem l'ultim element del breadcrumb que conte les dades de l'alumne
    // Format: "14180367451 - Annassiri, Ibrahim - NIE Y3603046H"
    let idRalc = '';
    let nom = '';
    let fullBreadcrumbText = '';

    const breadcrumbs = document.querySelectorAll('.breadcrumb li');
    if (breadcrumbs.length > 0) {
      const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
      fullBreadcrumbText = lastBreadcrumb.textContent.trim();
    }

    // Parsegem el text del breadcrumb
    // Pot ser: "14180367451 - Annassiri, Ibrahim - NIE Y3603046H"
    // o nomes el codi RALC seguit del nom
    if (fullBreadcrumbText) {
      // Separem per " - " (guio envoltat d'espais)
      const parts = fullBreadcrumbText.split(' - ');
      
      if (parts.length >= 2) {
        // La primera part es l'idRalc (numeric)
        const firstPart = parts[0].trim();
        if (/^\d+$/.test(firstPart)) {
          idRalc = firstPart;
          // La segona part es el nom (Cognom, Nom)
          nom = parts[1].trim();
        } else {
          // Si la primera part no es numerica, potser el breadcrumb
          // te un format diferent. Busquem un numero llarg.
          const numMatch = fullBreadcrumbText.match(/(\d{8,})/);
          if (numMatch) {
            idRalc = numMatch[1];
          }
          // Busquem el nom despres de l'idRalc
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

    // L'ID que farem servir per matching es l'idRalc (coincideix amb la llista d'alumnes)
    const id = idRalc || urlId;

    if (!id && !nom) return null;

    return { 
      id: id,           // idRalc preferit, fallback a urlId
      idRalc: idRalc,
      nom: nom,
      urlId: urlId      // ID intern de la URL
    };
  }

  // =========================================================================
  // LECTURA DE VALORS ACTUALS DEL FORMULARI
  // =========================================================================

  /**
   * Llegeix els valors actuals de tots els selects del formulari.
   * @returns {Array<{code: string, value: string}>}
   */
  function readCurrentValues() {
    const values = [];
    const structure = scrapeFormStructure();

    structure.forEach((subject) => {
      // Valor de la materia (nivell pare)
      const subjectValue = readSelectValueByCode(subject.code, 'subject');
      values.push({ code: subject.code, value: subjectValue });

      // Valors dels fills
      subject.children.forEach((child) => {
        const childValue = readSelectValueByCode(child.code, 'item');
        values.push({ code: child.code, value: childValue });
      });
    });

    return values;
  }

  /**
   * Llegeix el valor actual d'un select identificat pel seu codi.
   * @param {string} code - Codi de l'item (ex: "DM1", "CAT-2")
   * @param {string} type - 'subject' o 'item'
   * @returns {string} Valor actual (ex: "AN", "AE") o buit
   */
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
   * Gestiona correctament AngularJS disparant els events necessaris.
   * 
   * @param {Array<{code: string, value: string}>} data - Parells codi-valor
   * @returns {{success: number, errors: Array<{code: string, error: string}>}}
   */
  function fillFormValues(data) {
    let success = 0;
    const errors = [];

    data.forEach(({ code, value }) => {
      if (!value) return; // Ignorem valors buits

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
    });

    return { success, errors };
  }

  /**
   * Estableix el valor d'un select identificat pel codi, 
   * notificant AngularJS del canvi.
   * 
   * @param {string} code - Codi de l'item
   * @param {string} value - Valor a establir (ex: "AN")
   * @returns {boolean} true si s'ha pogut establir
   */
  function setSelectValue(code, value) {
    // Busquem la fila que conte el codi
    const row = findRowByCode(code, 'any');
    if (!row) return false;

    const select = row.querySelector('select');
    if (!select) return false;

    // Comprovem que el valor existeix com a opcio valida
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
      // Fallback al metode 2
    }

    // Metode 2: Manipulacio directa del DOM + events
    select.value = angularValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));

    return true;
  }

  /**
   * Troba la fila del DOM que correspon a un codi d'item.
   * @param {string} code - Codi a buscar (ex: "DM1")
   * @param {string} type - 'subject', 'item', o 'any'
   * @returns {Element|null}
   */
  function findRowByCode(code, type) {
    // Busquem per materies (fons gris fosc)
    if (type === 'subject' || type === 'any') {
      const subjectHeaders = document.querySelectorAll(
        'div[style*="rgb(191, 189, 189)"]'
      );
      for (const header of subjectHeaders) {
        const firstDiv = header.querySelector(':scope > div');
        if (firstDiv && firstDiv.textContent.trim() === code) {
          return header;
        }
      }
    }

    // Busquem per items fills (fons gris clar)
    if (type === 'item' || type === 'any') {
      const itemHeaders = document.querySelectorAll(
        'div[style*="rgb(224, 224, 224)"]'
      );
      for (const header of itemHeaders) {
        const firstDiv = header.querySelector(':scope > div');
        if (firstDiv && firstDiv.textContent.trim() === code) {
          return header;
        }
      }
    }

    return null;
  }

  // =========================================================================
  // GENERACIO DE DADES PLANES (per CSV / Sheets)
  // =========================================================================

  /**
   * Genera un array pla amb tots els items (materies + fills) per
   * facilitar la generacio de CSV o Google Sheets.
   * 
   * @returns {Array<{code: string, name: string, type: string, options: Array, level: number}>}
   */
  function getFlatItemList() {
    const structure = scrapeFormStructure();
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
  // COMUNICACIO AMB L'EXTENSIO (message passing)
  // =========================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action } = message;

    switch (action) {
      case 'detect-screen':
        sendResponse({ screen: detectScreen() });
        break;

      case 'scrape-students':
        sendResponse({ students: scrapeStudentList() });
        break;

      case 'scrape-structure':
        sendResponse({ structure: scrapeFormStructure() });
        break;

      case 'scrape-flat-items':
        sendResponse({ items: getFlatItemList() });
        break;

      case 'detect-current-student':
        sendResponse({ student: detectCurrentStudent() });
        break;

      case 'read-current-values':
        sendResponse({ values: readCurrentValues() });
        break;

      case 'fill-values':
        const result = fillFormValues(message.data || []);
        sendResponse(result);
        break;

      case 'ping':
        sendResponse({ status: 'ok', screen: detectScreen() });
        break;

      default:
        sendResponse({ error: 'Accio desconeguda: ' + action });
    }

    // Retornem true per indicar que respondrem de manera sincrona
    return true;
  });

  // Notifiquem al background que el content script s'ha carregat
  chrome.runtime.sendMessage({
    action: 'content-script-loaded',
    screen: detectScreen(),
    url: window.location.href
  }).catch(() => {
    // Ignorem si el background no esta disponible encara
  });

  console.log('[Esfer@ Helper] Content script carregat. Pantalla detectada:', detectScreen());

})();
