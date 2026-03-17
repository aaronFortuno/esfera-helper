# Esfer@ Helper — Guia de publicacio

## 1. Passos per publicar a la Chrome Web Store

1. **Crear compte de desenvolupador** a [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) (quota unica de 5 USD)
2. **Preparar el ZIP** de la carpeta `extension/` (els fitxers han d'estar a l'arrel del ZIP, no dins subcarpeta)
3. **Pujar l'extensio** al Dashboard: "Add new item" → seleccionar ZIP → Upload
4. **Omplir els camps** amb els textos de la seccio 2
5. **Verificar** que la politica de privacitat a GitHub Pages esta activa: https://aaronfortuno.github.io/esfera-helper/
6. **Enviar a revisio** ("Submit for Review") — pot trigar d'unes hores a uns dies
7. Un cop aprovada, es publica automaticament

### Materials necessaris

- [x] Icona 128x128: `extension/icons/icon128.png`
- [x] 2-3 captures de pantalla (1280x800 o 640x400):
  - Side panel amb exportacio
  - Google Sheets generat
  - Formulari d'Esfer@ omplert automaticament

### Configuracio OAuth (Google Cloud Console)

El client OAuth esta configurat com a **Intern** al domini `@xtec.cat` (Google Workspace del Departament d'Educacio). Aixo significa:

- Tots els docents amb compte `@xtec.cat` poden autenticar-se directament
- No cal fase de proves (Testing) ni publicacio (Publish App)
- No apareix l'avis de "Google hasn't verified this app"
- No cal verificacio de Google

**Configuracio a Google Cloud Console** (APIs & Services → OAuth consent screen):

- **Branding**: App name = "Esfer@ Helper", correus de suport configurats
- **Audience**: Intern (domini `@xtec.cat`)
- **Data Access**: Scopes `spreadsheets` i `drive.file`

**Nota**: Usuaris amb comptes personals de Google (Gmail) no podran autenticar-se amb Google Sheets. Com que tots els docents treballen amb `@xtec.cat`, aixo no es un problema.

---

## 2. Textos per als camps de la Chrome Web Store

### Name

Esfer@ Helper

### Summary (max. 132 caracters)

Agilitza les qualificacions a Esfer@: exporta a CSV o Google Sheets, omple les notes i importa-les automaticament.

### Description

Esfer@ Helper permet als docents de Catalunya estalviar hores en la introduccio de qualificacions competencials a l'aplicacio Esfer@ del Departament d'Educacio.

EL PROBLEMA
Cada alumne te entre 50 i 70 desplegables de competencies que s'han d'omplir un a un. No hi ha cap manera d'importar dades massivament ni de treballar des d'un full de calcul.

LA SOLUCIO
Esfer@ Helper captura l'estructura de competencies i materies directament del formulari d'Esfer@ i la converteix en una graella que pots editar comodament.

FUNCIONALITATS

- Exportacio a CSV o Google Sheets amb un sol clic
- Google Sheets amb format automatic: colors, columnes fixades i desplegables de validacio
- Importacio de notes: omple tots els desplegables del formulari automaticament
- Filtre per ambits: treballa nomes les teves materies sense tocar les dels especialistes
- Boto "Omple i Seguent" per avancar alumne a alumne rapidament
- CSV persistent entre alumnes: no cal reimportar cada vegada

PRIVACITAT

- Totes les dades es processen localment al teu navegador
- Zero analytics, zero telemetria, zero servidors externs
- L'unica connexio de xarxa es a Google Sheets, i nomes quan tu ho demanes
- Boto d'esborrat total de dades (RGPD Art. 17)
- Codi font 100% obert i auditable

COMPATIBILITAT

- Chrome i Microsoft Edge
- Provat amb qualificacions de primaria (tutors i especialistes)
- Ambits d'assoliment (NA/AS/AN/AE) i valoracio (G/P/F/M)

Codi font: https://github.com/aaronfortuno/esfera-helper
Politica de privacitat: https://aaronfortuno.github.io/esfera-helper/

### Category

Education

### Language

Catalan

### Privacy Policy URL

https://aaronfortuno.github.io/esfera-helper/

---

## 3. Justificacio de permisos (pestanya Privacy)

### Single Purpose

Agilitzar la introduccio de qualificacions a Esfer@ permetent exportar/importar notes via CSV o Google Sheets.

### Permisos

| Permis                                          | Justificacio                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `activeTab`                                     | Accedir al contingut de la pestanya activa d'Esfer@ per llegir i escriure les qualificacions al formulari.         |
| `sidePanel`                                     | Mostrar el panell lateral amb la interficie de l'extensio.                                                         |
| `storage`                                       | Guardar localment la configuracio, l'estructura capturada i el CSV entre sessions.                                 |
| `identity`                                      | Autenticar l'usuari amb Google per a l'exportacio/importacio de Google Sheets (nomes quan l'usuari ho sol·licita). |
| Host: `bfgh.aplicacions.ensenyament.gencat.cat` | Injectar el content script unicament a les pagines d'avaluacio d'Esfer@.                                           |
