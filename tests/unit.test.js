/**
 * Esfer@ Helper - Unit Tests
 *
 * Tests per les funcions pures del projecte.
 * Executar amb: node --test tests/unit.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// =========================================================================
// FUNCIONS EXTRETES PER TESTEJAR
// (copies de les funcions pures de sidepanel.js i scraper.js)
// =========================================================================

/**
 * Normalitza un string (de sidepanel.js)
 */
function normalizeString(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parseja una linia CSV (de sidepanel.js)
 */
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

/**
 * Parseja un CSV complet (de sidepanel.js, versio millorada)
 */
function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return null;

  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 3) return null;

  const rows = lines.map(parseCSVLine);

  const header = rows[0];
  if (header.length < 4) return null;

  const idRow = rows[1];
  const studentNames = header.slice(3);
  const studentIds = idRow.slice(3);

  if (studentNames.length === 0) return null;

  const items = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const code = (row[0] || '').trim();
    if (!code || code.startsWith('#')) continue;

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

  if (items.length === 0) return null;

  return { studentNames, studentIds, items };
}

/**
 * Escapa HTML (de sidepanel.js - versio simplificada per Node)
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * OPTION_SETS (de sidepanel.js)
 */
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

/**
 * Filtra opcions per materia (de sidepanel.js)
 */
function getFilteredOptions(item, allItems, optionsMapping) {
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

/**
 * Construeix la matriu 2D de dades per al spreadsheet (de sheets-api.js)
 */
function buildSheetData(params) {
  const { items, students, getFilteredOptions: filterFn, currentValues, currentStudent } = params;

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
    const filteredOpts = filterFn(item, items);
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

/**
 * Filtra items per materies seleccionades (de sidepanel.js)
 */
function getSelectedItems(capturedStructure, selectedSubjects) {
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

// =========================================================================
// TESTS
// =========================================================================
// TESTS
// =========================================================================

describe('normalizeString', () => {
  it('converteix a minuscules', () => {
    assert.equal(normalizeString('HOLA'), 'hola');
  });

  it('elimina accents', () => {
    assert.equal(normalizeString('àèìòùáéíóú'), 'aeiouaeiou');
    assert.equal(normalizeString('çÇñÑ'), 'ccnn');
  });

  it('normalitza espais multiples', () => {
    assert.equal(normalizeString('  hola   mon  '), 'hola mon');
  });

  it('gestiona strings buits', () => {
    assert.equal(normalizeString(''), '');
    assert.equal(normalizeString('   '), '');
  });

  it('normalitza noms catalans tipics', () => {
    assert.equal(normalizeString('Annassiri, Ibrahim'), normalizeString('annassiri, ibrahim'));
    assert.equal(
      normalizeString('García López, María José'),
      normalizeString('garcia lopez, maria jose')
    );
  });

  it('gestiona caracters especials', () => {
    assert.equal(normalizeString("L'Hospitalet"), "l'hospitalet");
  });
});

describe('parseCSVLine', () => {
  it('parseja una linia simple', () => {
    assert.deepEqual(parseCSVLine('a,b,c'), ['a', 'b', 'c']);
  });

  it('parseja camps buits', () => {
    assert.deepEqual(parseCSVLine('a,,c'), ['a', '', 'c']);
  });

  it('parseja camps entre cometes', () => {
    assert.deepEqual(parseCSVLine('"hola, mon",b,c'), ['hola, mon', 'b', 'c']);
  });

  it('parseja cometes escapades dins de camps', () => {
    assert.deepEqual(parseCSVLine('"di ""hola""",b'), ['di "hola"', 'b']);
  });

  it('parseja linia amb un sol camp', () => {
    assert.deepEqual(parseCSVLine('solitari'), ['solitari']);
  });

  it('parseja linia buida', () => {
    assert.deepEqual(parseCSVLine(''), ['']);
  });

  it('gestiona comes al final', () => {
    assert.deepEqual(parseCSVLine('a,b,'), ['a', 'b', '']);
  });

  it('gestiona camps amb salts de linia entre cometes', () => {
    // Note: parseCSVLine works on a single line, so newlines within quotes
    // would only appear if the line was already properly extracted
    assert.deepEqual(parseCSVLine('"line1\nline2",b'), ['line1\nline2', 'b']);
  });
});

describe('parseCSV', () => {
  const validCSV = [
    'Codi,Nom,Opcions,Alumne1,Alumne2',
    '#ID,,,RALC001,RALC002',
    'MAT,Matematiques,NA|AS|AN|AE,AN,AE',
    'CAT,Catala,NA|AS|AN|AE,AS,',
  ].join('\n');

  it('parseja un CSV valid correctament', () => {
    const result = parseCSV(validCSV);
    assert.notEqual(result, null);
    assert.deepEqual(result.studentNames, ['Alumne1', 'Alumne2']);
    assert.deepEqual(result.studentIds, ['RALC001', 'RALC002']);
    assert.equal(result.items.length, 2);
  });

  it('extreu codis i noms dels items', () => {
    const result = parseCSV(validCSV);
    assert.equal(result.items[0].code, 'MAT');
    assert.equal(result.items[0].name, 'Matematiques');
    assert.equal(result.items[1].code, 'CAT');
    assert.equal(result.items[1].name, 'Catala');
  });

  it('extreu opcions correctament', () => {
    const result = parseCSV(validCSV);
    assert.deepEqual(result.items[0].options, ['NA', 'AS', 'AN', 'AE']);
  });

  it('extreu valors per alumne', () => {
    const result = parseCSV(validCSV);
    assert.deepEqual(result.items[0].values, ['AN', 'AE']);
    assert.deepEqual(result.items[1].values, ['AS', '']);
  });

  it('retorna null per CSV buit', () => {
    assert.equal(parseCSV(''), null);
    assert.equal(parseCSV(null), null);
    assert.equal(parseCSV(undefined), null);
  });

  it('retorna null per CSV massa curt', () => {
    assert.equal(parseCSV('Codi,Nom\n#ID,'), null);
  });

  it("retorna null per CSV sense columnes d'alumnes", () => {
    const csv = 'Codi,Nom,Opcions\n#ID,,\nMAT,Mat,NA|AS';
    assert.equal(parseCSV(csv), null);
  });

  it('ignora files buides', () => {
    const csv = validCSV + '\n\n\n';
    const result = parseCSV(csv);
    assert.equal(result.items.length, 2);
  });

  it('ignora files que comencen amb #', () => {
    const csv = [
      'Codi,Nom,Opcions,Alumne1',
      '#ID,,,RALC001',
      '# Comentari ignorat',
      'MAT,Matematiques,NA|AS|AN|AE,AN',
    ].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.items.length, 1);
  });

  it('gestiona BOM UTF-8', () => {
    const csvWithBOM = '\uFEFF' + validCSV;
    const result = parseCSV(csvWithBOM);
    assert.notEqual(result, null);
    assert.equal(result.items.length, 2);
  });

  it('omple columnes curtes amb strings buits', () => {
    const csv = [
      'Codi,Nom,Opcions,Alumne1,Alumne2,Alumne3',
      '#ID,,,R1,R2,R3',
      'MAT,Mat,NA|AS,AN',
    ].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.items[0].values.length, 3);
    assert.equal(result.items[0].values[0], 'AN');
    assert.equal(result.items[0].values[1], '');
    assert.equal(result.items[0].values[2], '');
  });

  it('gestiona camps amb comes entre cometes', () => {
    const csv = [
      'Codi,Nom,Opcions,"Garcia, Maria"',
      '#ID,,,RALC001',
      'MAT,"Matematiques, bla",NA|AS,AN',
    ].join('\n');
    const result = parseCSV(csv);
    assert.equal(result.studentNames[0], 'Garcia, Maria');
    assert.equal(result.items[0].name, 'Matematiques, bla');
  });

  it('gestiona CSV amb retorns de carro Windows (CRLF)', () => {
    const csv = 'Codi,Nom,Opcions,Alumne1\r\n#ID,,,RALC001\r\nMAT,Mat,NA|AS,AN';
    const result = parseCSV(csv);
    assert.notEqual(result, null);
    assert.equal(result.items.length, 1);
  });
});

describe('escapeHtml', () => {
  it('escapa caracters HTML basics', () => {
    assert.equal(
      escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapa ampersands', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });

  it('gestiona strings buits', () => {
    assert.equal(escapeHtml(''), '');
  });

  it('no modifica text sense caracters especials', () => {
    assert.equal(escapeHtml('text normal'), 'text normal');
  });

  it('escapa cometes simples', () => {
    assert.equal(escapeHtml("l'escola"), 'l&#039;escola');
  });
});

describe('getFilteredOptions', () => {
  const allItems = [
    {
      code: 'MAT',
      name: 'Matematiques',
      type: 'subject',
      options: [
        { value: 'NA' },
        { value: 'AS' },
        { value: 'AN' },
        { value: 'AE' },
        { value: 'G' },
        { value: 'P' },
        { value: 'F' },
        { value: 'M' },
      ],
    },
    {
      code: 'MAT01',
      name: 'Algebra',
      type: 'item',
      options: [
        { value: 'NA' },
        { value: 'AS' },
        { value: 'AN' },
        { value: 'AE' },
        { value: 'G' },
        { value: 'P' },
        { value: 'F' },
        { value: 'M' },
      ],
    },
    {
      code: 'CAT',
      name: 'Catala',
      type: 'subject',
      options: [
        { value: 'NA' },
        { value: 'AS' },
        { value: 'AN' },
        { value: 'AE' },
        { value: 'G' },
        { value: 'P' },
        { value: 'F' },
        { value: 'M' },
      ],
    },
    {
      code: 'CAT01',
      name: 'Lectura',
      type: 'item',
      options: [
        { value: 'NA' },
        { value: 'AS' },
        { value: 'AN' },
        { value: 'AE' },
        { value: 'G' },
        { value: 'P' },
        { value: 'F' },
        { value: 'M' },
      ],
    },
  ];

  it('filtra per assoliment (NA/AS/AN/AE)', () => {
    const mapping = { MAT: 'assoliment', CAT: 'assoliment' };
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE']);
  });

  it('filtra per valoracio (G/P/F/M)', () => {
    const mapping = { MAT: 'valoracio', CAT: 'valoracio' };
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['G', 'P', 'F', 'M']);
  });

  it('retorna totes les opcions amb "totes"', () => {
    const mapping = { MAT: 'totes' };
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE', 'G', 'P', 'F', 'M']);
  });

  it('retorna totes les opcions si no hi ha mapping', () => {
    const mapping = {};
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE', 'G', 'P', 'F', 'M']);
  });

  it('funciona amb subjects directament', () => {
    const mapping = { MAT: 'assoliment' };
    const result = getFilteredOptions(allItems[0], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE']);
  });

  it('items hereten el mapping de la seva materia', () => {
    const mapping = { MAT: 'assoliment', CAT: 'valoracio' };
    const matItem = getFilteredOptions(allItems[1], allItems, mapping);
    const catItem = getFilteredOptions(allItems[3], allItems, mapping);
    assert.deepEqual(matItem, ['NA', 'AS', 'AN', 'AE']);
    assert.deepEqual(catItem, ['G', 'P', 'F', 'M']);
  });

  it('nomes retorna opcions que existeixen al original', () => {
    const itemWithFewOptions = {
      code: 'MAT02',
      name: 'Geometria',
      type: 'item',
      options: [{ value: 'NA' }, { value: 'AE' }],
    };
    const items = [allItems[0], itemWithFewOptions];
    const mapping = { MAT: 'assoliment' };
    const result = getFilteredOptions(itemWithFewOptions, items, mapping);
    assert.deepEqual(result, ['NA', 'AE']);
  });
});

describe('Integracio: CSV round-trip', () => {
  it('parseja un CSV generat amb el format esperat', () => {
    const csv = [
      'Codi,Nom,Opcions,"Annassiri, Ibrahim","Garcia Lopez, Maria"',
      '#ID,,,14180367451,14280367452',
      'DM,Desenvolupament personal,NA|AS|AN|AE,,',
      'DM01,Autonomia,NA|AS|AN|AE,AN,AE',
      'DM02,Responsabilitat,NA|AS|AN|AE,AS,AN',
      'CAT,Catala,G|P|F|M,,',
      'CAT01,Comprensio lectora,G|P|F|M,F,M',
      'CAT02,Expressio escrita,G|P|F|M,G,P',
    ].join('\n');

    const result = parseCSV(csv);
    assert.notEqual(result, null);
    assert.equal(result.studentNames.length, 2);
    assert.equal(result.studentNames[0], 'Annassiri, Ibrahim');
    assert.equal(result.studentIds[0], '14180367451');
    assert.equal(result.items.length, 6);

    // Verify specific values
    const dm01 = result.items.find((i) => i.code === 'DM01');
    assert.equal(dm01.values[0], 'AN');
    assert.equal(dm01.values[1], 'AE');

    const cat02 = result.items.find((i) => i.code === 'CAT02');
    assert.equal(cat02.values[0], 'G');
    assert.equal(cat02.values[1], 'P');
  });
});

describe('buildSheetData', () => {
  const testItems = [
    {
      code: 'MAT',
      name: 'Matematiques',
      type: 'subject',
      options: [{ value: 'NA' }, { value: 'AS' }, { value: 'AN' }, { value: 'AE' }],
    },
    {
      code: 'MAT01',
      name: 'Algebra',
      type: 'item',
      options: [{ value: 'NA' }, { value: 'AS' }, { value: 'AN' }, { value: 'AE' }],
    },
    {
      code: 'CAT',
      name: 'Catala',
      type: 'subject',
      options: [{ value: 'G' }, { value: 'P' }, { value: 'F' }, { value: 'M' }],
    },
  ];

  const testStudents = [
    { nom: 'Garcia, Maria', idRalc: 'RALC001', id: '1' },
    { nom: 'Lopez, Pere', idRalc: 'RALC002', id: '2' },
  ];

  // Simple identity filter for testing
  const simpleFilter = (item) => item.options.map((o) => o.value);

  it("genera capcalera amb noms d'alumnes", () => {
    const data = buildSheetData({
      items: testItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
    });

    assert.deepEqual(data[0], ['Codi', 'Nom', 'Opcions', 'Garcia, Maria', 'Lopez, Pere']);
  });

  it("genera fila d'IDs amb RALC", () => {
    const data = buildSheetData({
      items: testItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
    });

    assert.deepEqual(data[1], ['#ID', '', '', 'RALC001', 'RALC002']);
  });

  it('genera files de dades amb opcions filtrades', () => {
    const data = buildSheetData({
      items: testItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
    });

    // Fila MAT (index 2)
    assert.equal(data[2][0], 'MAT');
    assert.equal(data[2][1], 'Matematiques');
    assert.equal(data[2][2], 'NA|AS|AN|AE');
    // Columnes d'alumnes buides
    assert.equal(data[2][3], '');
    assert.equal(data[2][4], '');
  });

  it("inclou valors actuals per l'alumne actual", () => {
    const data = buildSheetData({
      items: testItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
      currentValues: { MAT: 'AN', MAT01: 'AE', CAT: 'F' },
      currentStudent: { nom: 'Garcia, Maria', idRalc: 'RALC001' },
    });

    // Garcia (RALC001) te valors, Lopez no
    assert.equal(data[2][3], 'AN'); // MAT per Garcia
    assert.equal(data[2][4], ''); // MAT per Lopez
    assert.equal(data[3][3], 'AE'); // MAT01 per Garcia
    assert.equal(data[4][3], 'F'); // CAT per Garcia
  });

  it('funciona amb un sol alumne actual (sense llista)', () => {
    const data = buildSheetData({
      items: testItems,
      students: [],
      getFilteredOptions: simpleFilter,
      currentValues: { MAT: 'AS' },
      currentStudent: { nom: 'Alumne Prova', idRalc: 'RALC999' },
    });

    assert.deepEqual(data[0], ['Codi', 'Nom', 'Opcions', 'Alumne Prova']);
    assert.deepEqual(data[1], ['#ID', '', '', 'RALC999']);
    assert.equal(data[2][3], 'AS'); // MAT value
  });

  it('genera el nombre correcte de files', () => {
    const data = buildSheetData({
      items: testItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
    });

    // 1 capcalera + 1 IDs + 3 items = 5 files
    assert.equal(data.length, 5);
  });

  it('totes les files tenen el mateix nombre de columnes', () => {
    const data = buildSheetData({
      items: testItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
    });

    const expectedCols = 3 + testStudents.length;
    for (const row of data) {
      assert.equal(
        row.length,
        expectedCols,
        'Fila amb columnes incorrectes: ' + JSON.stringify(row)
      );
    }
  });

  it('les dades generades es poden parsejar com a CSV', () => {
    const data = buildSheetData({
      items: testItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
      currentValues: { MAT01: 'AN' },
      currentStudent: { nom: 'Garcia, Maria', idRalc: 'RALC001' },
    });

    // Convertim a CSV
    const csvContent = data
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

    // Parsejem el CSV generat
    const parsed = parseCSV(csvContent);
    assert.notEqual(parsed, null);
    assert.equal(parsed.studentNames.length, 2);
    assert.equal(parsed.studentNames[0], 'Garcia, Maria');
    assert.equal(parsed.items.length, 3);

    // Verifiquem el valor omplert
    const mat01 = parsed.items.find((i) => i.code === 'MAT01');
    assert.equal(mat01.values[0], 'AN');
    assert.equal(mat01.values[1], '');
  });
});

describe('getSelectedItems', () => {
  const allItems = [
    { code: 'MAT', name: 'Matematiques', type: 'subject', options: [] },
    { code: 'MAT01', name: 'Algebra', type: 'item', options: [] },
    { code: 'MAT02', name: 'Geometria', type: 'item', options: [] },
    { code: 'ANG', name: 'Angles', type: 'subject', options: [] },
    { code: 'ANG01', name: 'Reading', type: 'item', options: [] },
    { code: 'MUS', name: 'Musica', type: 'subject', options: [] },
    { code: 'MUS01', name: 'Ritme', type: 'item', options: [] },
    { code: 'CAT', name: 'Catala', type: 'subject', options: [] },
    { code: 'CAT01', name: 'Lectura', type: 'item', options: [] },
  ];

  it('retorna tots els items si tots estan seleccionats', () => {
    const selected = { MAT: true, ANG: true, MUS: true, CAT: true };
    const result = getSelectedItems(allItems, selected);
    assert.equal(result.length, allItems.length);
  });

  it('exclou una materia i els seus fills', () => {
    const selected = { MAT: true, ANG: false, MUS: true, CAT: true };
    const result = getSelectedItems(allItems, selected);
    assert.equal(result.length, 7); // 9 - 2 (ANG + ANG01)
    assert.ok(!result.find((i) => i.code === 'ANG'));
    assert.ok(!result.find((i) => i.code === 'ANG01'));
  });

  it('exclou multiples materies', () => {
    const selected = { MAT: true, ANG: false, MUS: false, CAT: true };
    const result = getSelectedItems(allItems, selected);
    assert.equal(result.length, 5); // MAT(3) + CAT(2)
    const codes = result.map((i) => i.code);
    assert.deepEqual(codes, ['MAT', 'MAT01', 'MAT02', 'CAT', 'CAT01']);
  });

  it('tracta undefined com a seleccionat (per defecte)', () => {
    const selected = {}; // Cap definicio = tots seleccionats
    const result = getSelectedItems(allItems, selected);
    assert.equal(result.length, allItems.length);
  });

  it('retorna buit si no hi ha estructura', () => {
    const result = getSelectedItems(null, {});
    assert.deepEqual(result, []);
  });

  it('retorna buit si es desmarquen totes', () => {
    const selected = { MAT: false, ANG: false, MUS: false, CAT: false };
    const result = getSelectedItems(allItems, selected);
    assert.equal(result.length, 0);
  });

  it('nomes inclou una materia seleccionada', () => {
    const selected = { MAT: false, ANG: false, MUS: false, CAT: true };
    const result = getSelectedItems(allItems, selected);
    assert.equal(result.length, 2);
    assert.equal(result[0].code, 'CAT');
    assert.equal(result[1].code, 'CAT01');
  });
});

// =========================================================================
// TESTS AMB ESTRUCTURA DE 3 NIVELLS (subject → item/area → dimension)
// =========================================================================

describe('getSelectedItems amb 3 nivells', () => {
  // Llista plana tal com la retorna getFlatItemList() amb dimensions
  const threeLevel = [
    { code: 'EA', name: 'Educacio Artistica', type: 'subject', options: [] },
    { code: 'EVP', name: 'Educacio Visual i Plastica', type: 'item', options: [{ value: 'NA' }] },
    { code: 'EVP-1', name: 'Valora produccions', type: 'dimension', options: [{ value: 'NA' }] },
    { code: 'EVP-2', name: 'Aplica tecniques', type: 'dimension', options: [{ value: 'AS' }] },
    { code: 'VGEVP', name: 'Qualificacio global EVP', type: 'dimension', options: [{ value: 'AE' }] },
    { code: 'EM', name: 'Educacio Musical', type: 'item', options: [{ value: 'NA' }] },
    { code: 'EM-1', name: 'Canta individualment', type: 'dimension', options: [{ value: 'NA' }] },
    { code: 'EM-2', name: 'Utilitza instruments', type: 'dimension', options: [{ value: 'AS' }] },
    { code: 'MAT', name: 'Matematiques', type: 'subject', options: [] },
    { code: 'MAT01', name: 'Algebra', type: 'item', options: [{ value: 'NA' }] },
  ];

  it('inclou totes les dimensions quan la materia esta seleccionada', () => {
    const selected = { EA: true, MAT: true };
    const result = getSelectedItems(threeLevel, selected);
    assert.equal(result.length, threeLevel.length);
  });

  it('exclou totes les dimensions quan la materia es desmarca', () => {
    const selected = { EA: false, MAT: true };
    const result = getSelectedItems(threeLevel, selected);
    assert.equal(result.length, 2); // MAT + MAT01
    const codes = result.map((i) => i.code);
    assert.deepEqual(codes, ['MAT', 'MAT01']);
  });

  it('les dimensions pertanyen al subject correcte en la llista plana', () => {
    const selected = { EA: true, MAT: false };
    const result = getSelectedItems(threeLevel, selected);
    assert.equal(result.length, 8); // EA + EVP + EVP-1..VGEVP + EM + EM-1..EM-2
    assert.ok(result.find((i) => i.code === 'EVP-1'));
    assert.ok(result.find((i) => i.code === 'EM-2'));
    assert.ok(!result.find((i) => i.code === 'MAT'));
  });
});

describe('buildSheetData amb 3 nivells', () => {
  const threeLevelItems = [
    { code: 'EA', name: 'Educacio Artistica', type: 'subject', options: [{ value: 'NA' }, { value: 'AE' }] },
    { code: 'EVP', name: 'Educacio Visual', type: 'item', options: [{ value: 'NA' }, { value: 'AE' }] },
    { code: 'EVP-1', name: 'Valora produccions', type: 'dimension', options: [{ value: 'NA' }, { value: 'AE' }] },
    { code: 'EVP-2', name: 'Aplica tecniques', type: 'dimension', options: [{ value: 'NA' }, { value: 'AE' }] },
  ];

  const testStudents = [
    { nom: 'Garcia, Maria', idRalc: 'RALC001', id: '1' },
  ];

  const simpleFilter = (item) => item.options.map((o) => o.value);

  it('genera files per subjects, items i dimensions', () => {
    const data = buildSheetData({
      items: threeLevelItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
    });

    // 2 files capcalera + 4 files de dades
    assert.equal(data.length, 6);
    assert.equal(data[2][0], 'EA');       // subject
    assert.equal(data[3][0], 'EVP');      // item (area)
    assert.equal(data[4][0], 'EVP-1');    // dimension
    assert.equal(data[5][0], 'EVP-2');    // dimension
  });

  it('les dimensions tenen les seves opcions correctes', () => {
    const data = buildSheetData({
      items: threeLevelItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
    });

    assert.equal(data[4][2], 'NA|AE');  // opcions de EVP-1
    assert.equal(data[5][2], 'NA|AE');  // opcions de EVP-2
  });

  it('inclou valors actuals per dimensions', () => {
    const data = buildSheetData({
      items: threeLevelItems,
      students: testStudents,
      getFilteredOptions: simpleFilter,
      currentValues: { EA: 'AE', EVP: 'NA', 'EVP-1': 'AE', 'EVP-2': 'NA' },
      currentStudent: { nom: 'Garcia, Maria', idRalc: 'RALC001' },
    });

    assert.equal(data[4][3], 'AE');  // EVP-1 per Garcia
    assert.equal(data[5][3], 'NA');  // EVP-2 per Garcia
  });
});
