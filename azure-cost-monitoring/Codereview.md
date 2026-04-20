# Code Review: Azure Cost Monitoring

Dieses Review zeigt, dass ich die Architektur, den wichtigsten Codefluss und sinnvolle Tests fuer mein Azure-Cost-Monitoring-Projekt verstehe. Das Ziel des Projekts ist ein monatlicher Kostenbericht fuer ein Azure-Abonnement, damit Kosten frueh sichtbar werden und Management-Entscheidungen auf verstaendlichen Daten basieren.

## 1. Architekturverstaendnis

Die Loesung besteht aus mehreren Azure-Bausteinen, die zusammenarbeiten:

- Azure Cost Management liefert die Kostendaten fuer das Abonnement.
- Eine Azure Function laeuft zeitgesteuert einmal pro Monat.
- Managed Identity authentifiziert die Function sicher gegen Azure, ohne Zugangsdaten im Code zu speichern.
- Azure Communication Services verschickt den Bericht per E-Mail.
- Optional kann eine Logic App strukturierte Reportdaten weiterverarbeiten, zum Beispiel fuer Teams- oder Slack-Benachrichtigungen.

Der wichtigste Architekturpunkt ist die Trennung zwischen Plattform, Berechtigungen und Code. Die Function kann nur funktionieren, wenn die Azure-Ressourcen korrekt verbunden sind: Function App, Managed Identity, Rolle `Kostenverwaltungsleser`, Cost Management API, Communication Services, Email Domain und App Settings.

## 2. Wichtiger Codefluss

Der zentrale Ablauf startet in `src/functions/Time_Trigger.js` ueber einen Timer:

```js
app.timer("Time_Trigger", {
    schedule: "0 0 9 1 * *",
    handler: async (myTimer, context) => {
        ...
    }
});
```

Die Schedule bedeutet: Die Function wird monatlich am 1. Tag um 9:00 Uhr ausgefuehrt.

Der Ablauf im Handler ist fachlich klar aufgebaut:

1. `AZURE_SUBSCRIPTION_ID` aus den App Settings lesen.
2. Managed-Identity-Token fuer `https://management.azure.com/` holen.
3. Cost-Management-Daten ueber die Azure API abrufen.
4. Rohdaten in normale Kostenzeilen umwandeln.
5. Report mit Gesamtkosten, Top Services, Kategorien, Resource Groups, Trend und Severity bauen.
6. Bericht per Azure Communication Services versenden.
7. Optional strukturierte JSON-Daten an eine Logic App senden.

Dieser Ablauf zeigt gut, dass die Function nicht nur eine E-Mail verschickt, sondern vorher fachliche Daten aufbereitet.

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
- Waehrung

Genau hier muessen Daten besonders sauber geprueft werden. Wenn die API-Antwort kaputt oder unvollstaendig ist, darf kein scheinbar erfolgreicher Bericht mit `0 EUR` verschickt werden.

Wichtig ist die Unterscheidung zwischen drei Fehlerarten:

- Schemafehler: Eine Pflichtspalte wie `PreTaxCost` fehlt.
- Datenmengenfehler: Die Antwort enthaelt keine Kostenzeilen.
- Wertefehler: Eine Zeile enthaelt zum Beispiel `not-a-number`, ein leeres Datum oder eine ungueltige Waehrung.

Eine robuste Version sollte Pflichtspalten und Pflichtwerte explizit validieren:

```js
if (costIndex < 0) {
    throw new Error("Pflichtspalte PreTaxCost fehlt.");
}

if (!Number.isFinite(cost)) {
    throw new Error("Ungueltiger PreTaxCost-Wert in der Cost-Management-Antwort.");
}
```

Der Vorteil: Ein fehlerhafter Datenabruf faellt sichtbar im Monitoring auf, statt dem Empfaenger falsche Sicherheit zu geben.

### Kategorien und Management-Sicht

Die Service-Kategorisierung ist fachlich wichtig, weil technische Azure-Service-Namen fuer nicht-technische Empfaenger schwer einzuordnen sind.

Beispiel:

- `Azure Functions` wird zur Kategorie `Server`
- `Storage` wird zur Kategorie `Speicher`
- `Application Insights` wird zur Kategorie `Monitoring`

Damit wird aus reinen Azure-Rohdaten ein Bericht, der auch fuer Management und Geschaeftsfuehrung verstaendlich ist.

### Trend und Severity

`calculateTrend(...)` vergleicht aktuelle und vorherige Woche. Das ist wichtiger als nur eine Gesamtsumme, weil dadurch sichtbar wird, ob Kosten gerade steigen, sinken oder stabil bleiben.

`determineSeverity(...)` bewertet die Gesamtkosten gegen Schwellwerte aus `ALERT_THRESHOLDS`. Dadurch entsteht ein Status wie:

- `normal`
- `hinweis`
- `warnung`
- `kritisch`

Diese Logik ist testbar und fachlich wertvoll, weil sie aus Zahlen eine handlungsorientierte Aussage macht.

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

Dabei duerfen sensible Werte niemals im Code oder in Logs ausgegeben werden. Besonders der Communication-Services-Connection-String enthaelt einen Access Key. Auch Empfaengeradressen, Senderadressen und interne IDs sollten vorsichtig behandelt werden.

Eine sinnvolle Verbesserung ist eine zentrale Startpruefung:

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

Ich wuerde zuerst reine Hilfsfunktionen testen, weil sie keine echte Azure-Verbindung brauchen. Das macht die Tests stabil, schnell und gut nachvollziehbar.

Die besten ersten Testkandidaten sind:

- `normalizeCostRows(...)`
- `categorizeService(...)`
- `calculateTrend(...)`
- `determineSeverity(...)`
- `buildReport(...)`

Nicht als ersten Unit-Test geeignet sind:

- `queryCosts(...)`, weil echte Azure-API-Kommunikation noetig ist.
- `sendWithCommunicationServices(...)`, weil Provider-Kommunikation und HMAC-Signatur beteiligt sind.

Diese Funktionen koennen spaeter ueber Integrations- oder Smoke-Tests abgesichert werden.

### Wichtige Testfaelle

| Bereich | Testfall | Erwartung |
| --- | --- | --- |
| Gueltige API-Antwort | Eine Kostenzeile mit Service, Datum, Kosten und Waehrung | Normalisierte Zeile wird korrekt gebaut |
| Fehlende Pflichtspalte | `PreTaxCost` fehlt | Function wirft einen Fehler |
| Kaputter Kostenwert | `PreTaxCost = "not-a-number"` | Function wirft einen Fehler |
| Leerer Kostenwert | `PreTaxCost = ""` | Function wirft einen Fehler statt `0` zu setzen |
| Ungueltiges Datum | `UsageDate = "2026-04-15"` | Function wirft einen Fehler, weil `YYYYMMDD` erwartet wird |
| Leerer ServiceName | `ServiceName = ""` | Function wirft einen Fehler |
| Leere Resource Group | `ResourceGroupName = ""` | Fallback `Nicht zugeordnet` wird genutzt |
| Ungueltige Waehrung | `Currency = "eur"` | Function wirft einen Fehler |
| Mehrere Waehrungen | EUR und USD im selben Report | `buildReport(...)` bricht ab |

Damit werden drei wichtige Fehlerklassen getestet: Schemafehler, Datenmengenfehler und Wertefehler.

## 6. Beispiel fuer einen sinnvollen Unit-Test

```js
test("normalizeCostRows fails when PreTaxCost column is missing", () => {
    const response = buildCostResponse(
        ["ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
        [["Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
    );

    assert.throws(
        () => normalizeCostRows(response),
        /Pflichtspalte PreTaxCost fehlt/
    );
});
```

Dieser Test ist wichtig, weil ein fehlendes `PreTaxCost` sonst leicht zu einem falschen `0 EUR`-Bericht fuehren koennte. Ein Kostenbericht muss bei kaputten Eingangsdaten abbrechen, statt falsche Zahlen zu versenden.

## 7. Wichtigste Verbesserungen

### 1. Pflichtdaten strenger validieren

Aktuell ist besonders wichtig, dass Pflichtspalten und Werte vor dem Reportbau geprueft werden. Kosten, Datum, Service und Waehrung duerfen nicht stillschweigend durch Fallbacks ersetzt werden.

### 2. Retry fuer Cost Management API

Bei Azure APIs koennen temporaere Fehler auftreten, zum Beispiel `429 Too Many Requests`. Ein Retry mit Backoff wuerde das Projekt robuster und produktionsnaeher machen.

### 3. Tests mit `node:test`

Das Projekt sollte echte Tests enthalten, vor allem fuer reine Logikfunktionen. Dadurch kann ich Aenderungen an Reportlogik, Kategorien und Validierung pruefen, ohne jedes Mal eine echte Azure Function auszufuehren.

### 4. Secrets und App Settings sauber trennen

Secrets gehoeren in Azure App Settings oder Key Vault, nicht ins Repository. `local.settings.json` muss lokal bleiben und darf nicht nach GitHub. Das ist fuer Cloud-Projekte ein wichtiger Sicherheitsstandard.

### 5. Infrastructure as Code als naechster Schritt

Ein sinnvoller naechster Ausbau waere Bicep oder Terraform fuer:

- Function App
- Storage Account
- Managed Identity
- Rollenzuweisung
- App Settings
- Budget und Action Group

Damit waere das Projekt reproduzierbarer und professioneller deploybar.

## 8. Fazit

Das Projekt zeigt praxisnahes Cloud Engineering: Azure-Kosten werden ueber eine API abgefragt, fachlich aufbereitet, bewertet und automatisiert per E-Mail verschickt. Besonders wichtig ist, dass der Code nicht nur technisch laeuft, sondern die richtigen fachlichen Fragen beantwortet:

- Welche Services verursachen Kosten?
- Welche Resource Groups sind betroffen?
- Steigen die Kosten im Vergleich zur Vorwoche?
- Wurde ein Schwellwert erreicht?
- Sind die Eingangsdaten vertrauenswuerdig?

Durch gezielte Validierung, Unit-Tests und saubere Konfiguration kann aus dem Projekt eine robuste, nachvollziehbare und bewerbungstaugliche Cloud-Automatisierung werden.
