# Azure Cost Monitoring mit Azure Functions

Dieses Projekt dokumentiert meinen Einstieg in die Kostenoptimierung und Automatisierung in Azure. Ziel war es, Azure-Kosten frühzeitig sichtbar zu machen, Grenzwerte zu definieren und monatlich automatisiert einen Kostenbericht per E-Mail zu verschicken.

Dabei habe ich nicht nur mit Azure Cost Management gearbeitet, sondern auch mit Budgets, Arbeitsmappen, Azure Functions, Managed Identities und Azure Communication Services. Ein grosser Teil des Projekts bestand ausserdem aus Troubleshooting, weil viele Probleme nicht direkt im Code lagen, sondern in der Konfiguration und im Zusammenspiel mehrerer Azure-Ressourcen.

## Projektziel

Das Hauptziel des Projekts war es, eine einfache, aber sinnvolle Kostenkontrolle in Azure umzusetzen. Dabei sollten folgende Punkte erreicht werden:

- Budgets und Warnungen in Azure Cost Management definieren
- Kostenentwicklungen schneller sichtbar machen
- eine monatliche automatische E-Mail mit den wichtigsten Kostenwerten verschicken
- technische Azure-Daten in eine Form bringen, die auch fuer nicht-technische Empfaenger verstaendlich ist

## Was in Azure umgesetzt wurde

### 1. Budgets und Benachrichtigungen

In Azure Cost Management koennen Budgets nicht nur fuer das komplette Abonnement erstellt werden, sondern auch gezielter gefiltert werden, zum Beispiel auf:

- Ressourcengruppen
- Services
- Regionen
- Tags

Das ist wichtig, weil eine Budgetwarnung nicht automatisch fuer alles gelten muss, was in Azure passiert. Je nach Ziel kann man bewusst entscheiden, ob man ein gesamtes Abonnement ueberwachen will oder nur ein einzelnes Projekt. Für ein konkretes Projekt ist eine Eingrenzung auf eine Ressourcengruppe oder ein klar abgegrenztes Kostenobjekt meistens sinnvoller.

### 2. Kostenanalyse und Visualisierung

Der einfachste Einstieg in die Kostenanalyse ist über die Azure-Suche mit dem Begriff `Kostenanalyse`. Dort kann man direkt filtern, gruppieren und die Kostenentwicklung zeitlich auswerten.

Für eine übersichtlichere Darstellung sind ausserdem Arbeitsmappen hilfreich. Mit ihnen lassen sich eigene Ansichten aufbauen, zum Beispiel:

- Kosten nach Service
- Kosten nach Ressourcengruppe
- Kostenentwicklung ueber Tage, Wochen oder Monate
- Vergleich einzelner Workloads

Wenn man eine komplette technische Übersicht über alle Ressourcen braucht, ist der Ressourcen-Manager hilfreich. Dort sieht man schnell, welche Ressourcen wirklich existieren und wo potenzielle Kostentreiber liegen.

## Automatisierung mit der Function App

Ein zentraler Teil des Projekts war eine Azure Function, die automatisch Kostendaten abruft, aufbereitet und per E-Mail verschickt.

### Warum Azure Functions?

Azure Functions sind für dieses Szenario sinnvoll, weil sie:

- serverlos laufen
- nur bei Ausfuehrung Ressourcen verbrauchen
- sich gut fuer wiederkehrende Berichte eignen
- sich mit Managed Identity sicher an Azure-Dienste anbinden lassen

### Flex Consumption vs. Windows Consumption

Im Projekt wurden zwei Varianten betrachtet:

#### Flex Consumption

Flex Consumption ist die modernere und von Microsoft aktiv unterstützte Variante. Der Vorteil liegt vor allem in der besseren Verfügbarkeit und einer stabileren Grundlage für produktive Nutzung.

Der Nachteil ist, dass die Einrichtung am Anfang aufwendiger ist. Man braucht eine lokale Entwicklungsumgebung mit Visual Studio Code, Azure Functions Core Tools, einer funktionierenden Projektstruktur und einem sauberen Deployment-Prozess.

Trotzdem ist Flex Consumption langfristig die bessere Wahl, weil man damit professioneller arbeitet und nicht auf spontane Portal-Aenderungen angewiesen ist.

#### Windows Consumption

Windows Consumption wirkt auf den ersten Blick einfacher, weil man dort den Code leichter direkt im Azure-Portal bearbeiten kann. In der Praxis war dieses Modell für mich aber weniger zuverlässig, weil die Function App zeitweise nicht erreichbar war.

### Mein Fazit zur Auswahl

Für erste Tests kann Windows Consumption einfacher wirken. Wenn man aber professioneller und reproduzierbarer arbeiten möchte, ist Flex Consumption klar die bessere Loesung.

## Wie der automatische Kostenbericht funktioniert

Die Werte in der E-Mail werden direkt im Code der Function App erzeugt. Dort passiert Folgendes:

- Abruf der Kostendaten ueber die Azure Cost Management API
- Gruppierung nach Service und Ressourcengruppe
- Zuordnung technischer Services zu besser verstaendlichen Kategorien
- Berechnung von Trends und Schwellenwerten
- Erstellung eines HTML- und Text-Berichts
- Versand per Azure Communication Services Email

Das bedeutet auch: Wenn ich den Inhalt der E-Mail anpassen moechte, muss ich die Function selbst anpassen. Genau dort werden die Werte erzeugt, gefiltert und dargestellt.

## Die größten Probleme im Projekt

Der schwierigste Teil war nicht das Schreiben des Codes, sondern die saubere Konfiguration der Azure-Ressourcen.

### 1. Zu viele Resources erstellt

Mein größter Fehler war, zu viele ähnliche Ressourcen anzulegen und diese nicht früh genug wieder zu löschen. Dadurch wurde es sehr unübersichtlich, welche Communication Services Ressource, welcher Email Service und welche Domain wirklich zusammengehören.

Die Folge waren typische Konfigurationsfehler:

- falscher Connection String
- falsche Domain
- unpassender Sender
- Ressourcen, die zwar existierten, aber nicht miteinander verbunden waren

Gerade bei Azure Communication Services wurde dadurch schnell unklar, welche Kombination aus:

- Communication Services
- Email Communication Services
- Domain
- Sender-Adresse

wirklich korrekt war.

### 2. Zusammenspiel von Communication Service und Email Service verstehen

Ein wichtiger Lernpunkt war, dass Communication Services und Email Communication Services nicht dasselbe sind.

- Die Domain wird im Email Communication Service bereitgestellt
- Der Versand selbst wird über die Communication Services Ressource angesteuert
- Beide müssen korrekt miteinander verbunden sein

Wenn diese Zuordnung nicht passt, entstehen Fehler wie:

- `DomainNotLinked`
- `Denied`
- `InvalidSenderUserName`

### 3. Ressourcenanbieter aktivieren

Ein weiterer technischer Punkt war die Aktivierung von Ressourcenanbietern auf Abonnement-Ebene. Manche Funktionen in Azure stehen erst zur Verfügung, wenn der entsprechende Provider registriert wurde.

Das ist ein Punkt, den man leicht übersieht, der aber gerade bei neuen Services sehr wichtig ist.

### 4. Identitaet und Rollen

Die Function App musste eine verwaltete Identität erhalten, damit sie sicher auf Azure-Dienste zugreifen kann. Zusätzlich musste die passende Rolle vergeben werden, in meinem Fall insbesondere:

- `Kostenverwaltungsleser`

Erst danach konnte die Function die Cost Management API wirklich nutzen.

### 5. Umgebungsvariablen

Damit der Code funktioniert, mussten in der Function App mehrere Umgebungsvariablen hinterlegt werden, unter anderem:

- `AZURE_SUBSCRIPTION_ID`
- `REPORT_RECIPIENTS`
- `ALERT_THRESHOLDS`
- `COMMUNICATION_SERVICES_CONNECTION_STRING`
- `ACS_EMAIL_FROM`

Gerade bei `ACS_EMAIL_FROM` wurde deutlich, wie wichtig exakte Werte sind. Schon kleine Unterschiede oder ein falscher Bezug auf die falsche Domain führen dazu, dass der E-Mail-Versand scheitert.

## Was ich aus dem Projekt gelernt habe

Das Projekt hat mir gezeigt, dass Cloud Engineering nicht nur aus dem Erstellen von Ressourcen besteht. Viel wichtiger ist das Verständnis für das Zusammenspiel von:

- Infrastruktur
- Konfiguration
- Berechtigungen
- APIs
- Deployment
- Monitoring
- Troubleshooting

Viele Probleme waren am Ende keine Programmierfehler, sondern Konfigurations- oder Architekturfehler. Genau das macht Cloud-Arbeit in der Praxis anspruchsvoll.

## Fazit

Das Projekt war ein sehr guter Einstieg in praxisnahes Cloud Engineering, weil es viele echte Themen zusammengebracht hat:

- Kostenkontrolle
- Budgets und Warnungen
- serverlose Automatisierung
- APIs
- Rollen und Identitaeten
- E-Mail-Kommunikation
- Deployment
- Troubleshooting

Besonders wertvoll war, dass die schwierigsten Probleme nicht einfach nur im Code lagen, sondern im Zusammenspiel der Azure-Ressourcen. Gerade dadurch wurde deutlich, worauf es im Cloud Engineering wirklich ankommt: nicht nur Dienste zu erstellen, sondern sie korrekt, sicher und nachvollziehbar miteinander zu verbinden.

## Screenshots

<br></br>

Azure Kostenanalyse

<br></br>

<img width="1886" height="891" alt="image" src="https://github.com/user-attachments/assets/b9144d8c-b402-41cd-89ff-b9459a9f9456" />

<br></br>

Budgetwarnung

<br></br>

<img width="1430" height="804" alt="image" src="https://github.com/user-attachments/assets/9d761bfd-e9e2-49af-8cb1-722fd23de376" />

<br></br>

Funktions App

<br></br>

<img width="1910" height="632" alt="image" src="https://github.com/user-attachments/assets/14fb0fe9-b302-46b4-8fd1-5aa971909ab1" />

<br></br>

Erfolgreiche Logs

<br></br>

<img width="1691" height="318" alt="image" src="https://github.com/user-attachments/assets/9d2df610-492c-4471-82b1-8d7c7893402e" />

<br></br>

Empfangene E-Mail

<br></br>

<img width="1078" height="764" alt="image" src="https://github.com/user-attachments/assets/4012d666-9b89-4c9f-a8cb-5019928e84c5" />
