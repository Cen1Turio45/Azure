# Azure Cost Monitoring Project

## Ziel
Wöchentlicher Kostenbericht mit Azure Function.

## Architektur
Timer Trigger -> Azure Function -> Azure Cost Management API -> Report -> E-Mail

## Aktueller Stand
- Timer Trigger läuft
- Managed Identity funktioniert
- Cost API liefert Daten
- E-Mail-Versand fehlt noch