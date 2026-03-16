/**
 * Esfer@ Helper - Side Panel Logic
 * 
 * Coordina la comunicacio amb el content script i gestiona la UI.
 */

(function () {
  'use strict';

  // =========================================================================
  // OPTION SETS (jocs de qualificadors)
  // =========================================================================

  const OPTION_SETS = {
    'assoliment': {
      label: 'Assoliment (NA/AS/AN/AE)',
      values: ['NA', 'AS', 'AN', 'AE']
    },
    'valoracio': {
      label: 'Valoracio (G/P/F/M)',
      values: ['G', 'P', 'F', 'M']
    },
    'totes': {
      label: 'Totes les opcions',
      values: null  // null = usa les opcions originals del select
    }
  };

  // =========================================================================
  // STATE
  // =========================================================================

  let currentScreen = 'waiting';
  let capturedStructure = null;  // Estructura d'items capturada
  let capturedStudents = null;   // Llista d'alumnes capturada
  let loadedCSVData = null;      // Dades del CSV carregat
  let optionsMapping = {};       // Mapeig codi_materia -> optionSetKey

  // =========================================================================
  // DOM REFERENCES
  // =========================================================================

  const $ = (selector) => document.querySelector(selector);
  const statusBar = $('#status-bar');

  // Screens
  const screenWaiting = $('#screen-waiting');
  const screenStudentList = $('#screen-student-list');
  const screenStudentForm = $('#screen-student-form');

  // Buttons
  const btnScrapeStructure = $('#btn-scrape-structure');
  const btnExportCSV = $('#btn-export-csv');
  const btnExportCSVCurrent = $('#btn-export-csv-current');
  const btnLoadCSV = $('#btn-load-csv');
  const btnFillForm = $('#btn-fill-form');
  const csvFileInput = $('#csv-file-input');
  const btnPresetAllNA = $('#btn-preset-all-na');
  const btnPresetAllGPFM = $('#btn-preset-all-gpfm');
  const btnSaveOptions = $('#btn-save-options');

  // Result areas
  const structureResult = $('#structure-result');
  const exportSection = $('#export-section');
  const optionsSection = $('#options-section');
  const optionsMappingDiv = $('#options-mapping');
  const importPreview = $('#import-preview');
  const fillResult = $('#fill-result');

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
        handleScreenChange(response.screen);
        return true;
      }
    } catch (e) {
      setStatus("Desconnectat d'Esfer@", 'disconnected');
      showScreen('waiting');
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
        const stored = await chrome.storage.local.get([
          'capturedStructure', 'capturedStudents', 'optionsMapping'
        ]);
        if (stored.capturedStructure) {
          capturedStructure = stored.capturedStructure;
          showStructureResult(capturedStructure);
        }
        if (stored.capturedStudents) {
          capturedStudents = stored.capturedStudents;
        }
        if (stored.optionsMapping) {
          optionsMapping = stored.optionsMapping;
        }
        break;
      default:
        showScreen('waiting');
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
      '<strong>' + students.length + ' alumnes detectats</strong>' +
      'Es generara una columna per cadascun al CSV.';

    const preview = $('#student-list-preview');
    preview.innerHTML = students.map((s, i) =>
      '<div class="list-item">' +
      '<span class="code">' + (i + 1) + '</span>' +
      '<span class="name">' + escapeHtml(s.nom) + '</span>' +
      '<span class="value" style="color:#666; font-size:10px">' +
      escapeHtml(s.idRalc || s.id) + '</span>' +
      '</div>'
    ).join('');
  }

  // =========================================================================
  // CURRENT STUDENT
  // =========================================================================

  async function loadCurrentStudent() {
    try {
      const response = await sendToContentScript({ action: 'detect-current-student' });
      if (response && response.student) {
        const s = response.student;
        $('#current-student-info').innerHTML =
          '<strong>Alumne actual</strong>' +
          escapeHtml(s.nom || 'Desconegut') +
          '<br><span style="color:#666;font-size:11px">RALC: ' +
          escapeHtml(s.idRalc || s.id || '?') + '</span>';
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
    const totalItems = items.length;

    structureResult.className = 'result-box success';
    structureResult.innerHTML =
      '<strong>' + totalItems + ' items capturats</strong>' +
      '(' + subjects.length + ' materies amb els seus subitems)<br><br>' +
      subjects.map((s) => {
        const sIdx = items.indexOf(s);
        const nextSubjectIdx = items.findIndex(
          (x, idx) => idx > sIdx && x.type === 'subject'
        );
        const endIdx = nextSubjectIdx === -1 ? items.length : nextSubjectIdx;
        const childCount = items.slice(sIdx + 1, endIdx).filter(
          (i) => i.type === 'item'
        ).length;
        return '<b>' + escapeHtml(s.code) + '</b> ' + escapeHtml(s.name) +
          ' (' + childCount + ' items)';
      }).join('<br>');
    structureResult.classList.remove('hidden');

    optionsSection.classList.remove('hidden');
    exportSection.classList.remove('hidden');
  }

  // =========================================================================
  // OPTIONS MAPPING (qualificadors per materia)
  // =========================================================================

  function buildOptionsMapping(items) {
    const subjects = items.filter((i) => i.type === 'subject');

    // Carreguem mapeig existent o creem un de nou
    // Per defecte: 'assoliment' per totes les materies
    subjects.forEach((s) => {
      if (!optionsMapping[s.code]) {
        optionsMapping[s.code] = 'assoliment';
      }
    });

    renderOptionsMapping(subjects);
  }

  function renderOptionsMapping(subjects) {
    optionsMappingDiv.innerHTML = subjects.map((s) => {
      const currentSet = optionsMapping[s.code] || 'assoliment';
      const selectOptions = Object.keys(OPTION_SETS).map((key) =>
        '<option value="' + key + '"' +
        (key === currentSet ? ' selected' : '') + '>' +
        escapeHtml(OPTION_SETS[key].label) + '</option>'
      ).join('');

      return '<div class="options-mapping-item">' +
        '<span class="subject-code">' + escapeHtml(s.code) + '</span>' +
        '<span class="subject-name" title="' + escapeHtml(s.name) + '">' +
        escapeHtml(s.name) + '</span>' +
        '<select data-subject="' + escapeHtml(s.code) + '">' +
        selectOptions + '</select>' +
        '</div>';
    }).join('');

    // Event listeners per cada select
    optionsMappingDiv.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        optionsMapping[e.target.dataset.subject] = e.target.value;
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

  async function saveOptionsMapping() {
    await chrome.storage.local.set({ optionsMapping });
    btnSaveOptions.textContent = 'Desat!';
    setTimeout(() => {
      btnSaveOptions.textContent = 'Desa la configuracio';
    }, 1500);
  }

  /**
   * Retorna les opcions filtrades per un item, segons el mapeig de la seva materia.
   */
  function getFilteredOptions(item, allItems) {
    // Trobem a quina materia pertany l'item
    let subjectCode = '';
    if (item.type === 'subject') {
      subjectCode = item.code;
    } else {
      // Busquem la materia pare (l'ultim subject abans d'aquest item)
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
      // 'totes' -> retornem les opcions originals
      return item.options.map((o) => o.value);
    }

    // Filtrem: nomes les opcions que estan tant al set com a les originals
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
            valResponse.values.forEach((v) => { currentValues[v.code] = v.value; });
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

      // Fila 1: Capçalera -> Codi | Nom | Opcions | Alumne1 | Alumne2 | ...
      const header = ['Codi', 'Nom', 'Opcions'];
      if (capturedStudents && capturedStudents.length > 0) {
        capturedStudents.forEach((s) => header.push(s.nom));
      } else if (currentStudent) {
        header.push(currentStudent.nom || 'Alumne');
      }
      rows.push(header);

      // Fila 2: IDs (RALC) per matching automatic
      const idRow = ['#ID', '', ''];
      if (capturedStudents && capturedStudents.length > 0) {
        capturedStudents.forEach((s) => idRow.push(s.idRalc || s.id));
      } else if (currentStudent) {
        idRow.push(currentStudent.idRalc || currentStudent.id || '');
      }
      rows.push(idRow);

      // Files d'items
      capturedStructure.forEach((item) => {
        // Opcions filtrades segons el mapeig
        const filteredOpts = getFilteredOptions(item, capturedStructure);

        const row = [
          item.code,
          item.name,
          filteredOpts.join('|')
        ];

        if (capturedStudents && capturedStudents.length > 0) {
          capturedStudents.forEach((s) => {
            const studentId = s.idRalc || s.id;
            const currentId = currentStudent
              ? (currentStudent.idRalc || currentStudent.id)
              : '';
            if (includeCurrentValues && currentId &&
                studentId === currentId && currentValues[item.code]) {
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

      // Convertim a CSV string
      const csvContent = rows.map((row) =>
        row.map((cell) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        }).join(',')
      ).join('\n');

      // Descarreguem
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
  // CSV IMPORT
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

      // Detectem l'alumne actual
      let currentStudent = null;
      try {
        const response = await sendToContentScript({ action: 'detect-current-student' });
        currentStudent = response ? response.student : null;
      } catch (e) {
        // ignore
      }

      // Busquem la columna de l'alumne actual
      let matchedColumn = null;
      let matchedStudentName = '';

      if (currentStudent) {
        const currentId = currentStudent.idRalc || currentStudent.id || '';

        // Matching per ID (RALC)
        if (currentId && loadedCSVData.studentIds.length > 0) {
          const colIndex = loadedCSVData.studentIds.indexOf(currentId);
          if (colIndex >= 0) {
            matchedColumn = colIndex;
            matchedStudentName = loadedCSVData.studentNames[colIndex] || '';
          }
        }

        // Matching per nom (fuzzy) si no hem trobat per ID
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

      // Si nomes hi ha 1 alumne al CSV, l'agafem directament
      if (matchedColumn === null && loadedCSVData.studentNames.length === 1) {
        matchedColumn = 0;
        matchedStudentName = loadedCSVData.studentNames[0];
      }

      if (matchedColumn === null) {
        importPreview.classList.remove('hidden');
        const infoBox = $('#import-student-info');
        infoBox.className = 'info-box';
        infoBox.style.background = '#fff3e0';
        infoBox.style.borderColor = '#ffcc80';
        infoBox.innerHTML =
          '<strong>Alumne no trobat al CSV</strong>' +
          "L'alumne actual (" +
          escapeHtml(currentStudent ? currentStudent.nom : '?') +
          ') no coincideix amb cap columna del CSV.<br>' +
          'Columnes disponibles: ' +
          loadedCSVData.studentNames.map((n) => escapeHtml(n)).join(', ');
        $('#import-data-preview').innerHTML = '';
        btnFillForm.classList.add('hidden');
        return;
      }

      // Mostrem preview de les dades a importar
      const dataToFill = loadedCSVData.items.map((item) => ({
        code: item.code,
        name: item.name,
        value: item.values[matchedColumn] || ''
      })).filter((d) => d.value);

      importPreview.classList.remove('hidden');
      const infoBox = $('#import-student-info');
      infoBox.style.background = '';
      infoBox.style.borderColor = '';
      infoBox.innerHTML =
        '<strong>Alumne: ' + escapeHtml(matchedStudentName) + '</strong>' +
        dataToFill.length + ' valors a importar';

      $('#import-data-preview').innerHTML = dataToFill.map((d) =>
        '<div class="list-item">' +
        '<span class="code">' + escapeHtml(d.code) + '</span>' +
        '<span class="name">' + escapeHtml(d.name) + '</span>' +
        '<span class="value">' + escapeHtml(d.value) + '</span>' +
        '</div>'
      ).join('');

      btnFillForm.classList.remove('hidden');
      btnFillForm.dataset.column = matchedColumn;
      fillResult.classList.add('hidden');
    };

    reader.readAsText(file, 'UTF-8');
    csvFileInput.value = '';
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

    const data = loadedCSVData.items
      .map((item) => ({
        code: item.code,
        value: item.values[colIndex] || ''
      }))
      .filter((d) => d.value);

    try {
      const response = await sendToContentScript({
        action: 'fill-values',
        data: data
      });

      if (response) {
        fillResult.classList.remove('hidden');
        if (response.errors && response.errors.length > 0) {
          fillResult.className = 'result-box info';
          fillResult.innerHTML =
            '<strong>' + response.success + ' camps omplerts correctament</strong><br>' +
            response.errors.length + ' errors:<br>' +
            response.errors.map((e) =>
              escapeHtml(e.code) + ': ' + escapeHtml(e.error)
            ).join('<br>');
        } else {
          fillResult.className = 'result-box success';
          fillResult.innerHTML =
            '<strong>' + response.success + ' camps omplerts correctament</strong><br>' +
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
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 3) return null;

    const rows = lines.map(parseCSVLine);

    const header = rows[0];
    if (header.length < 4) return null;

    const idRow = rows[1];

    const studentNames = header.slice(3);
    const studentIds = idRow.slice(3);

    const items = [];
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      items.push({
        code: row[0],
        name: row[1] || '',
        options: (row[2] || '').split('|').filter((o) => o),
        values: row.slice(3)
      });
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
  btnExportCSV.addEventListener('click', generateCSV(false));
  btnExportCSVCurrent.addEventListener('click', generateCSV(true));
  btnLoadCSV.addEventListener('click', triggerCSVLoad);
  csvFileInput.addEventListener('change', handleCSVFile);
  btnFillForm.addEventListener('click', fillForm);
  btnPresetAllNA.addEventListener('click', () => applyPresetToAll('assoliment'));
  btnPresetAllGPFM.addEventListener('click', () => applyPresetToAll('valoracio'));
  btnSaveOptions.addEventListener('click', saveOptionsMapping);

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  checkConnection();
  setInterval(checkConnection, 2000);

  chrome.tabs.onActivated.addListener(() => {
    setTimeout(checkConnection, 500);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'tab-updated') {
      setTimeout(checkConnection, 1000);
    }
  });

})();
