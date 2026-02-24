-- Finance OS German Default Categories
-- 10 L1 groups with L2 subcategories

-- ─── 1. Wohnen ──────────────────────────────────────────────────────────────

LET $wohnen = CREATE category:wohnen SET name = 'Wohnen', sort_order = 1, created_at = time::now();
CREATE category:miete SET name = 'Miete', parent = category:wohnen, sort_order = 1, created_at = time::now();
CREATE category:nebenkosten SET name = 'Nebenkosten', parent = category:wohnen, sort_order = 2, created_at = time::now();
CREATE category:strom SET name = 'Strom', parent = category:wohnen, sort_order = 3, created_at = time::now();
CREATE category:internet SET name = 'Internet', parent = category:wohnen, sort_order = 4, created_at = time::now();
CREATE category:einrichtung SET name = 'Einrichtung', parent = category:wohnen, sort_order = 5, created_at = time::now();

-- ─── 2. Mobilität ───────────────────────────────────────────────────────────

LET $mobilitaet = CREATE category:mobilitaet SET name = 'Mobilität', sort_order = 2, created_at = time::now();
CREATE category:oepnv SET name = 'ÖPNV', parent = category:mobilitaet, sort_order = 1, created_at = time::now();
CREATE category:auto_tanken SET name = 'Auto/Tanken', parent = category:mobilitaet, sort_order = 2, created_at = time::now();
CREATE category:kfz_versicherung SET name = 'KFZ-Versicherung', parent = category:mobilitaet, sort_order = 3, created_at = time::now();
CREATE category:fahrrad SET name = 'Fahrrad', parent = category:mobilitaet, sort_order = 4, created_at = time::now();
CREATE category:taxi_carsharing SET name = 'Taxi/Carsharing', parent = category:mobilitaet, sort_order = 5, created_at = time::now();

-- ─── 3. Lebensmittel ────────────────────────────────────────────────────────

LET $lebensmittel = CREATE category:lebensmittel SET name = 'Lebensmittel', sort_order = 3, created_at = time::now();
CREATE category:supermarkt SET name = 'Supermarkt', parent = category:lebensmittel, sort_order = 1, created_at = time::now();
CREATE category:baeckerei SET name = 'Bäckerei', parent = category:lebensmittel, sort_order = 2, created_at = time::now();
CREATE category:metzgerei SET name = 'Metzgerei', parent = category:lebensmittel, sort_order = 3, created_at = time::now();
CREATE category:getraenke SET name = 'Getränke', parent = category:lebensmittel, sort_order = 4, created_at = time::now();
CREATE category:lieferdienst SET name = 'Lieferdienst', parent = category:lebensmittel, sort_order = 5, created_at = time::now();

-- ─── 4. Gesundheit ──────────────────────────────────────────────────────────

LET $gesundheit = CREATE category:gesundheit SET name = 'Gesundheit', sort_order = 4, created_at = time::now();
CREATE category:arzt_apotheke SET name = 'Arzt/Apotheke', parent = category:gesundheit, sort_order = 1, created_at = time::now();
CREATE category:fitnessstudio SET name = 'Fitnessstudio', parent = category:gesundheit, sort_order = 2, created_at = time::now();
CREATE category:sportverein SET name = 'Sportverein', parent = category:gesundheit, sort_order = 3, created_at = time::now();
CREATE category:drogerie SET name = 'Drogerie', parent = category:gesundheit, sort_order = 4, created_at = time::now();

-- ─── 5. Freizeit ────────────────────────────────────────────────────────────

LET $freizeit = CREATE category:freizeit SET name = 'Freizeit', sort_order = 5, created_at = time::now();
CREATE category:restaurant_cafe SET name = 'Restaurant/Café', parent = category:freizeit, sort_order = 1, created_at = time::now();
CREATE category:kino_kultur SET name = 'Kino/Kultur', parent = category:freizeit, sort_order = 2, created_at = time::now();
CREATE category:hobby SET name = 'Hobby', parent = category:freizeit, sort_order = 3, created_at = time::now();
CREATE category:reisen SET name = 'Reisen', parent = category:freizeit, sort_order = 4, created_at = time::now();
CREATE category:streaming SET name = 'Streaming', parent = category:freizeit, sort_order = 5, created_at = time::now();

-- ─── 6. Bildung ─────────────────────────────────────────────────────────────

LET $bildung = CREATE category:bildung SET name = 'Bildung', sort_order = 6, created_at = time::now();
CREATE category:buecher SET name = 'Bücher', parent = category:bildung, sort_order = 1, created_at = time::now();
CREATE category:kurse SET name = 'Kurse', parent = category:bildung, sort_order = 2, created_at = time::now();
CREATE category:software_apps SET name = 'Software/Apps', parent = category:bildung, sort_order = 3, created_at = time::now();
CREATE category:zeitschriften SET name = 'Zeitschriften', parent = category:bildung, sort_order = 4, created_at = time::now();

-- ─── 7. Finanzen ────────────────────────────────────────────────────────────

LET $finanzen = CREATE category:finanzen SET name = 'Finanzen', sort_order = 7, created_at = time::now();
CREATE category:kontofuehrung SET name = 'Kontoführung', parent = category:finanzen, sort_order = 1, created_at = time::now();
CREATE category:gebuehren SET name = 'Gebühren', parent = category:finanzen, sort_order = 2, created_at = time::now();
CREATE category:zinsen SET name = 'Zinsen', parent = category:finanzen, sort_order = 3, created_at = time::now();
CREATE category:investitionen SET name = 'Investitionen', parent = category:finanzen, sort_order = 4, created_at = time::now();
CREATE category:sparen SET name = 'Sparen', parent = category:finanzen, sort_order = 5, created_at = time::now();

-- ─── 8. Einkommen ───────────────────────────────────────────────────────────

LET $einkommen = CREATE category:einkommen SET name = 'Einkommen', sort_order = 8, is_income = true, created_at = time::now();
CREATE category:gehalt SET name = 'Gehalt', parent = category:einkommen, sort_order = 1, is_income = true, created_at = time::now();
CREATE category:nebeneinkuenfte SET name = 'Nebeneinkünfte', parent = category:einkommen, sort_order = 2, is_income = true, created_at = time::now();
CREATE category:kindergeld SET name = 'Kindergeld', parent = category:einkommen, sort_order = 3, is_income = true, created_at = time::now();
CREATE category:steuererstattung SET name = 'Steuererstattung', parent = category:einkommen, sort_order = 4, is_income = true, created_at = time::now();

-- ─── 9. Versicherungen ──────────────────────────────────────────────────────

LET $versicherungen = CREATE category:versicherungen SET name = 'Versicherungen', sort_order = 9, created_at = time::now();
CREATE category:haftpflicht SET name = 'Haftpflicht', parent = category:versicherungen, sort_order = 1, created_at = time::now();
CREATE category:hausrat SET name = 'Hausrat', parent = category:versicherungen, sort_order = 2, created_at = time::now();
CREATE category:krankenversicherung SET name = 'Krankenversicherung', parent = category:versicherungen, sort_order = 3, created_at = time::now();
CREATE category:lebensversicherung SET name = 'Lebensversicherung', parent = category:versicherungen, sort_order = 4, created_at = time::now();
CREATE category:rechtsschutz SET name = 'Rechtsschutz', parent = category:versicherungen, sort_order = 5, created_at = time::now();

-- ─── 10. Kommunikation ──────────────────────────────────────────────────────

LET $kommunikation = CREATE category:kommunikation SET name = 'Kommunikation', sort_order = 10, created_at = time::now();
CREATE category:mobilfunk SET name = 'Mobilfunk', parent = category:kommunikation, sort_order = 1, created_at = time::now();
CREATE category:festnetz SET name = 'Festnetz', parent = category:kommunikation, sort_order = 2, created_at = time::now();
CREATE category:post SET name = 'Post', parent = category:kommunikation, sort_order = 3, created_at = time::now();
