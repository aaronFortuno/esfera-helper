# Esfer@ Helper

Extensio de Chrome/Edge per agilitzar la introduccio de qualificacions a l'aplicacio Esfer@ del Departament d'Educacio de Catalunya.

## El problema

Els ~90.000 docents de Catalunya han d'introduir manualment les qualificacions competencials alumne per alumne al formulari d'Esfer@. Cada alumne te entre 50-70 camps (selects) que s'han d'omplir un a un. No existeix cap forma d'importar dades massivament ni de treballar per materia.

## La solucio

Esfer@ Helper es una extensio de navegador que:

1. **Captura l'estructura** d'items i materies directament del formulari d'Esfer@
2. **Genera una graella** (CSV / futur Google Sheets) amb files = items i columnes = alumnes
3. **Importa les dades** del CSV omplert i omple automaticament els selects del formulari

### Flux de treball

```
[Esfer@: formulari alumne] --captura--> [CSV amb estructura]
                                              |
                                    [Professor omple al Sheets]
                                              |
[Esfer@: formulari alumne] <--importa-- [CSV amb dades]
```

## Estat actual (v0.3.0 - Fase 2)

### Funcional
- Deteccio automatica de pantalla (llista alumnes vs formulari)
- Captura de la llista d'alumnes (nom, RALC, ID intern)
- Captura de l'estructura completa d'items (170 items verificats)
- Deteccio de l'alumne actual via breadcrumb (RALC + nom)
- Mapeig de qualificadors per materia (NA/AS/AN/AE vs G/P/F/M)
- Generacio de CSV buit o amb valors actuals
- Importacio de CSV amb matching automatic d'alumne per RALC o nom
- Omplir selects del formulari via manipulacio d'AngularJS scope

### Nou a v0.3.0
- Compliance RGPD: politica de privacitat, esborrat total de dades, informacio a l'usuari
- Boto "Esborra totes les dades" al panell (dret de supressio RGPD Art. 17)
- Enllac a la politica de privacitat des del panell
- Preparacio per distribucio al Chrome Web Store

### Nou a v0.2.0
- CSV persistent entre navegacions d'alumnes (no cal recarregar per cada alumne)
- Boto "Omple i Seguent" per flux rapid alumne a alumne
- Millores de robustesa al scraper (waitForElement per carregues lentes)
- Validacio millorada del CSV importat
- Selectors DOM mes resilients

### Pendent de verificacio
- Omplir selects realment funciona amb AngularJS (necessita test a Esfer@ real)
- Matching d'alumne per breadcrumb (format nou parsejat pero no verificat)

### Pendent d'implementar
- Integracio directa amb Google Sheets API (OAuth)
- Suport per avaluacions finals
- Millores d'UX (indicadors, errors, confirmacions)

## Instalacio (mode desenvolupador)

1. Obre Chrome o Edge
2. Navega a `chrome://extensions/` (o `edge://extensions/`)
3. Activa **"Mode de desenvolupador"** (interruptor superior dret)
4. Clica **"Carrega descomprimida"** (Load unpacked)
5. Selecciona la carpeta `extension/`
6. L'extensio apareixera amb una icona verda

## Estructura del projecte

```
esfera-helper/
├── extension/                    # Extensio de Chrome (Manifest V3)
│   ├── manifest.json             # Configuracio de l'extensio
│   ├── background/
│   │   └── service-worker.js     # Gestio del side panel i events
│   ├── content-scripts/
│   │   └── scraper.js            # S'injecta a Esfer@, llegeix/escriu DOM
│   ├── sidepanel/
│   │   ├── sidepanel.html        # UI del panell lateral
│   │   └── sidepanel.js          # Logica del panell (CSV, comunicacio)
│   ├── styles/
│   │   └── sidepanel.css         # Estils del panell
│   └── icons/                    # Icones de l'extensio
├── docs/
│   └── privacy-policy.html       # Politica de privacitat (GitHub Pages)
├── tests/
│   └── unit.test.js              # Tests unitaris (node --test)
├── exemple.html                  # HTML capturat del formulari d'Esfer@
├── exemple-alumnes.html          # HTML capturat de la llista d'alumnes
├── TESTING.md                    # Guia de tests manuals
├── LICENSE                       # Llicencia MIT
└── README.md
```

## Tecnologies

- **Chrome Extension Manifest V3**
- **AngularJS** (manipulacio del scope per escriure als selects d'Esfer@)
- **Chrome Side Panel API** (panell lateral persistent)
- **Chrome Storage API** (persistencia de configuracio)

## Arquitectura

### Content Script (`scraper.js`)
S'injecta a totes les pagines d'avaluacio d'Esfer@. Exposa funcions via `chrome.runtime.onMessage`:
- `detect-screen` - Identifica si estem a llista d'alumnes o formulari
- `scrape-students` - Captura la llista d'alumnes del DOM
- `scrape-structure` / `scrape-flat-items` - Captura items i materies
- `detect-current-student` - Llegeix breadcrumb per identificar l'alumne
- `read-current-values` - Llegeix valors actuals dels selects
- `fill-values` - Escriu valors als selects notificant AngularJS

### Side Panel (`sidepanel.js`)
Interficie del professor. Gestiona el flux:
1. Capturar estructura -> 1b. Configurar qualificadors -> 2. Exportar CSV -> 3. Importar CSV -> Omplir

### Service Worker (`service-worker.js`)
Coordina l'obertura del side panel i notifica canvis de pestanya.

## Roadmap

| Fase | Descripcio | Estat |
|------|-----------|-------|
| 1a | Scraper + CSV buit | Completat |
| 1b | Mapeig qualificadors + deteccio alumne | Completat |
| 2 | Importacio CSV -> omplir formulari | Completat, pendent verificacio real |
| 3 | Google Sheets API (OAuth + crear/llegir Sheet) | Pendent |
| 4 | UX polish, flux rapid, documentacio | Parcial (v0.2.0) |
| 5 | Distribucio (Chrome Web Store?) | Preparat (v0.3.0) |

## Privacitat i RGPD

Esfer@ Helper **NO envia cap dada a servidors externs**. Totes les dades es processen i emmagatzemen exclusivament al navegador local de l'usuari (`chrome.storage.local`).

- Zero conexions de xarxa propies
- Zero analytics o telemetria
- Zero dependancies externes de runtime
- Codi font 100% obert i auditable

L'extensio inclou un boto "Esborra totes les dades" per exercir el dret de supressio (RGPD Art. 17).

Politica de privacitat completa: [privacitat](https://aaronfortuno.github.io/esfera-helper/privacy-policy.html)

## Llicencia

Distribuit sota la [llicencia MIT](LICENSE).
