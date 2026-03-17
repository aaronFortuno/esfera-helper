/**
 * Esfer@ Helper - Google Sheets API Module
 *
 * Gestiona l'autenticacio OAuth amb Google i la creacio de fulls de calcul.
 *
 * Utilitza chrome.identity.launchWebAuthFlow (compatible Chrome + Edge,
 * no requereix publicacio al Web Store).
 *
 * Quan l'extensio es publiqui, es pot migrar a chrome.identity.getAuthToken
 * canviant nomes les funcions d'autenticacio (getToken/revokeToken).
 *
 * IMPORTANT: Cal configurar un client_id de tipus "Web application" a
 * Google Cloud Console amb el redirect URI:
 *   https://<extension-id>.chromiumapp.org/
 *
 * El client_id s'ha de posar a SHEETS_CONFIG.clientId abans de fer servir.
 */

// eslint-disable-next-line no-unused-vars, no-redeclare
const SheetsAPI = (function () {
  'use strict';

  // =========================================================================
  // CONFIGURACIO
  // =========================================================================

  const SHEETS_CONFIG = {
    clientId: '490789126243-jdjedkl7v2d0c5erkl4t968vos8si0le.apps.googleusercontent.com',
    scopes:
      'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    apiBase: 'https://sheets.googleapis.com/v4/spreadsheets',
    redirectPath: '/',
  };

  // =========================================================================
  // AUTENTICACIO (launchWebAuthFlow)
  // =========================================================================

  /**
   * Obte la redirect URL per OAuth.
   * chrome.identity.getRedirectURL pot no existir a Edge o Brave,
   * aixi que fem fallback construint la URL manualment amb l'ID de l'extensio.
   * @param {string} path - Path relatiu (ex: '/')
   * @returns {string}
   */
  function getRedirectURL(path) {
    if (
      typeof chrome !== 'undefined' &&
      chrome.identity &&
      typeof chrome.identity.getRedirectURL === 'function'
    ) {
      return chrome.identity.getRedirectURL(path);
    }
    // Fallback: construim la URL manualment
    const extensionId = chrome.runtime.id;
    const cleanPath = (path || '').replace(/^\//, '');
    return 'https://' + extensionId + '.chromiumapp.org/' + cleanPath;
  }

  /**
   * Llança el flux OAuth via chrome.identity.launchWebAuthFlow.
   * Si chrome.identity no esta disponible (pot passar a Brave o en contextos
   * on l'API no s'ha carregat), obre el flux manualment en una pestanya.
   * @param {string} authUrlStr - URL d'autenticacio completa
   * @param {string} redirectUrl - URL de redireccio esperada
   * @returns {Promise<string>} URL de resposta amb el token
   */
  async function launchAuthFlow(authUrlStr, redirectUrl) {
    // Cas normal: chrome.identity disponible
    if (
      typeof chrome !== 'undefined' &&
      chrome.identity &&
      typeof chrome.identity.launchWebAuthFlow === 'function'
    ) {
      return chrome.identity.launchWebAuthFlow({
        url: authUrlStr,
        interactive: true,
      });
    }

    // Fallback: Error clar si l'API no esta disponible
    throw new Error(
      "L'API chrome.identity no esta disponible. " +
        "Recarrega l'extensio des de chrome://extensions (o brave://extensions) " +
        'i torna-ho a provar.'
    );
  }

  /**
   * Obte un token d'acces OAuth2 via chrome.identity.launchWebAuthFlow.
   * Si ja tenim un token valid en cache, el retorna directament.
   *
   * @param {boolean} interactive - Si true, mostra la finestra de login.
   * @returns {Promise<string>} Token d'acces.
   */
  async function getToken(interactive = true) {
    // Intentem recuperar un token existent
    const stored = await chrome.storage.local.get(['sheetsAccessToken', 'sheetsTokenExpiry']);

    if (stored.sheetsAccessToken && stored.sheetsTokenExpiry) {
      const now = Date.now();
      // Marge de 60s per evitar usar un token a punt d'expirar
      if (now < stored.sheetsTokenExpiry - 60000) {
        return stored.sheetsAccessToken;
      }
    }

    if (!interactive) {
      throw new Error('No hi ha sessio activa de Google Sheets.');
    }

    // Necessitem un token nou
    const redirectUrl = getRedirectURL(SHEETS_CONFIG.redirectPath);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', SHEETS_CONFIG.clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUrl);
    authUrl.searchParams.set('scope', SHEETS_CONFIG.scopes);
    authUrl.searchParams.set('prompt', 'consent');

    const responseUrl = await launchAuthFlow(authUrl.toString(), redirectUrl);

    // Extraiem el token de la URL de resposta
    const hashParams = new URLSearchParams(new URL(responseUrl).hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);

    if (!accessToken) {
      throw new Error("No s'ha pogut obtenir el token d'acces.");
    }

    // Guardem en storage
    await chrome.storage.local.set({
      sheetsAccessToken: accessToken,
      sheetsTokenExpiry: Date.now() + expiresIn * 1000,
    });

    return accessToken;
  }

  /**
   * Revoca el token i esborra la sessio.
   */
  async function revokeToken() {
    const stored = await chrome.storage.local.get(['sheetsAccessToken']);
    if (stored.sheetsAccessToken) {
      try {
        await fetch(
          'https://accounts.google.com/o/oauth2/revoke?token=' + stored.sheetsAccessToken,
          { method: 'POST' }
        );
      } catch (e) {
        // Ignorem errors de revocacio (el token pot ja haver expirat)
        console.warn('[Esfer@ Helper] Error revocant token:', e);
      }
    }
    await chrome.storage.local.remove(['sheetsAccessToken', 'sheetsTokenExpiry']);
  }

  /**
   * Comprova si hi ha una sessio activa (token valid).
   * @returns {Promise<boolean>}
   */
  async function isAuthenticated() {
    try {
      await getToken(false);
      return true;
    } catch (e) {
      return false;
    }
  }

  // =========================================================================
  // GOOGLE SHEETS API
  // =========================================================================

  /**
   * Fa una peticio autenticada a la Google Sheets API.
   * @param {string} url
   * @param {object} options - fetch options
   * @returns {Promise<object>} Resposta JSON
   */
  async function apiRequest(url, options = {}) {
    const token = await getToken(true);

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData.error?.message || 'Error ' + response.status + ' de Google Sheets API';

      // Si el token ha expirat, esborrem i deixem que es reintenti
      if (response.status === 401) {
        await chrome.storage.local.remove(['sheetsAccessToken', 'sheetsTokenExpiry']);
      }

      throw new Error(errorMsg);
    }

    return response.json();
  }

  /**
   * Crea un spreadsheet nou amb les dades de la graella.
   *
   * @param {object} params
   * @param {Array<object>} params.items - Items capturats (code, name, type, options)
   * @param {Array<object>} params.students - Alumnes (nom, idRalc, id)
   * @param {object} params.optionsMapping - Mapeig de qualificadors per materia
   * @param {object} params.optionSets - Jocs de qualificadors (OPTION_SETS)
   * @param {function} params.getFilteredOptions - Funcio per filtrar opcions
   * @param {object} [params.currentValues] - Valors actuals {code: value} (opcional)
   * @param {object} [params.currentStudent] - Alumne actual (opcional, per valors)
   * @returns {Promise<{spreadsheetId: string, spreadsheetUrl: string}>}
   */
  async function createSpreadsheet(params) {
    const {
      items,
      students,
      optionsMapping,
      optionSets,
      getFilteredOptions,
      currentValues,
      currentStudent,
    } = params;

    const title =
      params.title ||
      'Esfer@ Qualificacions ' +
        new Date().toLocaleDateString('ca-ES', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });

    // ---- Construim les dades en format 2D ----
    const sheetData = buildSheetData({
      items,
      students,
      optionsMapping,
      optionSets,
      getFilteredOptions,
      currentValues,
      currentStudent,
    });

    // ---- Creem el spreadsheet amb estructura i format ----
    const createResponse = await apiRequest(SHEETS_CONFIG.apiBase, {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: title,
          locale: 'ca_ES',
        },
        sheets: [
          {
            properties: {
              title: 'Qualificacions',
              gridProperties: {
                rowCount: sheetData.length,
                columnCount: sheetData[0].length,
                frozenRowCount: 2,
                frozenColumnCount: 3,
              },
            },
          },
        ],
      }),
    });

    const spreadsheetId = createResponse.spreadsheetId;
    const sheetId = createResponse.sheets[0].properties.sheetId;

    // ---- Escrivim les dades ----
    await apiRequest(
      SHEETS_CONFIG.apiBase +
        '/' +
        spreadsheetId +
        '/values/Qualificacions!A1?valueInputOption=RAW',
      {
        method: 'PUT',
        body: JSON.stringify({
          range: 'Qualificacions!A1',
          majorDimension: 'ROWS',
          values: sheetData,
        }),
      }
    );

    // ---- Apliquem format (colors, validacio, amplades) ----
    const formatRequests = buildFormatRequests(sheetId, items, students, sheetData);
    if (formatRequests.length > 0) {
      await apiRequest(SHEETS_CONFIG.apiBase + '/' + spreadsheetId + ':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ requests: formatRequests }),
      });
    }

    return {
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit',
    };
  }

  // =========================================================================
  // CONSTRUCCIO DE DADES
  // =========================================================================

  /**
   * Construeix la matriu 2D de dades per al spreadsheet.
   * Format identic al CSV: Codi | Nom | Opcions | Alumne1 | Alumne2 | ...
   */
  function buildSheetData(params) {
    const { items, students, getFilteredOptions, currentValues, currentStudent } = params;

    const rows = [];

    // Fila 1: Capcalera (noms)
    const header = ['Codi', 'Nom', 'Opcions'];
    if (students && students.length > 0) {
      students.forEach((s) => header.push(s.nom));
    } else if (currentStudent) {
      header.push(currentStudent.nom || 'Alumne');
    }
    rows.push(header);

    // Fila 2: IDs (RALC)
    const idRow = ['#ID', '', ''];
    if (students && students.length > 0) {
      students.forEach((s) => idRow.push(s.idRalc || s.id));
    } else if (currentStudent) {
      idRow.push(currentStudent.idRalc || currentStudent.id || '');
    }
    rows.push(idRow);

    // Files de dades
    items.forEach((item) => {
      const filteredOpts = getFilteredOptions(item, items);
      const row = [item.code, item.name, filteredOpts.join('|')];

      if (students && students.length > 0) {
        students.forEach((s) => {
          const studentId = s.idRalc || s.id;
          const currentId = currentStudent ? currentStudent.idRalc || currentStudent.id : '';
          if (currentValues && currentId && studentId === currentId && currentValues[item.code]) {
            row.push(currentValues[item.code]);
          } else {
            row.push('');
          }
        });
      } else if (currentValues && currentValues[item.code]) {
        row.push(currentValues[item.code]);
      } else {
        row.push('');
      }

      rows.push(row);
    });

    return rows;
  }

  // =========================================================================
  // FORMAT DEL SPREADSHEET
  // =========================================================================

  /**
   * Genera les peticions de format per al batchUpdate.
   */
  function buildFormatRequests(sheetId, items, students, sheetData) {
    const requests = [];
    const numCols = sheetData[0].length;
    const numRows = sheetData.length;

    // ---- Format capcalera (fila 1) ----
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: numCols,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.18, green: 0.55, blue: 0.34 }, // #2e8b57
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
              fontSize: 11,
            },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    // ---- Format fila IDs (fila 2) ----
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: numCols,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
            textFormat: {
              italic: true,
              fontSize: 9,
              foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 },
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });

    // ---- Columnes Codi, Nom, Opcions: fons gris clar ----
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: numRows,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.97, green: 0.97, blue: 0.97 },
            textFormat: { fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });

    // ---- Materies (subjects) amb fons diferent ----
    items.forEach((item, idx) => {
      if (item.type === 'subject') {
        const rowIndex = idx + 2; // +2 per capcalera + IDs
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: numCols,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.85, green: 0.92, blue: 0.87 },
                textFormat: { bold: true, fontSize: 10 },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        });
      }
    });

    // ---- Amplades de columnes ----
    const columnWidths = [
      { col: 0, width: 80 }, // Codi
      { col: 1, width: 250 }, // Nom
      { col: 2, width: 100 }, // Opcions
    ];

    // Columnes d'alumnes
    const studentCount = students ? students.length : 1;
    for (let i = 0; i < studentCount; i++) {
      columnWidths.push({ col: 3 + i, width: 60 });
    }

    columnWidths.forEach(({ col, width }) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 },
          properties: { pixelSize: width },
          fields: 'pixelSize',
        },
      });
    });

    // ---- Validacio de dades a les cel·les d'alumnes ----
    // Per cada item, creem un dropdown amb les opcions filtrades
    items.forEach((item, idx) => {
      const rowIndex = idx + 2;
      const optionsStr = sheetData[rowIndex] ? sheetData[rowIndex][2] : '';
      const options = optionsStr ? optionsStr.split('|').filter((o) => o) : [];

      if (options.length > 0) {
        requests.push({
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 3,
              endColumnIndex: numCols,
            },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: options.map((o) => ({ userEnteredValue: o })),
              },
              showCustomUi: true,
              strict: false,
            },
          },
        });
      }
    });

    // ---- Bordes a la zona de dades ----
    const thinBorder = {
      style: 'SOLID',
      colorStyle: { rgbColor: { red: 0.85, green: 0.85, blue: 0.85 } },
    };

    requests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: numRows,
          startColumnIndex: 0,
          endColumnIndex: numCols,
        },
        innerHorizontal: thinBorder,
        innerVertical: thinBorder,
        top: thinBorder,
        bottom: thinBorder,
        left: thinBorder,
        right: thinBorder,
      },
    });

    return requests;
  }

  // =========================================================================
  // LECTURA DE SPREADSHEET
  // =========================================================================

  /**
   * Llegeix totes les dades d'un spreadsheet i les retorna en format
   * compatible amb parseCSV (loadedCSVData).
   *
   * @param {string} spreadsheetId
   * @returns {Promise<{studentNames, studentIds, items}>}
   */
  async function readSpreadsheet(spreadsheetId) {
    const response = await apiRequest(
      SHEETS_CONFIG.apiBase + '/' + spreadsheetId + '/values/Qualificacions!A:ZZ'
    );

    const rows = response.values;
    if (!rows || rows.length < 3) {
      throw new Error('El full de calcul no te prou dades (minim 3 files).');
    }

    const header = rows[0];
    const idRow = rows[1];

    if (header.length < 4) {
      throw new Error('Format invalid: la capcalera necessita minim 4 columnes.');
    }

    const studentNames = header.slice(3);
    const studentIds = idRow.slice(3);

    const items = [];
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const code = (row[0] || '').trim();
      if (!code || code.startsWith('#')) continue;

      const values = row.slice(3);
      // Omplim amb strings buits si falten columnes
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
      throw new Error("No s'han trobat items amb dades al full de calcul.");
    }

    return { studentNames, studentIds, items };
  }

  // =========================================================================
  // ELIMINACIO DE SPREADSHEET
  // =========================================================================

  /**
   * Elimina un spreadsheet de Google Drive.
   * Requereix el scope drive.file (que dona permis sobre fitxers creats per l'app).
   *
   * @param {string} spreadsheetId
   * @returns {Promise<void>}
   */
  async function deleteSpreadsheet(spreadsheetId) {
    const token = await getToken(true);

    const response = await fetch('https://www.googleapis.com/drive/v3/files/' + spreadsheetId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });

    // 204 = eliminat correctament, 404 = ja no existeix (ok igualment)
    if (!response.ok && response.status !== 404) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message ||
          "No s'ha pogut eliminar el full de calcul (error " + response.status + ')'
      );
    }
  }

  // =========================================================================
  // API PUBLICA
  // =========================================================================

  return {
    getToken,
    revokeToken,
    isAuthenticated,
    createSpreadsheet,
    readSpreadsheet,
    deleteSpreadsheet,
    buildSheetData,
    SHEETS_CONFIG,
  };
})();
