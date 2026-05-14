# Code Review: Azure Cost Monitoring

Dieses Review zeigt, dass ich die Architektur, den wichtigsten Codefluss und sinnvolle Tests für mein Azure-Cost-Monitoring-Projekt verstehe. Das Ziel des Projekts ist ein monatlicher Kostenbericht für ein Azure-Abonnement, damit Kosten früh sichtbar werden und Management-Entscheidungen auf verständlichen Daten basieren.

## 1. Architekturverständnis

Die Lösung besteht aus mehreren Azure-Bausteinen, die zusammenarbeiten:

- Azure Cost Management liefert die Kostendaten fuer das Abonnement.
- Eine Azure Function läuft zeitgesteuert einmal pro Monat.
- Managed Identity authentifiziert die Function sicher gegen Azure, ohne Zugangsdaten im Code zu speichern.
- Azure Communication Services verschickt den Bericht per E-Mail.
- Optional kann eine Logic App strukturierte Reportdaten weiterverarbeiten, zum Beispiel für Teams- oder Slack-Benachrichtigungen.

Der wichtigste Architekturpunkt ist die Trennung zwischen Plattform, Berechtigungen und Code. Die Function kann nur funktionieren, wenn die Azure-Ressourcen korrekt verbunden sind: Function App, Managed Identity, Rolle `Kostenverwaltungsleser`, Cost Management API, Communication Services, Email Domain und App Settings.

## 2. Wichtiger Codefluss

Der zentrale Ablauf startet in `src/functions/Time_Trigger.js` über einen Timer:

```js
app.timer("Time_Trigger", {
    schedule: "0 0 9 1 * *",
    handler: async (myTimer, context) => {
        ...
    }
});
```

Die Schedule bedeutet: Die Function wird monatlich am 1. Tag um 9:00 Uhr ausgeführt.

Der Ablauf im Handler ist fachlich klar aufgebaut:

1. `AZURE_SUBSCRIPTION_ID` aus den App Settings lesen.
2. Managed-Identity-Token fuer `https://management.azure.com/` holen.
3. Cost-Management-Daten über die Azure API abrufen.
4. Rohdaten in normale Kostenzeilen umwandeln.
5. Report mit Gesamtkosten, Top Services, Kategorien, Resource Groups, Trend und Severity bauen.
6. Bericht per Azure Communication Services versenden.
7. Optional strukturierte JSON-Daten an eine Logic App senden.

Dieser Ablauf zeigt gut, dass die Function nicht nur eine E-Mail verschickt, sondern vorher fachliche Daten aufbereitet.

Ein wichtiger Punkt aus dem späteren Praxistest in Azure war, dass der Ablauf nicht nur lokal nachvollziehbar ist, sondern tatsächlich mit echten Cost-Management-Daten, echter Managed Identity und echtem ACS-Mailversand erfolgreich ausgeführt wurde. Genau dadurch gewinnt das Projekt deutlich an Glaubwürdigkeit.

## 3. Review der wichtigsten Funktionen

### Cost Management API

Die Funktion `queryCosts(...)` ruft die Azure Cost Management Query API auf:

```js
https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query
```

Der Report nutzt `MonthToDate`, also den Zeitraum vom Monatsanfang bis zum aktuellen Tag. Gruppiert wird nach:

- `ServiceName`
- `ResourceGroupName`

Das ist sinnvoll, weil der Bericht dadurch sowohl technische Kostentreiber als auch betroffene Resource Groups zeigt.

### Normalisierung der API-Antwort

Die Funktion `normalizeCostRows(...)` ist ein zentraler Punkt im Projekt. Sie macht aus der Cost-Management-Antwort interne Objekte mit:

- Service
- Kategorie
- Resource Group
- Kostenwert
- Nutzungsdatum
- Währung

Genau hier müssen Daten besonders sauber geprueft werden. Wenn die API-Antwort kaputt oder unvollständig ist, darf kein scheinbar erfolgreicher Bericht mit `0 EUR` verschickt werden.

Wichtig ist die Unterscheidung zwischen drei Fehlerarten:

- Schemafehler: Eine Pflichtspalte wie `PreTaxCost` fehlt.
- Datenmengenfehler: Die Antwort enthaelt keine Kostenzeilen.
- Wertefehler: Eine Zeile enthaelt zum Beispiel `not-a-number`, ein leeres Datum oder eine ungueltige Währung.

Eine robuste Version sollte Pflichtspalten und Pflichtwerte explizit validieren:

```js
if (costIndex < 0) {
    throw new Error("Schemafehler: Pflichtspalte PreTaxCost fehlt.");
}

if (!Number.isFinite(cost)) {
    throw new Error("Wertefehler: Ungueltiger PreTaxCost-Wert in der Cost-Management-Antwort.");
}
```

Der Vorteil: Ein fehlerhafter Datenabruf fällt sichtbar im Monitoring auf, statt dem Empfänger falsche Sicherheit zu geben.

Zusätzlich wurde die Fehlersicht im Projekt später verbessert, indem diese Fehlerklassen direkt in die Fehlermeldungen aufgenommen wurden. Das ist für Support und Betrieb hilfreich, weil der Fehler nicht nur technisch vorhanden ist, sondern sofort in die richtige Suchrichtung eingeordnet werden kann.

### Kategorien und Management-Sicht

Die Service-Kategorisierung ist fachlich wichtig, weil technische Azure-Service-Namen für nicht-technische Empfaenger schwer einzuordnen sind.

Beispiel:

- `Azure Functions` wird zur Kategorie `Server`
- `Storage` wird zur Kategorie `Speicher`
- `Application Insights` wird zur Kategorie `Monitoring`

Damit wird aus reinen Azure-Rohdaten ein Bericht, der auch für Management und Geschäftsführung verstaendlich ist.

### Trend und Severity

`calculateTrend(...)` vergleicht aktuelle und vorherige Woche. Das ist wichtiger als nur eine Gesamtsumme, weil dadurch sichtbar wird, ob Kosten gerade steigen, sinken oder stabil bleiben.

`determineSeverity(...)` bewertet die Gesamtkosten gegen Schwellwerte aus `ALERT_THRESHOLDS`. Dadurch entsteht ein Status wie:

- `normal`
- `hinweis`
- `warnung`
- `kritisch`

Diese Logik ist testbar und fachlich wertvoll, weil sie aus Zahlen eine handlungsorientierte Aussage macht.

Ein weiterer praktischer Feinschliff war die Filterung von Einträgen, die im Bericht nur als `0,00 EUR` erscheinen würden. Gerade bei kleinen Azure-Umgebungen wirkt der Report dadurch deutlich fokussierter und näher an den wirklich relevanten Kosten.

### Mailversand und Fehlertransparenz

Ein zentraler Lernpunkt im Projekt war, dass der Mailversand nicht nur "funktioniert oder funktioniert nicht", sondern aus mehreren technisch unterschiedlichen Stationen besteht:

- Connection String parsen
- Send-Request an Azure Communication Services
- `operation-location` lesen
- Polling des Versandstatus
- finalen Provider-Status auswerten

Für das Projekt war es sinnvoll, genau diese Stationen in kleine testbare Teile zu zerlegen. Dadurch wurde aus einem schwer greifbaren externen Ablauf ein nachvollziehbarer und besser debugbarer Prozess.

## 4. Sicherheits- und Betriebsaspekte

Die Architektur nutzt Managed Identity fuer Azure Cost Management. Das ist sicherer als Secrets im Code, weil die Function ueber ihre eigene Identitaet berechtigt wird.

Wichtige App Settings sind unter anderem:

- `AZURE_SUBSCRIPTION_ID`
- `REPORT_RECIPIENTS`
- `ALERT_THRESHOLDS`
- `COMMUNICATION_SERVICES_CONNECTION_STRING`
- `ACS_EMAIL_FROM`
- `IDENTITY_ENDPOINT`
- `IDENTITY_HEADER`

Dabei dürfen sensible Werte niemals im Code oder in Logs ausgegeben werden. Besonders der Communication-Services-Connection-String enthält einen Access Key. Auch Empfängeradressen, Senderadressen und interne IDs sollten vorsichtig behandelt werden.

Eine sinnvolle Verbesserung ist eine zentrale Startprüfung:

```js
function validateStartupConfig() {
    const requiredEnvVars = [
        "AZURE_SUBSCRIPTION_ID",
        "REPORT_RECIPIENTS",
        "COMMUNICATION_SERVICES_CONNECTION_STRING",
        "ACS_EMAIL_FROM",
        "IDENTITY_ENDPOINT",
        "IDENTITY_HEADER"
    ];

    const missing = requiredEnvVars.filter((name) => !process.env[name]);

    if (missing.length) {
        throw new Error(`Pflicht-Umgebungsvariablen fehlen: ${missing.join(", ")}.`);
    }
}
```

Dadurch scheitert die Function bei falscher Konfiguration direkt am Anfang. Das spart Laufzeit und macht Fehler leichter auffindbar.

## 5. Teststrategie

Ich würde zuerst reine Hilfsfunktionen testen, weil sie keine echte Azure-Verbindung brauchen. Das macht die Tests stabil, schnell und gut nachvollziehbar.

Die besten ersten Testkandidaten sind:

- `normalizeCostRows(...)`
- `categorizeService(...)`
- `calculateTrend(...)`
- `determineSeverity(...)`
- `buildReport(...)`

Nicht als ersten Unit-Test geeignet sind:

- `queryCosts(...)`, weil echte Azure-API-Kommunikation nötig ist.
- `sendWithCommunicationServices(...)`, weil Provider-Kommunikation und HMAC-Signatur beteiligt sind.

Diese Funktionen können später über Integrations- oder Smoke-Tests abgesichert werden.

Statt den kompletten Mailversand direkt zu testen, ist es sinnvoller, kleine lokale Hilfsfunktionen daraus zu extrahieren und separat zu prüfen. In diesem Projekt wurden dafür unter anderem diese Teile isoliert:

- `parseCommunicationConnectionString(...)`
- `getOperationLocationOrThrow(...)`
- `evaluateAcsPollingStatus(...)`
- `getRetryAfterSeconds(...)`

Der Vorteil ist, dass die einzelnen Stationen des Mailversands ohne echte Provider-Kommunikation nachvollziehbar und stabil testbar werden.

### Wichtige Testfälle

| Bereich | Testfall | Erwartung |
| --- | --- | --- |
| Gültige API-Antwort | Eine Kostenzeile mit Service, Datum, Kosten und Währung | Normalisierte Zeile wird korrekt gebaut |
| Fehlende Pflichtspalte | `PreTaxCost` fehlt | Function wirft einen Fehler |
| Kaputter Kostenwert | `PreTaxCost = "not-a-number"` | Function wirft einen Fehler |
| Leerer Kostenwert | `PreTaxCost = ""` | Function wirft einen Fehler statt `0` zu setzen |
| Ungültiges Datum | `UsageDate = "2026-04-15"` | Function wirft einen Fehler, weil `YYYYMMDD` erwartet wird |
| Leerer ServiceName | `ServiceName = ""` | Function wirft einen Fehler |
| Leere Resource Group | `ResourceGroupName = ""` | Fallback `Nicht zugeordnet` wird genutzt |
| Ungültige Währung | `Currency = "eur"` | Function wirft einen Fehler |
| Mehrere Währungen | EUR und USD im selben Report | `buildReport(...)` bricht ab |
| Fehlende Operation-Location | ACS-Antwort ohne `operation-location` | Hilfsfunktion wirft einen Fehler |
| Polling erfolgreich | ACS-Status `Succeeded` | Polling-Hilfsfunktion liefert `done = true` |
| Polling fehlgeschlagen | ACS-Status `Failed` | Polling-Hilfsfunktion wirft einen Fehler |
| Retry-After fehlt | kein `retry-after` Header | Default-Wert `5` wird genutzt |
| ACS Connection String gültig | `endpoint=...;accesskey=...` | beide Werte werden korrekt gelesen |

Damit werden drei wichtige Fehlerklassen getestet: Schemafehler, Datenmengenfehler und Wertefehler.

Zusätzlich werden damit erste produktionsnahe Teilprobleme des Mailversands abgedeckt, ohne direkt echte externe ACS-Kommunikation im Unit-Test zu erzwingen.

## 6. Beispiel für einen sinnvollen Unit-Test

```js
test("normalizeCostRows fails when PreTaxCost column is missing", () => {
    const response = buildCostResponse(
        ["ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
        [["Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
    );

    assert.throws(
        () => normalizeCostRows(response),
        /Schemafehler: Pflichtspalte PreTaxCost fehlt/
    );
});
```

Dieser Test ist wichtig, weil ein fehlendes `PreTaxCost` sonst leicht zu einem falschen `0 EUR`-Bericht führen könnte. Ein Kostenbericht muss bei kaputten Eingangsdaten abbrechen, statt falsche Zahlen zu versenden.

## 7. Wichtigste Verbesserungen

### 1. Pflichtdaten strenger validieren

Aktuell ist besonders wichtig, dass Pflichtspalten und Werte vor dem Reportbau geprüft werden. Kosten, Datum, Service und Waehrung dürfen nicht stillschweigend durch Fallbacks ersetzt werden.

### 2. Retry für Cost Management API

Bei Azure APIs können temporäre Fehler auftreten, zum Beispiel `429 Too Many Requests`. Ein Retry mit Backoff würde das Projekt robuster und produktionsnaeher machen.

### 3. Tests mit `node:test`

Das Projekt sollte echte Tests enthalten, vor allem für reine Logikfunktionen. Dadurch kann ich Änderungen an Reportlogik, Kategorien und Validierung prüfen, ohne jedes Mal eine echte Azure Function auszuführen.

Inzwischen ist dieser Punkt bereits gut umgesetzt: die wichtigsten lokalen Logikbausteine des Reports und des ACS-Mailablaufs sind mit `node:test` abgesichert. Der nächste sinnvolle Ausbau wäre hier nicht mehr Quantität, sondern eher gezielte Ergänzungen nur dann, wenn neue echte Projektanforderungen dazukommen.

### 4. Secrets und App Settings sauber trennen

Secrets gehören in Azure App Settings oder Key Vault, nicht ins Repository. `local.settings.json` muss lokal bleiben und darf nicht nach GitHub. Das ist für Cloud-Projekte ein wichtiger Sicherheitsstandard.

### 5. Infrastructure as Code als nächster Schritt

Ein sinnvoller nächster Ausbau wäre Bicep oder Terraform für:

- Function App
- Storage Account
- Managed Identity
- Rollenzuweisung
- App Settings
- Budget und Action Group

Damit wäre das Projekt reproduzierbarer und professioneller deploybar.

## 8. Fazit

Das Projekt zeigt praxisnahes Cloud Engineering: Azure-Kosten werden über eine API abgefragt, fachlich aufbereitet, bewertet und automatisiert per E-Mail verschickt. Besonders wichtig ist, dass der Code nicht nur technisch läuft, sondern die richtigen fachlichen Fragen beantwortet:

- Welche Services verursachen Kosten?
- Welche Resource Groups sind betroffen?
- Steigen die Kosten im Vergleich zur Vorwoche?
- Wurde ein Schwellwert erreicht?
- Sind die Eingangsdaten vertrauenswürdig?

Durch gezielte Validierung, Unit-Tests, klarere Fehlerklassen, bessere Logging-Kontexte und den erfolgreichen Live-Lauf in Azure ist aus dem Projekt inzwischen eine robuste, nachvollziehbare und bewerbungstaugliche Cloud-Automatisierung geworden.
