/**
 * Esfer@ Helper - Side Panel Logic
 *
 * Coordina la comunicacio amb el content script i gestiona la UI.
 *
 * Flux principal:
 * 1. Capturar estructura d'items d'esfer@
 * 1b. Configurar qualificadors per materia
 * 2. Generar/descarregar CSV
 * 3. Importar CSV (persistent entre alumnes)
 * 4. Omplir formulari (amb opcio "Omple i Seguent")
 */

(function () {
  'use strict';

  // =========================================================================
  // OPTION SETS (jocs de qualificadors)
  // =========================================================================

  const OPTION_SETS = {
    assoliment: {
      label: 'Assoliment (NA/AS/AN/AE)',
      values: ['NA', 'AS', 'AN', 'AE'],
    },
    valoracio: {
      label: 'Valoracio (G/P/F/M)',
      values: ['G', 'P', 'F', 'M'],
    },
    totes: {
      label: 'Totes les opcions',
      values: null,
    },
  };

  // =========================================================================
  // STATE
  // =========================================================================

  let currentScreen = 'waiting';
  let lastDetectedScreen = '';
  let capturedStructure = null;
  let capturedStudents = null;
  let loadedCSVData = null; // Persistent entre alumnes!
  let optionsMapping = {};
  let selectedSubjects = {}; // {code: true/false} - materies seleccionades per exportar/importar
  let savedSheets = []; // [{id, name, createdAt}] - fulls creats
  let currentSheetIndex = -1; // index del full seleccionat a savedSheets
  let lastStudentId = ''; // Per detectar canvi d'alumne

  // =========================================================================
  // DOM REFERENCES
  // =========================================================================

  const $ = (selector) => document.querySelector(selector);
  const statusBar = $('#status-bar');

  const screenWaiting = $('#screen-waiting');
  const screenStudentList = $('#screen-student-list');
  const screenStudentForm = $('#screen-student-form');

  const btnScrapeStructure = $('#btn-scrape-structure');
  const btnExportCSV = $('#btn-export-csv');
  const btnExportCSVCurrent = $('#btn-export-csv-current');
  const btnLoadCSV = $('#btn-load-csv');
  const btnFillForm = $('#btn-fill-form');
  const csvFileInput = $('#csv-file-input');
  const btnPresetAllNA = $('#btn-preset-all-na');
  const btnPresetAllGPFM = $('#btn-preset-all-gpfm');
  const btnSelectAll = $('#btn-select-all');
  const btnSelectNone = $('#btn-select-none');
  const btnSaveOptions = $('#btn-save-options');
  const btnCsvClear = $('#btn-csv-clear');
  const btnCsvReload = $('#btn-csv-reload');
  const btnExportSheets = $('#btn-export-sheets');
  const btnDeleteSheet = $('#btn-delete-sheet');
  const btnImportSheets = $('#btn-import-sheets');
  const sheetsStatus = $('#sheets-status');
  const sheetSelector = $('#sheet-selector');
  const sheetSelectorSection = $('#sheet-selector-section');
  const newSheetNameSection = $('#new-sheet-name-section');
  const newSheetNameInput = $('#new-sheet-name');
  const btnCreateSheetConfirm = $('#btn-create-sheet-confirm');
  const btnCreateSheetCancel = $('#btn-create-sheet-cancel');
  const btnGoogleLogout = $('#btn-google-logout');

  const structureResult = $('#structure-result');
  const exportSection = $('#export-section');
  const optionsSection = $('#options-section');
  const optionsMappingDiv = $('#options-mapping');
  const importPreview = $('#import-preview');
  const fillResult = $('#fill-result');
  const csvLoadedBanner = $('#csv-loaded-banner');
  const csvLoadedText = $('#csv-loaded-text');

  // =========================================================================
  // SCREEN MANAGEMENT
  // =========================================================================

  function showScreen(screenName) {
    currentScreen = screenName;
    screenWaiting.classList.remove('active');
    screenStudentList.classList.remove('active');
    screenStudentForm.classList.remove('active');

    switch (screenName) {
      case 'student-list':
        screenStudentList.classList.add('active');
        break;
      case 'student-form':
        screenStudentForm.classList.add('active');
        break;
      default:
        screenWaiting.classList.add('active');
    }
  }

  function setStatus(text, type) {
    statusBar.textContent = text;
    statusBar.className = 'status status-' + type;
  }

  // =========================================================================
  // COMMUNICATION WITH CONTENT SCRIPT
  // =========================================================================

  async function sendToContentScript(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No hi ha pestanya activa');

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async function checkConnection() {
    try {
      const response = await sendToContentScript({ action: 'ping' });
      if (response && response.status === 'ok') {
        setStatus('Connectat a Esfer@', 'connected');

        // Nomes actualitzem la pantalla si ha canviat
        if (response.screen !== lastDetectedScreen) {
          lastDetectedScreen = response.screen;
          await handleScreenChange(response.screen);
        } else if (response.screen === 'student-form') {
          // Comprovem si ha canviat l'alumne
          await checkStudentChange();
        }
        return true;
      }
    } catch (e) {
      setStatus("Desconnectat d'Esfer@", 'disconnected');
      if (currentScreen !== 'waiting') {
        lastDetectedScreen = '';
        showScreen('waiting');
      }
      return false;
    }
  }

  async function handleScreenChange(screen) {
    switch (screen) {
      case 'student-list':
        showScreen('student-list');
        await loadStudentList();
        break;
      case 'student-form':
        showScreen('student-form');
        await loadCurrentStudent();
        await restoreState();
        // Si hi ha CSV carregat, auto-match amb el nou alumne
        if (loadedCSVData) {
          await autoMatchCurrentStudent();
        }
        break;
      default:
        showScreen('waiting');
    }
  }

  /**
   * Comprova si l'alumne actual ha canviat (navegacio SPA).
   */
  async function checkStudentChange() {
    try {
      const response = await sendToContentScript({ action: 'detect-current-student' });
      if (response && response.student) {
        const newId = response.student.idRalc || response.student.id || '';
        if (newId && newId !== lastStudentId) {
          lastStudentId = newId;
          await loadCurrentStudent();
          // Restaurem CSV de storage si no el tenim a memoria
          if (!loadedCSVData) {
            const stored = await chrome.storage.local.get(['loadedCSVData']);
            if (stored.loadedCSVData) {
              loadedCSVData = stored.loadedCSVData;
              updateCSVBanner();
            }
          }
          if (loadedCSVData) {
            await autoMatchCurrentStudent();
          }
        }
      }
    } catch (e) {
      // Ignorem
    }
  }

  /**
   * Restaura l'estat persistent (estructura, alumnes, opcions).
   */
  async function restoreState() {
    const stored = await chrome.storage.local.get([
      'capturedStructure',
      'capturedStudents',
      'optionsMapping',
      'selectedSubjects',
      'loadedCSVData',
      'savedSheets',
    ]);
    if (stored.capturedStudents) {
      capturedStudents = stored.capturedStudents;
    }
    if (stored.optionsMapping) {
      optionsMapping = stored.optionsMapping;
    }
    if (stored.selectedSubjects) {
      selectedSubjects = stored.selectedSubjects;
    }
    if (stored.capturedStructure) {
      capturedStructure = stored.capturedStructure;
      showStructureResult(capturedStructure);
      buildOptionsMapping(capturedStructure);
    }
    if (stored.loadedCSVData) {
      loadedCSVData = stored.loadedCSVData;
    }
    if (stored.savedSheets && stored.savedSheets.length > 0) {
      savedSheets = stored.savedSheets;
      currentSheetIndex = savedSheets.length - 1;
      updateSheetsUI();
    }

    // Mostrem banner del CSV si hi ha dades carregades
    updateCSVBanner();
  }

  // =========================================================================
  // CSV BANNER (indicador persistent)
  // =========================================================================

  function updateCSVBanner() {
    if (loadedCSVData) {
      csvLoadedBanner.classList.remove('hidden');
      const source = savedSheets.length > 0 ? 'Sheets' : 'CSV';
      csvLoadedText.textContent =
        source +
        ': ' +
        loadedCSVData.studentNames.length +
        ' alumnes, ' +
        loadedCSVData.items.length +
        ' items';

      // Amaguem el missatge "sense dades"
      const noDataMsg = $('#no-data-message');
      if (noDataMsg) noDataMsg.classList.add('hidden');
    } else {
      csvLoadedBanner.classList.add('hidden');
    }
  }

  // =========================================================================
  // STUDENT LIST
  // =========================================================================

  async function loadStudentList() {
    try {
      const response = await sendToContentScript({ action: 'scrape-students' });
      if (response && response.students) {
        capturedStudents = response.students;
        await chrome.storage.local.set({ capturedStudents });
        displayStudentList(response.students);
      }
    } catch (e) {
      console.error('Error carregant alumnes:', e);
    }
  }

  function displayStudentList(students) {
    $('#student-count').innerHTML =
      '<strong>' +
      students.length +
      ' alumnes detectats</strong>' +
      'Es generara una columna per cadascun al CSV.';

    const preview = $('#student-list-preview');
    preview.innerHTML = students
      .map(
        (s, i) =>
          '<div class="list-item">' +
          '<span class="code">' +
          (i + 1) +
          '</span>' +
          '<span class="name">' +
          escapeHtml(s.nom) +
          '</span>' +
          '<span class="value" style="color:#666; font-size:10px">' +
          escapeHtml(s.idRalc || s.id) +
          '</span>' +
          '</div>'
      )
      .join('');
  }

  // =========================================================================
  // CURRENT STUDENT
  // =========================================================================

  async function loadCurrentStudent() {
    $('#current-student-info').innerHTML =
      '<strong>Alumne actual</strong>' +
      '<span style="color:#666;font-size:11px">Detectant alumne... pot trigar uns segons.</span>';
    try {
      const response = await sendToContentScript({ action: 'detect-current-student' });
      if (response && response.student) {
        const s = response.student;
        lastStudentId = s.idRalc || s.id || '';

        // Mostrem info de l'alumne amb comptador si tenim la llista
        let counterHtml = '';
        if (capturedStudents && capturedStudents.length > 0 && lastStudentId) {
          const idx = capturedStudents.findIndex((st) => (st.idRalc || st.id) === lastStudentId);
          if (idx >= 0) {
            counterHtml =
              '<br><span class="student-counter">Alumne ' +
              (idx + 1) +
              ' de ' +
              capturedStudents.length +
              '</span>';
          }
        }

        $('#current-student-info').innerHTML =
          '<strong>Alumne actual</strong>' +
          escapeHtml(s.nom || 'Desconegut') +
          '<br><span style="color:#666;font-size:11px">RALC: ' +
          escapeHtml(s.idRalc || s.id || '?') +
          '</span>' +
          counterHtml;
      }
    } catch (e) {
      $('#current-student-info').innerHTML =
        "<strong>Alumne actual</strong>No s'ha pogut detectar.";
    }
  }

  // =========================================================================
  // STRUCTURE SCRAPING
  // =========================================================================

  async function scrapeStructure() {
    btnScrapeStructure.disabled = true;
    btnScrapeStructure.textContent = 'Capturant...';
    setStatus('Capturant estructura...', 'working');

    try {
      const response = await sendToContentScript({ action: 'scrape-flat-items' });

      if (response && response.items && response.items.length > 0) {
        capturedStructure = response.items;
        await chrome.storage.local.set({ capturedStructure });
        showStructureResult(capturedStructure);
        buildOptionsMapping(capturedStructure);
        setStatus('Connectat a Esfer@', 'connected');
      } else {
        structureResult.className = 'result-box error';
        structureResult.textContent =
          "No s'han trobat items. Assegura't d'estar al formulari d'un alumne amb items visibles.";
        structureResult.classList.remove('hidden');
      }
    } catch (e) {
      structureResult.className = 'result-box error';
      structureResult.textContent = 'Error: ' + e.message;
      structureResult.classList.remove('hidden');
    }

    btnScrapeStructure.disabled = false;
    btnScrapeStructure.textContent = "Captura estructura d'items";
  }

  function showStructureResult(items) {
    const subjects = items.filter((i) => i.type === 'subject');

    // Resum compacte al summary del details
    const configSummary = $('#config-summary');
    configSummary.textContent = items.length + ' items, ' + subjects.length + ' materies';

    structureResult.className = 'result-box success';
    structureResult.innerHTML =
      '<strong>' +
      items.length +
      ' items capturats</strong>' +
      '(' +
      subjects.length +
      ' materies)';
    structureResult.classList.remove('hidden');

    optionsSection.classList.remove('hidden');
    exportSection.classList.remove('hidden');

    // Amaguem el missatge "sense dades" al bloc d'omplir
    const noDataMsg = $('#no-data-message');
    if (noDataMsg) noDataMsg.classList.add('hidden');
  }

  // =========================================================================
  // OPTIONS MAPPING
  // =========================================================================

  function buildOptionsMapping(items) {
    const subjects = items.filter((i) => i.type === 'subject');

    subjects.forEach((s) => {
      if (!optionsMapping[s.code]) {
        optionsMapping[s.code] = 'assoliment';
      }
      // Per defecte, totes seleccionades
      if (selectedSubjects[s.code] === undefined) {
        selectedSubjects[s.code] = true;
      }
    });

    renderOptionsMapping(subjects);
  }

  /**
   * Retorna els items filtrats per les materies seleccionades.
   * Inclou la materia (subject) i tots els seus fills (items).
   */
  function getSelectedItems() {
    if (!capturedStructure) return [];

    const result = [];
    let currentSubjectSelected = false;

    capturedStructure.forEach((item) => {
      if (item.type === 'subject') {
        currentSubjectSelected = selectedSubjects[item.code] !== false;
      }
      if (currentSubjectSelected) {
        result.push(item);
      }
    });

    return result;
  }

  function renderOptionsMapping(subjects) {
    optionsMappingDiv.innerHTML = subjects
      .map((s) => {
        const currentSet = optionsMapping[s.code] || 'assoliment';
        const isSelected = selectedSubjects[s.code] !== false;
        const selectOptions = Object.keys(OPTION_SETS)
          .map(
            (key) =>
              '<option value="' +
              key +
              '"' +
              (key === currentSet ? ' selected' : '') +
              '>' +
              escapeHtml(OPTION_SETS[key].label) +
              '</option>'
          )
          .join('');

        return (
          '<div class="options-mapping-item' +
          (isSelected ? '' : ' excluded') +
          '">' +
          '<input type="checkbox" data-subject-check="' +
          escapeHtml(s.code) +
          '"' +
          (isSelected ? ' checked' : '') +
          ' title="Inclou aquesta materia a l\'exportacio">' +
          '<span class="subject-code">' +
          escapeHtml(s.code) +
          '</span>' +
          '<span class="subject-name" title="' +
          escapeHtml(s.name) +
          '">' +
          escapeHtml(s.name) +
          '</span>' +
          '<select data-subject="' +
          escapeHtml(s.code) +
          '"' +
          (isSelected ? '' : ' disabled') +
          '>' +
          selectOptions +
          '</select>' +
          '</div>'
        );
      })
      .join('');

    optionsMappingDiv.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        optionsMapping[e.target.dataset.subject] = e.target.value;
      });
    });

    optionsMappingDiv.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const code = e.target.dataset.subjectCheck;
        selectedSubjects[code] = e.target.checked;

        // Actualitzem l'estil de la fila i l'estat del select
        const row = e.target.closest('.options-mapping-item');
        const sel = row.querySelector('select');
        if (e.target.checked) {
          row.classList.remove('excluded');
          sel.disabled = false;
        } else {
          row.classList.add('excluded');
          sel.disabled = true;
        }
      });
    });
  }

  function applyPresetToAll(presetKey) {
    const selects = optionsMappingDiv.querySelectorAll('select');
    selects.forEach((sel) => {
      sel.value = presetKey;
      optionsMapping[sel.dataset.subject] = presetKey;
    });
  }

  function setAllSubjectsSelected(selected) {
    const checkboxes = optionsMappingDiv.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      cb.checked = selected;
      const code = cb.dataset.subjectCheck;
      selectedSubjects[code] = selected;

      const row = cb.closest('.options-mapping-item');
      const sel = row.querySelector('select');
      if (selected) {
        row.classList.remove('excluded');
        sel.disabled = false;
      } else {
        row.classList.add('excluded');
        sel.disabled = true;
      }
    });
  }

  async function saveOptionsMapping() {
    await chrome.storage.local.set({ optionsMapping, selectedSubjects });
    btnSaveOptions.textContent = 'Desat!';
    setTimeout(() => {
      btnSaveOptions.textContent = 'Desa la configuracio';
    }, 1500);
  }

  function getFilteredOptions(item, allItems) {
    let subjectCode = '';
    if (item.type === 'subject') {
      subjectCode = item.code;
    } else {
      const idx = allItems.indexOf(item);
      for (let i = idx - 1; i >= 0; i--) {
        if (allItems[i].type === 'subject') {
          subjectCode = allItems[i].code;
          break;
        }
      }
    }

    const setKey = optionsMapping[subjectCode] || 'totes';
    const optionSet = OPTION_SETS[setKey];

    if (!optionSet || !optionSet.values) {
      return item.options.map((o) => o.value);
    }

    const originalValues = item.options.map((o) => o.value);
    return optionSet.values.filter((v) => originalValues.includes(v));
  }

  // =========================================================================
  // CSV GENERATION
  // =========================================================================

  function generateCSV(includeCurrentValues) {
    return async function () {
      if (!capturedStructure || capturedStructure.length === 0) {
        alert("Primer has de capturar l'estructura d'items.");
        return;
      }

      if (!capturedStudents) {
        const stored = await chrome.storage.local.get(['capturedStudents']);
        capturedStudents = stored.capturedStudents || [];
      }

      setStatus('Generant CSV...', 'working');

      let currentValues = {};
      let currentStudent = null;

      if (includeCurrentValues) {
        try {
          const valResponse = await sendToContentScript({ action: 'read-current-values' });
          if (valResponse && valResponse.values) {
            valResponse.values.forEach((v) => {
              currentValues[v.code] = v.value;
            });
          }
          const stuResponse = await sendToContentScript({ action: 'detect-current-student' });
          if (stuResponse && stuResponse.student) {
            currentStudent = stuResponse.student;
          }
        } catch (e) {
          console.error('Error llegint valors actuals:', e);
        }
      }

      const rows = [];

      const header = ['Codi', 'Nom', 'Opcions'];
      if (capturedStudents && capturedStudents.length > 0) {
        capturedStudents.forEach((s) => header.push(s.nom));
      } else if (currentStudent) {
        header.push(currentStudent.nom || 'Alumne');
      }
      rows.push(header);

      const idRow = ['#ID', '', ''];
      if (capturedStudents && capturedStudents.length > 0) {
        capturedStudents.forEach((s) => idRow.push(s.idRalc || s.id));
      } else if (currentStudent) {
        idRow.push(currentStudent.idRalc || currentStudent.id || '');
      }
      rows.push(idRow);

      const itemsToExport = getSelectedItems();

      itemsToExport.forEach((item) => {
        const filteredOpts = getFilteredOptions(item, capturedStructure);

        const row = [item.code, item.name, filteredOpts.join('|')];

        if (capturedStudents && capturedStudents.length > 0) {
          capturedStudents.forEach((s) => {
            const studentId = s.idRalc || s.id;
            const currentId = currentStudent ? currentStudent.idRalc || currentStudent.id : '';
            if (
              includeCurrentValues &&
              currentId &&
              studentId === currentId &&
              currentValues[item.code]
            ) {
              row.push(currentValues[item.code]);
            } else {
              row.push('');
            }
          });
        } else if (includeCurrentValues && currentValues[item.code]) {
          row.push(currentValues[item.code]);
        } else {
          row.push('');
        }

        rows.push(row);
      });

      const csvContent = rows
        .map((row) =>
          row
            .map((cell) => {
              const str = String(cell);
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
              }
              return str;
            })
            .join(',')
        )
        .join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'esfera_graella_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);

      setStatus('Connectat a Esfer@', 'connected');
    };
  }

  // =========================================================================
  // GOOGLE SHEETS EXPORT
  // =========================================================================

  /**
   * Retorna l'ID del full seleccionat al dropdown (o null).
   */
  function getSelectedSheetId() {
    if (currentSheetIndex >= 0 && currentSheetIndex < savedSheets.length) {
      return savedSheets[currentSheetIndex].id;
    }
    return null;
  }

  /**
   * Gestiona el clic al boto principal de Sheets.
   * Si hi ha fulls guardats, obre el seleccionat.
   * Si no n'hi ha, inicia el flux de creacio.
   */
  function handleSheetsButton() {
    if (!capturedStructure || capturedStructure.length === 0) {
      alert("Primer has de capturar l'estructura d'items.");
      return;
    }

    const sheetId = getSelectedSheetId();
    if (sheetId) {
      // Obrim el full seleccionat
      const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit';
      chrome.tabs.create({ url: sheetUrl, active: false });
    } else {
      // Mostrem el formulari de creacio
      showNewSheetForm();
    }
  }

  /**
   * Mostra el formulari per crear un full nou amb nom personalitzat.
   */
  function showNewSheetForm() {
    newSheetNameInput.value = '';
    newSheetNameSection.classList.remove('hidden');
    newSheetNameInput.focus();
  }

  /**
   * Crea un full de calcul nou amb el nom donat.
   */
  async function createNewSheet() {
    if (!capturedStudents) {
      const stored = await chrome.storage.local.get(['capturedStudents']);
      capturedStudents = stored.capturedStudents || [];
    }

    // Si no tenim sessio, informem l'usuari abans de demanar autoritzacio
    const isAuth = await SheetsAPI.isAuthenticated();
    if (!isAuth) {
      const consent = confirm(
        'Per crear un full de calcul, Google et demanara permis per:\n\n' +
          '- Crear fulls de calcul al teu Drive\n' +
          '- Llegir els fulls creats per aquesta extensio\n' +
          '- Eliminar els fulls creats per aquesta extensio\n\n' +
          "L'extensio NOMES accedeix als fulls que ella mateixa crea. " +
          'No pot veure ni modificar cap altre fitxer del teu Drive.\n\n' +
          'Es codi obert i auditable: github.com/aaronFortuno/esfera-helper\n\n' +
          'Aixo NO es obligatori. Si prefereixes, pots usar el CSV manualment.\n\n' +
          'Vols continuar?'
      );
      if (!consent) return;
    }

    // Construim el titol
    const customName = newSheetNameInput.value.trim();
    const datePart = new Date().toLocaleDateString('ca-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const title = customName
      ? 'Esfer@ ' + customName + ' (' + datePart + ')'
      : 'Esfer@ Qualificacions ' + datePart;
    const displayName = customName || 'Qualificacions ' + datePart;

    newSheetNameSection.classList.add('hidden');
    btnExportSheets.disabled = true;
    btnExportSheets.textContent = 'Connectant amb Google...';
    setStatus('Creant full de calcul...', 'working');
    sheetsStatus.classList.add('hidden');

    try {
      let currentValues = {};
      let currentStudent = null;

      try {
        const valResponse = await sendToContentScript({ action: 'read-current-values' });
        if (valResponse && valResponse.values) {
          valResponse.values.forEach((v) => {
            currentValues[v.code] = v.value;
          });
        }
        const stuResponse = await sendToContentScript({ action: 'detect-current-student' });
        if (stuResponse && stuResponse.student) {
          currentStudent = stuResponse.student;
        }
      } catch (e) {
        console.warn("[Esfer@ Helper] No s'han pogut llegir valors actuals:", e);
      }

      const itemsToExport = getSelectedItems();

      const result = await SheetsAPI.createSpreadsheet({
        items: itemsToExport,
        students: capturedStudents,
        optionsMapping: optionsMapping,
        optionSets: OPTION_SETS,
        getFilteredOptions: getFilteredOptions,
        currentValues: currentValues,
        currentStudent: currentStudent,
        title: title,
      });

      // Afegim el full a la llista
      savedSheets.push({
        id: result.spreadsheetId,
        name: displayName,
        createdAt: new Date().toISOString(),
      });
      currentSheetIndex = savedSheets.length - 1;
      await chrome.storage.local.set({ savedSheets });

      // Obrim el spreadsheet
      chrome.tabs.create({ url: result.spreadsheetUrl, active: false });

      updateSheetsUI();

      sheetsStatus.className = 'result-box success';
      sheetsStatus.innerHTML =
        '<strong>Full "' +
        escapeHtml(displayName) +
        '" creat!</strong>' +
        "S'ha obert en una nova pestanya.";
      sheetsStatus.classList.remove('hidden');

      setStatus('Connectat a Esfer@', 'connected');
    } catch (e) {
      console.error('[Esfer@ Helper] Error creant spreadsheet:', e);

      sheetsStatus.className = 'result-box error';
      if (
        e.message.includes('canceled') ||
        e.message.includes('cancelled') ||
        e.message.includes('user')
      ) {
        sheetsStatus.textContent = "S'ha cancel·lat l'autenticacio amb Google.";
      } else {
        sheetsStatus.textContent = 'Error: ' + e.message;
      }
      sheetsStatus.classList.remove('hidden');
      setStatus('Connectat a Esfer@', 'connected');
    }

    btnExportSheets.disabled = false;
    updateSheetsButtonLabel();
  }

  /**
   * Actualitza tota la UI de Sheets (selector, botons, labels).
   */
  function updateSheetsUI() {
    // Selector de fulls
    if (savedSheets.length > 0) {
      sheetSelector.innerHTML = savedSheets
        .map(
          (s, i) =>
            '<option value="' +
            i +
            '"' +
            (i === currentSheetIndex ? ' selected' : '') +
            '>' +
            escapeHtml(s.name) +
            '</option>'
        )
        .join('');
      sheetSelectorSection.classList.remove('hidden');
      btnImportSheets.classList.remove('hidden');
      btnDeleteSheet.classList.remove('hidden');
      btnGoogleLogout.classList.remove('hidden');
    } else {
      sheetSelectorSection.classList.add('hidden');
      btnImportSheets.classList.add('hidden');
      btnDeleteSheet.classList.add('hidden');
    }
    updateSheetsButtonLabel();
  }

  function updateSheetsButtonLabel() {
    btnExportSheets.textContent =
      savedSheets.length > 0 ? 'Obre el full de calcul' : 'Crea full a Google Sheets';
  }

  /**
   * Actualitza la visibilitat del boto de logout de Google.
   */
  async function updateGoogleLoginState() {
    try {
      const isAuth = await SheetsAPI.isAuthenticated();
      if (isAuth) {
        btnGoogleLogout.classList.remove('hidden');
      } else {
        btnGoogleLogout.classList.add('hidden');
      }
    } catch (e) {
      btnGoogleLogout.classList.add('hidden');
    }
  }

  // =========================================================================
  // GOOGLE SHEETS IMPORT
  // =========================================================================

  async function importFromSheets() {
    const sheetId = getSelectedSheetId();
    if (!sheetId) {
      alert('No hi ha cap full de calcul seleccionat.');
      return;
    }

    const sheetName = savedSheets[currentSheetIndex].name;
    btnImportSheets.disabled = true;
    btnImportSheets.textContent = 'Llegint dades...';
    setStatus('Llegint des de Google Sheets...', 'working');
    sheetsStatus.classList.add('hidden');

    try {
      const data = await SheetsAPI.readSpreadsheet(sheetId);

      loadedCSVData = data;
      await chrome.storage.local.set({ loadedCSVData });

      updateCSVBanner();
      await autoMatchCurrentStudent();

      sheetsStatus.className = 'result-box success';
      sheetsStatus.innerHTML =
        '<strong>Dades importades de "' +
        escapeHtml(sheetName) +
        '"</strong>' +
        data.studentNames.length +
        ' alumnes, ' +
        data.items.length +
        ' items llegits.';
      sheetsStatus.classList.remove('hidden');

      setStatus('Connectat a Esfer@', 'connected');
    } catch (e) {
      console.error('[Esfer@ Helper] Error llegint spreadsheet:', e);

      sheetsStatus.className = 'result-box error';
      sheetsStatus.textContent = 'Error llegint el full: ' + e.message;
      sheetsStatus.classList.remove('hidden');
      setStatus('Connectat a Esfer@', 'connected');
    }

    btnImportSheets.disabled = false;
    btnImportSheets.textContent = 'Importa des de Sheets';
  }

  // =========================================================================
  // GOOGLE SHEETS DELETE
  // =========================================================================

  async function deleteCurrentSheet() {
    const sheetId = getSelectedSheetId();
    if (!sheetId) return;

    const sheetName = savedSheets[currentSheetIndex].name;
    const consent = confirm(
      'Segur que vols eliminar "' +
        sheetName +
        '" de Google Drive?\n\n' +
        'Aquesta accio es irreversible.'
    );
    if (!consent) return;

    btnDeleteSheet.disabled = true;
    btnDeleteSheet.textContent = 'Eliminant...';
    setStatus('Eliminant full de calcul...', 'working');

    try {
      await SheetsAPI.deleteSpreadsheet(sheetId);

      // Treiem de la llista
      savedSheets.splice(currentSheetIndex, 1);
      currentSheetIndex = savedSheets.length > 0 ? savedSheets.length - 1 : -1;
      await chrome.storage.local.set({ savedSheets });
      updateSheetsUI();

      sheetsStatus.className = 'result-box success';
      sheetsStatus.textContent = '"' + sheetName + '" eliminat.';
      sheetsStatus.classList.remove('hidden');

      setStatus('Connectat a Esfer@', 'connected');
    } catch (e) {
      console.error('[Esfer@ Helper] Error eliminant spreadsheet:', e);
      sheetsStatus.className = 'result-box error';
      sheetsStatus.textContent = 'Error eliminant el full: ' + e.message;
      sheetsStatus.classList.remove('hidden');
      setStatus('Connectat a Esfer@', 'connected');
    }

    btnDeleteSheet.disabled = false;
    btnDeleteSheet.textContent = 'Elimina full';
  }

  // =========================================================================
  // CSV IMPORT (persistent)
  // =========================================================================

  function triggerCSVLoad() {
    csvFileInput.click();
  }

  function handleCSVFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
      const csvText = e.target.result;
      loadedCSVData = parseCSV(csvText);

      if (!loadedCSVData) {
        alert('Error llegint el CSV. Comprova el format.');
        return;
      }

      // Persistim el CSV a storage
      await chrome.storage.local.set({ loadedCSVData });

      updateCSVBanner();
      await autoMatchCurrentStudent();
    };

    reader.readAsText(file, 'UTF-8');
    csvFileInput.value = '';
  }

  /**
   * Auto-match: busca l'alumne actual al CSV i mostra el preview.
   * Es crida automaticament quan es carrega un CSV o quan canviem d'alumne.
   */
  async function autoMatchCurrentStudent() {
    if (!loadedCSVData) return;

    let currentStudent = null;
    try {
      const response = await sendToContentScript({ action: 'detect-current-student' });
      currentStudent = response ? response.student : null;
    } catch (e) {
      // ignore
    }

    let matchedColumn = null;
    let matchedStudentName = '';

    if (currentStudent) {
      const currentId = currentStudent.idRalc || currentStudent.id || '';

      // Matching per RALC
      if (currentId && loadedCSVData.studentIds.length > 0) {
        const colIndex = loadedCSVData.studentIds.indexOf(currentId);
        if (colIndex >= 0) {
          matchedColumn = colIndex;
          matchedStudentName = loadedCSVData.studentNames[colIndex] || '';
        }
      }

      // Matching per nom
      if (matchedColumn === null && currentStudent.nom) {
        const normalizedNom = normalizeString(currentStudent.nom);
        for (let i = 0; i < loadedCSVData.studentNames.length; i++) {
          if (normalizeString(loadedCSVData.studentNames[i]) === normalizedNom) {
            matchedColumn = i;
            matchedStudentName = loadedCSVData.studentNames[i];
            break;
          }
        }
      }
    }

    // Fallback: 1 sol alumne
    if (matchedColumn === null && loadedCSVData.studentNames.length === 1) {
      matchedColumn = 0;
      matchedStudentName = loadedCSVData.studentNames[0];
    }

    if (matchedColumn === null) {
      importPreview.classList.remove('hidden');
      const infoBox = $('#import-student-info');
      infoBox.className = 'match-info';
      infoBox.style.background = '#fff3e0';
      infoBox.style.borderColor = '#ffcc80';
      infoBox.innerHTML =
        '<strong>Alumne no trobat</strong> ' +
        escapeHtml(currentStudent ? currentStudent.nom : '?') +
        ' no coincideix amb cap columna.';
      $('#import-data-preview').innerHTML = '';
      btnFillForm.classList.add('hidden');
      fillResult.classList.add('hidden');
      return;
    }

    // Filtrem per materies seleccionades
    const selectedCodes = new Set(getSelectedItems().map((i) => i.code));

    // Preview
    const dataToFill = loadedCSVData.items
      .filter((item) => selectedCodes.has(item.code))
      .map((item) => ({
        code: item.code,
        name: item.name,
        value: item.values[matchedColumn] || '',
      }))
      .filter((d) => d.value);

    const totalSelected = loadedCSVData.items.filter((item) => selectedCodes.has(item.code)).length;
    const emptyCount = totalSelected - dataToFill.length;
    const excludedCount = loadedCSVData.items.length - totalSelected;

    importPreview.classList.remove('hidden');
    const infoBox = $('#import-student-info');
    infoBox.className = 'match-info';
    infoBox.style.background = '';
    infoBox.style.borderColor = '';
    infoBox.innerHTML =
      '<strong>' +
      escapeHtml(matchedStudentName) +
      '</strong> &mdash; ' +
      dataToFill.length +
      ' valors' +
      (emptyCount > 0 ? ' (' + emptyCount + ' buits)' : '') +
      (excludedCount > 0
        ? '<br><span style="font-size:11px;color:#e65100">' +
          excludedCount +
          ' items exclosos (materies no seleccionades)</span>'
        : '');

    $('#import-data-preview').innerHTML =
      dataToFill
        .slice(0, 50)
        .map(
          (d) =>
            '<div class="list-item">' +
            '<span class="code">' +
            escapeHtml(d.code) +
            '</span>' +
            '<span class="name">' +
            escapeHtml(d.name) +
            '</span>' +
            '<span class="value">' +
            escapeHtml(d.value) +
            '</span>' +
            '</div>'
        )
        .join('') +
      (dataToFill.length > 50
        ? '<div class="list-item" style="justify-content:center;color:#999">... i ' +
          (dataToFill.length - 50) +
          ' mes</div>'
        : '');

    btnFillForm.classList.remove('hidden');
    btnFillForm.dataset.column = matchedColumn;
    fillResult.classList.add('hidden');
  }

  // =========================================================================
  // FORM FILLING
  // =========================================================================

  async function fillForm() {
    const colIndex = parseInt(btnFillForm.dataset.column, 10);
    if (isNaN(colIndex) || !loadedCSVData) return;

    btnFillForm.disabled = true;
    btnFillForm.textContent = 'Omplint...';
    setStatus('Omplint formulari...', 'working');

    // Filtrem per materies seleccionades
    const selectedCodes = new Set(getSelectedItems().map((i) => i.code));

    const data = loadedCSVData.items
      .filter((item) => selectedCodes.has(item.code))
      .map((item) => ({
        code: item.code,
        value: item.values[colIndex] || '',
      }))
      .filter((d) => d.value);

    try {
      const response = await sendToContentScript({
        action: 'fill-values',
        data: data,
      });

      if (response) {
        fillResult.classList.remove('hidden');
        if (response.errors && response.errors.length > 0) {
          fillResult.className = 'result-box info';
          fillResult.innerHTML =
            '<strong>' +
            response.success +
            ' camps omplerts</strong><br>' +
            response.errors.length +
            ' errors:<br>' +
            response.errors
              .slice(0, 5)
              .map((e) => escapeHtml(e.code) + ': ' + escapeHtml(e.error))
              .join('<br>') +
            (response.errors.length > 5
              ? '<br>... i ' + (response.errors.length - 5) + ' mes'
              : '');
        } else {
          fillResult.className = 'result-box success';
          fillResult.innerHTML =
            '<strong>' +
            response.success +
            ' camps omplerts correctament</strong>' +
            'Revisa els valors i prem "Desa" a Esfer@.';
        }
      }
    } catch (e) {
      fillResult.className = 'result-box error';
      fillResult.textContent = 'Error: ' + e.message;
      fillResult.classList.remove('hidden');
    }

    btnFillForm.disabled = false;
    btnFillForm.textContent = 'Omple el formulari';
    setStatus('Connectat a Esfer@', 'connected');
  }

  // =========================================================================
  // CSV PARSER
  // =========================================================================

  function parseCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') return null;

    // Remove BOM if present
    const cleanText = csvText.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 3) {
      console.warn(
        '[Esfer@ Helper] CSV massa curt: necessita minim 3 files (capcalera + IDs + dades)'
      );
      return null;
    }

    const rows = lines.map(parseCSVLine);

    const header = rows[0];
    if (header.length < 4) {
      console.warn(
        '[Esfer@ Helper] CSV invalid: la capcalera necessita minim 4 columnes (Codi, Nom, Opcions, Alumne)'
      );
      return null;
    }

    const idRow = rows[1];

    // Validate ID row starts with #ID
    if (idRow[0] && idRow[0].trim() !== '#ID') {
      console.warn(
        '[Esfer@ Helper] CSV: la fila 2 hauria de comencar amb #ID, trobat: "' + idRow[0] + '"'
      );
      // Continue anyway - might be a manually created CSV
    }

    const studentNames = header.slice(3);
    const studentIds = idRow.slice(3);

    // Validate we have at least one student
    if (studentNames.length === 0) {
      console.warn("[Esfer@ Helper] CSV: no s'han trobat columnes d'alumnes");
      return null;
    }

    // Warn if student names are all empty
    const nonEmptyNames = studentNames.filter((n) => n && n.trim());
    if (nonEmptyNames.length === 0) {
      console.warn("[Esfer@ Helper] CSV: totes les columnes d'alumnes estan buides");
    }

    const items = [];
    let skippedRows = 0;

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const code = (row[0] || '').trim();

      // Skip empty rows or comment rows
      if (!code || code.startsWith('#')) {
        skippedRows++;
        continue;
      }

      // Ensure the row has enough columns (pad with empty strings if needed)
      const values = row.slice(3);
      while (values.length < studentNames.length) {
        values.push('');
      }

      items.push({
        code: code,
        name: (row[1] || '').trim(),
        options: (row[2] || '').split('|').filter((o) => o.trim()),
        values: values,
      });
    }

    if (items.length === 0) {
      console.warn("[Esfer@ Helper] CSV: no s'han trobat items amb dades");
      return null;
    }

    if (skippedRows > 0) {
      console.log('[Esfer@ Helper] CSV: ' + skippedRows + ' files ignorades (buides o comentaris)');
    }

    return { studentNames, studentIds, items };
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function normalizeString(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // =========================================================================
  // EVENT LISTENERS
  // =========================================================================

  btnScrapeStructure.addEventListener('click', scrapeStructure);
  btnExportSheets.addEventListener('click', handleSheetsButton);
  btnCreateSheetConfirm.addEventListener('click', createNewSheet);
  btnCreateSheetCancel.addEventListener('click', () => newSheetNameSection.classList.add('hidden'));
  newSheetNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createNewSheet();
    if (e.key === 'Escape') newSheetNameSection.classList.add('hidden');
  });
  sheetSelector.addEventListener('change', (e) => {
    currentSheetIndex = parseInt(e.target.value, 10);
  });
  btnDeleteSheet.addEventListener('click', deleteCurrentSheet);
  btnImportSheets.addEventListener('click', importFromSheets);
  btnExportCSV.addEventListener('click', generateCSV(false));
  btnExportCSVCurrent.addEventListener('click', generateCSV(true));
  btnLoadCSV.addEventListener('click', triggerCSVLoad);
  csvFileInput.addEventListener('change', handleCSVFile);
  btnFillForm.addEventListener('click', fillForm);
  btnPresetAllNA.addEventListener('click', () => applyPresetToAll('assoliment'));
  btnPresetAllGPFM.addEventListener('click', () => applyPresetToAll('valoracio'));
  btnSelectAll.addEventListener('click', () => setAllSubjectsSelected(true));
  btnSelectNone.addEventListener('click', () => setAllSubjectsSelected(false));
  btnSaveOptions.addEventListener('click', saveOptionsMapping);

  btnCsvClear.addEventListener('click', async () => {
    loadedCSVData = null;
    await chrome.storage.local.remove('loadedCSVData');
    updateCSVBanner();
    importPreview.classList.add('hidden');
    fillResult.classList.add('hidden');
  });

  btnCsvReload.addEventListener('click', () => {
    csvFileInput.click();
  });

  // Logout de Google
  btnGoogleLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    await SheetsAPI.revokeToken();
    savedSheets = [];
    currentSheetIndex = -1;
    await chrome.storage.local.remove(['savedSheets', 'sheetsAccessToken', 'sheetsTokenExpiry']);
    btnGoogleLogout.classList.add('hidden');
    sheetsStatus.classList.add('hidden');
    updateSheetsUI();
  });

  // Esborrat total de dades (RGPD - Dret de supressio)
  const btnClearAllData = $('#btn-clear-all-data');
  if (btnClearAllData) {
    btnClearAllData.addEventListener('click', async (e) => {
      e.preventDefault();
      const confirmed = confirm(
        'Segur que vols esborrar TOTES les dades emmagatzemades?\n\n' +
          'Aixo inclou:\n' +
          "- Estructura d'items capturada\n" +
          "- Llista d'alumnes\n" +
          '- Configuracio de qualificadors\n' +
          '- CSV carregat\n\n' +
          'Aquesta accio no es pot desfer.'
      );
      if (!confirmed) return;

      // Revokem token de Google si existeix
      await SheetsAPI.revokeToken();

      // Esborrem tot de storage
      await chrome.storage.local.clear();

      // Resetegem l'estat en memoria
      capturedStructure = null;
      capturedStudents = null;
      loadedCSVData = null;
      optionsMapping = {};
      selectedSubjects = {};
      savedSheets = [];
      currentSheetIndex = -1;
      lastStudentId = '';
      lastDetectedScreen = '';

      // Actualitzem la UI
      updateCSVBanner();
      importPreview.classList.add('hidden');
      fillResult.classList.add('hidden');
      structureResult.classList.add('hidden');
      optionsSection.classList.add('hidden');
      exportSection.classList.add('hidden');
      sheetsStatus.classList.add('hidden');
      newSheetNameSection.classList.add('hidden');
      btnGoogleLogout.classList.add('hidden');
      updateSheetsUI();

      alert('Totes les dades han estat esborrades.');
    });
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  // ---- Connexio inicial ----
  checkConnection();
  updateGoogleLoginState();

  // ---- Deteccio basada en events (principal) ----
  chrome.tabs.onActivated.addListener(() => {
    lastDetectedScreen = '';
    checkConnection();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'tab-updated' || message.action === 'content-script-navigation') {
      lastDetectedScreen = '';
      checkConnection();
    }
  });

  // ---- Poll de fallback (interval llarg, nomes per si els events fallen) ----
  setInterval(checkConnection, 10000);

  // ---- Deteccio de focus de finestra (quan l'usuari torna a la pestanya) ----
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastDetectedScreen = '';
      checkConnection();
    }
  });
})();
