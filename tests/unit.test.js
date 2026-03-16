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
      values: values
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
    values: null
  }
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
    assert.equal(
      normalizeString('Annassiri, Ibrahim'),
      normalizeString('annassiri, ibrahim')
    );
    assert.equal(
      normalizeString('García López, María José'),
      normalizeString('garcia lopez, maria jose')
    );
  });

  it('gestiona caracters especials', () => {
    assert.equal(normalizeString('L\'Hospitalet'), "l'hospitalet");
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
    'CAT,Catala,NA|AS|AN|AE,AS,'
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

  it('retorna null per CSV sense columnes d\'alumnes', () => {
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
      'MAT,Matematiques,NA|AS|AN|AE,AN'
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
      'MAT,Mat,NA|AS,AN'
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
      'MAT,"Matematiques, bla",NA|AS,AN'
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
    assert.equal(escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
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
    assert.equal(escapeHtml("l'escola"), "l&#039;escola");
  });
});

describe('getFilteredOptions', () => {
  const allItems = [
    {
      code: 'MAT', name: 'Matematiques', type: 'subject',
      options: [
        { value: 'NA' }, { value: 'AS' }, { value: 'AN' }, { value: 'AE' },
        { value: 'G' }, { value: 'P' }, { value: 'F' }, { value: 'M' }
      ]
    },
    {
      code: 'MAT01', name: 'Algebra', type: 'item',
      options: [
        { value: 'NA' }, { value: 'AS' }, { value: 'AN' }, { value: 'AE' },
        { value: 'G' }, { value: 'P' }, { value: 'F' }, { value: 'M' }
      ]
    },
    {
      code: 'CAT', name: 'Catala', type: 'subject',
      options: [
        { value: 'NA' }, { value: 'AS' }, { value: 'AN' }, { value: 'AE' },
        { value: 'G' }, { value: 'P' }, { value: 'F' }, { value: 'M' }
      ]
    },
    {
      code: 'CAT01', name: 'Lectura', type: 'item',
      options: [
        { value: 'NA' }, { value: 'AS' }, { value: 'AN' }, { value: 'AE' },
        { value: 'G' }, { value: 'P' }, { value: 'F' }, { value: 'M' }
      ]
    }
  ];

  it('filtra per assoliment (NA/AS/AN/AE)', () => {
    const mapping = { 'MAT': 'assoliment', 'CAT': 'assoliment' };
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE']);
  });

  it('filtra per valoracio (G/P/F/M)', () => {
    const mapping = { 'MAT': 'valoracio', 'CAT': 'valoracio' };
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['G', 'P', 'F', 'M']);
  });

  it('retorna totes les opcions amb "totes"', () => {
    const mapping = { 'MAT': 'totes' };
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE', 'G', 'P', 'F', 'M']);
  });

  it('retorna totes les opcions si no hi ha mapping', () => {
    const mapping = {};
    const result = getFilteredOptions(allItems[1], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE', 'G', 'P', 'F', 'M']);
  });

  it('funciona amb subjects directament', () => {
    const mapping = { 'MAT': 'assoliment' };
    const result = getFilteredOptions(allItems[0], allItems, mapping);
    assert.deepEqual(result, ['NA', 'AS', 'AN', 'AE']);
  });

  it('items hereten el mapping de la seva materia', () => {
    const mapping = { 'MAT': 'assoliment', 'CAT': 'valoracio' };
    const matItem = getFilteredOptions(allItems[1], allItems, mapping);
    const catItem = getFilteredOptions(allItems[3], allItems, mapping);
    assert.deepEqual(matItem, ['NA', 'AS', 'AN', 'AE']);
    assert.deepEqual(catItem, ['G', 'P', 'F', 'M']);
  });

  it('nomes retorna opcions que existeixen al original', () => {
    const itemWithFewOptions = {
      code: 'MAT02', name: 'Geometria', type: 'item',
      options: [{ value: 'NA' }, { value: 'AE' }]
    };
    const items = [allItems[0], itemWithFewOptions];
    const mapping = { 'MAT': 'assoliment' };
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
      'CAT02,Expressio escrita,G|P|F|M,G,P'
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
