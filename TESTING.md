# Esfer@ Helper - Guia de Tests Manuals

Aquesta guia descriu tots els tests que cal fer per verificar el funcionament de l'extensio.
Marca amb [x] els que passin correctament.

## Prerequisits

1. Extensio instal-lada en mode desenvolupador a Chrome/Edge
2. Acces a Esfer@ amb un grup d'alumnes amb qualificacions per omplir
3. Consola del navegador oberta (F12 > Console) per veure errors

**IMPORTANT**: Despres de cada actualitzacio del codi, cal:

1. Anar a `chrome://extensions/`
2. Clicar la fletxa circular (reload) a l'extensio
3. Recarregar la pagina d'Esfer@ (F5)

---

## TEST 1: Connexio basica

- [ ] 1.1 Obre Esfer@ i navega a "Avaluacions parcials > Qualificacions per grup i alumne/a"
- [ ] 1.2 Clica la icona de l'extensio (cercle verd) a la barra d'eines
- [ ] 1.3 S'obre el panell lateral amb el titol "Esfer@ Helper"
- [ ] 1.4 L'indicador diu "Connectat a Esfer@" (verd)

**Si falla**: Comprova que la URL conte `bfgh.aplicacions.ensenyament.gencat.cat`. Mira la consola per errors.

---

## TEST 2: Deteccio de llista d'alumnes

- [ ] 2.1 Estant a la pantalla de llista d'alumnes, el panell mostra "Llista d'alumnes detectada"
- [ ] 2.2 Mostra el nombre correcte d'alumnes (ex: "14 alumnes detectats")
- [ ] 2.3 La llista mostra els noms en format "Cognoms, Nom"
- [ ] 2.4 Al costat de cada nom apareix el codi RALC (numero llarg)

---

## TEST 3: Deteccio d'alumne al formulari

- [ ] 3.1 Entra al formulari d'un alumne (clica "Modifica")
- [ ] 3.2 El panell canvia a la pantalla de formulari
- [ ] 3.3 Mostra "Alumne actual: [Nom correcte]"
- [ ] 3.4 Mostra "RALC: [numero RALC correcte]" (el que apareix a la taula d'alumnes)
- [ ] 3.5 El nom coincideix amb el que mostra el breadcrumb d'Esfer@

**Si mostra "Desconegut"**: Copia el text complet del breadcrumb i reporta-ho.

---

## TEST 4: Captura d'estructura

- [ ] 4.1 Al formulari d'un alumne, clica "Captura estructura d'items"
- [ ] 4.2 Mostra "X items capturats (Y materies amb els seus subitems)"
- [ ] 4.3 El nombre d'items coincideix amb els que veus al formulari (170 aprox)
- [ ] 4.4 Les materies llistades coincideixen (DM, CAT, LCS6, ANG, MAT, etc.)
- [ ] 4.5 No hi ha errors a la consola

---

## TEST 5: Seleccio de materies i qualificadors

- [ ] 5.1 Despres de capturar, apareix la seccio "1b. Materies i qualificadors"
- [ ] 5.2 Cada materia te un checkbox (marcat per defecte) i un selector de qualificadors
- [ ] 5.3 El boto "Selecciona totes" marca tots els checkboxes
- [ ] 5.4 El boto "Desmarca totes" desmarca tots els checkboxes
- [ ] 5.5 El boto "Qualificadors: Assoliment" canvia tots els selectors a "Assoliment"
- [ ] 5.6 El boto "Qualificadors: Valoracio" canvia tots a "Valoracio"
- [ ] 5.7 Pots canviar individualment una materia (ex: DM a "Valoracio")
- [ ] 5.8 Desmarcar una materia la mostra amb opacitat reduida i desactiva el selector
- [ ] 5.9 Clicar "Desa la configuracio" mostra "Desat!" temporalment
- [ ] 5.10 La seleccio de materies persisteix al tancar i reobrir el panell

---

## TEST 6: Generacio de CSV buit

- [ ] 6.1 Clica "Descarrega CSV buit"
- [ ] 6.2 Es descarrega un fitxer `esfera_graella_YYYY-MM-DD.csv`
- [ ] 6.3 Obre'l amb Google Sheets (Fitxer > Importa > Puja)
- [ ] 6.4 **Fila 1**: "Codi | Nom | Opcions | Alumne1 | Alumne2 | ..."
- [ ] 6.5 **Fila 2**: "#ID | | | RALC1 | RALC2 | ..." (codis RALC dels alumnes)
- [ ] 6.6 **Files 3+**: Cada fila es un item amb codi, nom i opcions
- [ ] 6.7 La columna "Opcions" reflecteix el mapeig configurat:
  - Materies amb "Assoliment": `NA|AS|AN|AE`
  - Materies amb "Valoracio": `G|P|F|M`
  - Materies amb "Totes": `AE|AN|AS|F|G|M|NA|P` (totes les opcions)
- [ ] 6.8 Hi ha una columna per cada alumne de la llista
- [ ] 6.9 Totes les cel-les de dades estan buides
- [ ] 6.10 Si has desmarcat materies al pas 1b, el CSV NO les inclou

---

## TEST 7: Generacio de CSV amb valors actuals

- [ ] 7.1 Obre un alumne que ja tingui algunes qualificacions introduides
- [ ] 7.2 Clica "Descarrega CSV amb valors actuals"
- [ ] 7.3 Al CSV, la columna d'aquell alumne te els valors que tenia al formulari
- [ ] 7.4 La resta de columnes d'alumnes estan buides

---

## TEST 8: Importacio de CSV (el test mes important!)

### Preparacio

1. Descarrega un CSV buit (Test 6)
2. Obre'l a Google Sheets
3. Per a un alumne concret, omple 5-10 camps amb valors valids:
   - Camps d'assoliment: posa `AN`, `AE`, `AS` o `NA`
   - Camps de valoracio (si n'hi ha): posa `F`, `M`, `G` o `P`
4. Descarrega com a CSV (Fitxer > Descarrega > Valors separats per comes)

### Prova

- [ ] 8.1 A Esfer@, obre el formulari de l'alumne que has omplert al CSV
- [ ] 8.2 Al panell, clica "Carrega CSV amb dades"
- [ ] 8.3 Selecciona el CSV descarregat
- [ ] 8.4 El panell mostra "Alumne: [Nom correcte]" i "X valors a importar"
- [ ] 8.5 La llista de preview mostra els codis, noms i valors que has omplert
- [ ] 8.6 Clica "Omple el formulari"
- [ ] 8.7 El panell mostra "X camps omplerts correctament"
- [ ] 8.8 **VERIFICA AL FORMULARI D'ESFER@**: els selects han canviat als valors correctes?
- [ ] 8.9 Si canvies de valor manualment un select i tornes a omplir, es sobreescriu?
- [ ] 8.10 Prem "Desa" a Esfer@ - es desen correctament les qualificacions?

### Possible problema

Si els selects NO canvien visualment pero el panell diu que ha funcionat:

- Pot ser un problema amb la notificacio a AngularJS
- Comprova la consola per errors
- Reporta exactament que veus

---

## TEST 9: Matching d'alumne entre CSV i formulari

- [ ] 9.1 Amb un CSV amb multiples alumnes omplerts, navega a cadascun
- [ ] 9.2 En carregar el CSV, detecta automaticament l'alumne correcte
- [ ] 9.3 El matching funciona per RALC (numero llarg)
- [ ] 9.4 Prova amb un alumne que no existeixi al CSV: hauria de dir "Alumne no trobat"

---

## TEST 10: Navegacio entre alumnes

- [ ] 10.1 Carrega el CSV
- [ ] 10.2 Omple un alumne
- [ ] 10.3 Prem "Seguent" a Esfer@
- [ ] 10.4 El panell detecta el nou alumne
- [ ] 10.5 Pots tornar a carregar el CSV i omple el nou alumne

---

## TEST 11: Persistencia

- [ ] 11.1 Captura l'estructura, configura qualificadors i desa
- [ ] 11.2 Tanca el panell lateral
- [ ] 11.3 Torna a obrir el panell
- [ ] 11.4 L'estructura capturada segueix disponible (no cal recapturar)
- [ ] 11.5 El mapeig de qualificadors s'ha mantingut

---

## TEST 12: Google Sheets - Autenticacio

**Prerequisit**: Cal haver configurat el client_id de Google Cloud Console a `sheets-api.js`.

- [ ] 12.1 Captura l'estructura d'items (Test 4)
- [ ] 12.2 Clica "Obre a Google Sheets"
- [ ] 12.3 S'obre una finestra emergent de Google demanant permisos
- [ ] 12.4 Autoritza l'acces (compte de Google amb Drive)
- [ ] 12.5 La finestra emergent es tanca automaticament

**Si falla**: Comprova que el client_id es correcte i que el redirect URI esta configurat a Google Cloud Console com `https://<extension-id>.chromiumapp.org/`.

---

## TEST 13: Google Sheets - Creacio de full

- [ ] 13.1 Despres d'autoritzar, s'obre un nou Google Sheet en una pestanya
- [ ] 13.2 El titol del Sheet es "Esfer@ Qualificacions DD/MM/YYYY"
- [ ] 13.3 **Fila 1** (capcalera): Codi | Nom | Opcions | Alumne1 | Alumne2 | ... (fons verd, text blanc)
- [ ] 13.4 **Fila 2** (IDs): #ID | | | RALC1 | RALC2 | ... (fons gris, text italic)
- [ ] 13.5 Les materies (subjects) tenen fons verd clar i text en negreta
- [ ] 13.6 Les columnes d'alumnes tenen desplegables (dropdown) amb les opcions correctes
- [ ] 13.7 Les files 1 i 2 estan fixades (frozen) al fer scroll vertical
- [ ] 13.8 Les columnes Codi, Nom, Opcions estan fixades al fer scroll horitzontal
- [ ] 13.9 Si l'alumne actual tenia valors, apareixen a la columna corresponent
- [ ] 13.10 El panell mostra "Full de calcul creat!" amb missatge d'exit

---

## TEST 14: Google Sheets - Importacio directa

1. Crea un Sheet (Test 13)
2. A Google Sheets, omple 5-10 camps per a un alumne usant els desplegables

- [ ] 14.1 Apareix el boto "Importa des de Sheets" al panell
- [ ] 14.2 Clica "Importa des de Sheets"
- [ ] 14.3 El panell mostra "Dades importades des de Sheets!" amb nombre d'alumnes i items
- [ ] 14.4 El banner CSV mostra les dades carregades
- [ ] 14.5 L'auto-matching d'alumne funciona correctament
- [ ] 14.6 Les dades omplertes al Sheet coincideixen amb les del preview
- [ ] 14.7 El boto "Importa des de Sheets" persisteix al tancar i reobrir el panell

---

## TEST 15: Google Sheets - Gestio de sessio

- [ ] 15.1 Despres de crear un Sheet, apareix "Tanca sessio Google" al footer
- [ ] 15.2 Clica "Tanca sessio Google"
- [ ] 15.3 El boto desapareix
- [ ] 15.4 Al tornar a clicar "Obre a Google Sheets", demana autoritzacio de nou
- [ ] 15.5 "Esborra totes les dades" tambe tanca la sessio de Google

---

## TEST 16: Google Sheets - Errors

- [ ] 16.1 Si es cancel-la l'autenticacio, mostra "S'ha cancel·lat l'autenticacio amb Google"
- [ ] 16.2 Si no hi ha estructura capturada, mostra alerta "Primer has de capturar l'estructura"
- [ ] 16.3 Si el client_id no esta configurat, mostra missatge de configuracio pendent

---

## TEST 17: Filtre de materies (proteccio contra sobreescriptura)

**Context**: El tutor veu totes les materies, pero no vol sobreescriure les que han omplert els especialistes (musica, angles, educacio fisica...).

- [ ] 17.1 Desmarca 2-3 materies d'especialitat al pas 1b (ex: MUS, ANG, EF)
- [ ] 17.2 Desa la configuracio
- [ ] 17.3 **CSV**: Descarrega un CSV buit. Comprova que les materies desmarcades NO apareixen
- [ ] 17.4 **Sheets**: Crea un Google Sheet. Comprova que les materies desmarcades NO apareixen
- [ ] 17.5 **Importacio**: Carrega un CSV/Sheet amb dades. El preview mostra "X items exclosos (materies no seleccionades)"
- [ ] 17.6 **Fill**: Omple el formulari. Nomes s'omplen les materies seleccionades, les desmarcades queden intactes
- [ ] 17.7 Verifica a Esfer@ que les qualificacions de les materies desmarcades NO s'han modificat

---

## Resum de resultats

| Test                        | Resultat | Notes |
| --------------------------- | -------- | ----- |
| 1. Connexio                 |          |       |
| 2. Llista alumnes           |          |       |
| 3. Deteccio alumne          |          |       |
| 4. Captura estructura       |          |       |
| 5. Materies i qualificadors |          |       |
| 6. CSV buit                 |          |       |
| 7. CSV amb valors           |          |       |
| 8. Importacio CSV           |          |       |
| 9. Matching alumne          |          |       |
| 10. Navegacio               |          |       |
| 11. Persistencia            |          |       |
| 12. Sheets auth             |          |       |
| 13. Sheets creacio          |          |       |
| 14. Sheets importacio       |          |       |
| 15. Sheets sessio           |          |       |
| 16. Sheets errors           |          |       |
| 17. Filtre materies         |          |       |
