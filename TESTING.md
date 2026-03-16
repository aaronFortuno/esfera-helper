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

## TEST 5: Mapeig de qualificadors

- [ ] 5.1 Despres de capturar, apareix la seccio "1b. Qualificadors per materia"
- [ ] 5.2 Cada materia te un selector amb 3 opcions: Assoliment, Valoracio, Totes
- [ ] 5.3 El boto "Totes: Assoliment" canvia tots els selectors a "Assoliment"
- [ ] 5.4 El boto "Totes: Valoracio" canvia tots a "Valoracio"
- [ ] 5.5 Pots canviar individualment una materia (ex: DM a "Valoracio")
- [ ] 5.6 Clicar "Desa la configuracio" mostra "Desat!" temporalment

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

## Resum de resultats

| Test | Resultat | Notes |
|------|----------|-------|
| 1. Connexio | | |
| 2. Llista alumnes | | |
| 3. Deteccio alumne | | |
| 4. Captura estructura | | |
| 5. Mapeig qualificadors | | |
| 6. CSV buit | | |
| 7. CSV amb valors | | |
| 8. Importacio CSV | | |
| 9. Matching alumne | | |
| 10. Navegacio | | |
| 11. Persistencia | | |
