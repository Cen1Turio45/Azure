const { app } = require("@azure/functions");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const SERVICE_CATEGORY_RULES = [
    { category: "Server", match: ["virtual machines", "virtual machine", "vm", "app service", "functions", "kubernetes", "container apps", "container instances", "batch", "spring apps"] },
    { category: "Datenbanken", match: ["sql", "cosmos", "database", "postgres", "mysql", "mariadb", "cache for redis"] },
    { category: "Speicher", match: ["storage", "disks", "backup", "recovery services", "archive"] },
    { category: "Netzwerk", match: ["bandwidth", "vpn", "virtual network", "load balancer", "application gateway", "dns", "expressroute", "front door", "firewall"] },
    { category: "Sicherheit", match: ["defender", "sentinel", "key vault", "security center"] },
    { category: "Monitoring", match: ["monitor", "log analytics", "insights", "application insights"] },
    { category: "Daten & Integration", match: ["data factory", "event hub", "service bus", "logic apps", "api management", "synapse"] },
    { category: "KI & Analyse", match: ["machine learning", "cognitive", "openai", "search"] }
];

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Umgebungsvariable ${name} fehlt.`);
    }

    return value;
}

function getOptionalEnv(name, fallback = "") {
    const value = process.env[name];
    return value === undefined || value === null || value === "" ? fallback : value;
}

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

function getJson(url, options = {}) {
    const client = url.startsWith("https") ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.get(url, options, (res) => {
            let data = "";

            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(data ? JSON.parse(data) : {});
                    } catch (error) {
                        reject(new Error(`JSON-Antwort konnte nicht geparst werden: ${error.message}`));
                    }
                } else {
                    reject(new Error(`GET ${url} schlug fehl (${res.statusCode}): ${data}`));
                }
            });
        });

        req.on("error", reject);
    });
}

function sendRequest(url, method, headers = {}, body = "") {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.request(
            {
                protocol: parsedUrl.protocol,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
                path: `${parsedUrl.pathname}${parsedUrl.search}`,
                method,
                headers
            },
            (res) => {
                let data = "";

                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(data ? JSON.parse(data) : {});
                        } catch {
                            resolve({ raw: data });
                        }
                    } else {
                        reject(new Error(`${method} ${url} schlug fehl (${res.statusCode}): ${data}`));
                    }
                });
            }
        );

        req.on("error", reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

function sendRequestDetailed(url, method, headers = {}, body = "") {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.request(
            {
                protocol: parsedUrl.protocol,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
                path: `${parsedUrl.pathname}${parsedUrl.search}`,
                method,
                headers
            },
            (res) => {
                let data = "";

                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    const response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    };

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`${method} ${url} schlug fehl (${res.statusCode}): ${data}`));
                    }
                });
            }
        );

        req.on("error", reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

function parseCommunicationConnectionString(connectionString) {
    const entries = connectionString
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);

    const values = {};
    for (const entry of entries) {
        const separatorIndex = entry.indexOf("=");
        if (separatorIndex > 0) {
            values[entry.slice(0, separatorIndex).toLowerCase()] = entry.slice(separatorIndex + 1);
        }
    }

    if (!values.endpoint || !values.accesskey) {
        throw new Error("COMMUNICATION_SERVICES_CONNECTION_STRING muss endpoint und accesskey enthalten.");
    }

    return {
        endpoint: values.endpoint,
        accessKey: values.accesskey
    };
}

function createAcsAuthorizationHeader(method, requestUrl, body, accessKey) {
    const parsedUrl = new URL(requestUrl);
    const date = new Date().toUTCString();
    const contentHash = crypto.createHash("sha256").update(body, "utf8").digest("base64");
    const stringToSign = `${method}\n${parsedUrl.pathname}${parsedUrl.search}\n${date};${parsedUrl.host};${contentHash}`;
    const signature = crypto
        .createHmac("sha256", Buffer.from(accessKey, "base64"))
        .update(stringToSign, "utf8")
        .digest("base64");

    return {
        authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
        date,
        contentHash
    };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getManagedIdentityToken(resource) {
    const identityEndpoint = getRequiredEnv("IDENTITY_ENDPOINT");
    const identityHeader = getRequiredEnv("IDENTITY_HEADER");
    const url = `${identityEndpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`;
    const response = await getJson(url, {
        headers: {
            "X-IDENTITY-HEADER": identityHeader,
            Metadata: "true"
        }
    });

    if (!response.access_token) {
        throw new Error("Managed-Identity-Token wurde ohne access_token zurueckgegeben.");
    }

    return response.access_token;
}

async function queryCosts(subscriptionId, accessToken) {
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`;
    const body = JSON.stringify({
        type: "ActualCost",
        timeframe: "MonthToDate",
        dataset: {
            granularity: "Daily",
            aggregation: {
                totalCost: {
                    name: "PreTaxCost",
                    function: "Sum"
                }
            },
            grouping: [
                { type: "Dimension", name: "ServiceName" },
                { type: "Dimension", name: "ResourceGroupName" }
            ]
        }
    });

    return sendRequest(url, "POST", {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
    }, body);
}

function getColumnIndex(columns, targetName) {
    return columns.findIndex((column) => column.name === targetName);
}

function categorizeService(serviceName) {
    const normalized = String(serviceName || "Unbekannt").toLowerCase();

    for (const rule of SERVICE_CATEGORY_RULES) {
        if (rule.match.some((term) => normalized.includes(term))) {
            return rule.category;
        }
    }

    return "Sonstige Plattformdienste";
}

function normalizeCostRows(costResponse) {
    const properties = costResponse?.properties;
    const columns = properties?.columns || [];
    const rows = properties?.rows || [];

    if (!rows.length) {
        throw new Error("Cost-Management-Antwort enthaelt keine Kostenzeilen.");
    }

    const costIndex = getColumnIndex(columns, "PreTaxCost");

    if (costIndex < 0) {
        throw new Error("Pflichtspalte PreTaxCost fehlt.");
    }

    const serviceIndex = getColumnIndex(columns, "ServiceName");

    if (serviceIndex < 0) {
        throw new Error("Pflichtspalte ServiceName fehlt.");
    }

    const dateIndex = getColumnIndex(columns, "UsageDate");

    if (dateIndex < 0) {
        throw new Error("Pflichtspalte UsageDate fehlt.");
    }

    const currencyIndex = getColumnIndex(columns, "Currency");

    if (currencyIndex < 0) {
        throw new Error("Pflichtspalte Currency fehlt.");
    }

    const resourceGroupIndex = getColumnIndex(columns, "ResourceGroupName");

    return rows.map((row, rowIndex) => {
        const serviceName = String(row[serviceIndex] || "").trim();
        const usageDate = String(row[dateIndex] || "").trim();
        const currency = String(row[currencyIndex] || "").trim();
        const rawCost = row[costIndex];
        const cost = Number(rawCost);

        if (!serviceName) {
            throw new Error(`Ungueltiger ServiceName-Wert in der Cost-Management-Antwort. Zeile: ${rowIndex + 1}.`);
        }

        if (!isValidUsageDate(usageDate)) {
            throw new Error(`Ungueltiger UsageDate-Wert in der Cost-Management-Antwort. Zeile: ${rowIndex + 1}, Wert: ${usageDate || "<leer>"}. Erwartetes Format: YYYYMMDD.`);
        }

        if (!/^[A-Z]{3}$/.test(currency)) {
            throw new Error(`Ungueltiger Currency-Wert in der Cost-Management-Antwort. Zeile: ${rowIndex + 1}, Wert: ${currency || "<leer>"}. Erwartetes Format: ISO-4217-Code, z. B. EUR.`);
        }

        if (!Number.isFinite(cost)) {
            throw new Error(`Ungueltiger PreTaxCost-Wert in der Cost-Management-Antwort. Zeile: ${rowIndex + 1}, Service: ${serviceName}, UsageDate: ${usageDate}.`);
        }

        return {
            serviceName,
            serviceCategory: categorizeService(serviceName),
            resourceGroupName: resourceGroupIndex >= 0 ? row[resourceGroupIndex] || "Nicht zugeordnet" : "Nicht zugeordnet",
            cost,
            usageDate,
            currency
        };
    });
}

function aggregateBy(items, keyName, valueName = "totalCost") {
    const totals = new Map();

    for (const item of items) {
        const key = item[keyName] || "Unbekannt";
        totals.set(key, (totals.get(key) || 0) + item.cost);
    }

    return Array.from(totals.entries())
        .map(([name, total]) => ({ [keyName]: name, [valueName]: total }))
        .sort((left, right) => right[valueName] - left[valueName]);
}

function formatCurrency(amount, currency) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: currency || "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatUsageDate(value) {
    if (!value || value.length !== 8) {
        return value || "unbekannt";
    }

    return `${value.slice(6, 8)}.${value.slice(4, 6)}.${value.slice(0, 4)}`;
}

function isValidUsageDate(value) {
    if (!/^\d{8}$/.test(value)) {
        return false;
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

function parseUsageDate(value) {
    if (!value || value.length !== 8) {
        return null;
    }

    return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))));
}

function startOfIsoWeekUtc(date) {
    const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() - day + 1);
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
}

function calculateTrend(costRows) {
    const datedRows = costRows
        .map((row) => ({ ...row, parsedDate: parseUsageDate(row.usageDate) }))
        .filter((row) => row.parsedDate);

    if (!datedRows.length) {
        return { direction: "unbekannt", currentWeekCost: 0, previousWeekCost: 0, deltaAbsolute: 0, deltaPercent: 0, dailyTotals: [] };
    }

    const latestDate = datedRows.reduce((latest, row) => row.parsedDate > latest ? row.parsedDate : latest, datedRows[0].parsedDate);
    const currentWeekStart = startOfIsoWeekUtc(latestDate);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

    const dailyTotalsMap = new Map();
    let currentWeekCost = 0;
    let previousWeekCost = 0;

    for (const row of datedRows) {
        dailyTotalsMap.set(row.usageDate, (dailyTotalsMap.get(row.usageDate) || 0) + row.cost);

        if (row.parsedDate >= currentWeekStart) {
            currentWeekCost += row.cost;
        } else if (row.parsedDate >= previousWeekStart && row.parsedDate < currentWeekStart) {
            previousWeekCost += row.cost;
        }
    }

    const deltaAbsolute = currentWeekCost - previousWeekCost;
    const deltaPercent = previousWeekCost === 0 ? (currentWeekCost > 0 ? 100 : 0) : (deltaAbsolute / previousWeekCost) * 100;

    let direction = "stabil";
    if (deltaAbsolute > 0.01) {
        direction = "steigend";
    } else if (deltaAbsolute < -0.01) {
        direction = "sinkend";
    }

    return {
        direction,
        currentWeekCost,
        previousWeekCost,
        deltaAbsolute,
        deltaPercent,
        dailyTotals: Array.from(dailyTotalsMap.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([usageDate, totalCost]) => ({ usageDate, totalCost }))
    };
}

function getThresholds(currency) {
    return getOptionalEnv("ALERT_THRESHOLDS", "100,250,500")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right)
        .map((value) => ({ value, label: formatCurrency(value, currency) }));
}

function determineSeverity(totalCost, thresholds) {
    const breached = thresholds.filter((threshold) => totalCost >= threshold.value);

    if (!breached.length) {
        return {
            level: "normal",
            message: "Aktuell wurde noch kein definierter Kostenschwellenwert ueberschritten.",
            breachedThresholds: []
        };
    }

    const highestThreshold = breached[breached.length - 1];
    return {
        level: breached.length >= 3 ? "kritisch" : breached.length >= 2 ? "warnung" : "hinweis",
        message: `Der Kostenschwellenwert ${highestThreshold.label} wurde erreicht oder ueberschritten.`,
        breachedThresholds: breached
    };
}

function buildExecutiveSummary(report) {
    const trendText = report.trend.direction === "steigend"
        ? `Die Kosten steigen gegenueber der Vorwoche um ${formatCurrency(report.trend.deltaAbsolute, report.currency)}.`
        : report.trend.direction === "sinkend"
            ? `Die Kosten sinken gegenueber der Vorwoche um ${formatCurrency(Math.abs(report.trend.deltaAbsolute), report.currency)}.`
            : "Die Kosten bewegen sich im Vergleich zur Vorwoche auf einem stabilen Niveau.";

    return [
        `Gesamtkosten im laufenden Monat: ${formatCurrency(report.totalCost, report.currency)}.`,
        report.severity.message,
        trendText,
        `Groesster Kostentreiber ist derzeit ${report.topServices[0]?.serviceName || "kein Service"}.`
    ].join(" ");
}

function buildReport(costResponse) {
    const costRows = normalizeCostRows(costResponse);
    const currencies = [...new Set(costRows.map((row) => row.currency))];

    if (currencies.length !== 1) {
        throw new Error(`Cost-Management-Antwort enthaelt mehrere Waehrungen: ${currencies.join(", ")}.`);
    }

    const currency = currencies[0];
    const totalCost = costRows.reduce((sum, row) => sum + row.cost, 0);
    const latestUsageDate = costRows.map((row) => row.usageDate).filter(Boolean).sort().pop();
    const thresholds = getThresholds(currency);
    const trend = calculateTrend(costRows);
    const topServices = aggregateBy(costRows, "serviceName").slice(0, 10);
    const topCategories = aggregateBy(costRows, "serviceCategory", "totalCost").slice(0, 10);
    const topResourceGroups = aggregateBy(costRows, "resourceGroupName", "totalCost").slice(0, 10);
    const severity = determineSeverity(totalCost, thresholds);

    const report = {
        generatedAt: new Date().toISOString(),
        totalCost,
        currency,
        latestUsageDate,
        itemCount: costRows.length,
        topServices,
        topCategories,
        topResourceGroups,
        trend,
        thresholds,
        severity
    };

    report.executiveSummary = buildExecutiveSummary(report);
    return report;
}

function buildList(title, entries, nameKey, currency, emptyText) {
    const lines = [title];

    if (!entries.length) {
        lines.push(`- ${emptyText}`);
        return lines;
    }

    entries.forEach((entry, index) => {
        lines.push(`${index + 1}. ${entry[nameKey]}: ${formatCurrency(entry.totalCost, currency)}`);
    });

    return lines;
}

function buildTextReport(report, subscriptionId) {
    return [
        "Azure Kostenbericht",
        `Subscription: ${subscriptionId}`,
        `Stand: ${formatUsageDate(report.latestUsageDate)}`,
        `Gesamtkosten MTD: ${formatCurrency(report.totalCost, report.currency)}`,
        `Schweregrad: ${report.severity.level}`,
        `Executive Summary: ${report.executiveSummary}`,
        `Trend: ${report.trend.direction} (${formatCurrency(report.trend.currentWeekCost, report.currency)} diese Woche vs. ${formatCurrency(report.trend.previousWeekCost, report.currency)} letzte Woche)`,
        "",
        ...buildList("Top Kategorien:", report.topCategories, "serviceCategory", report.currency, "Keine Kategoriedaten vorhanden."),
        "",
        ...buildList("Top Services:", report.topServices, "serviceName", report.currency, "Keine Servicedaten vorhanden."),
        "",
        ...buildList("Top Resource Groups:", report.topResourceGroups, "resourceGroupName", report.currency, "Keine Resource-Group-Daten vorhanden.")
    ].join("\n");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildTableRows(entries, nameKey, currency, emptyText) {
    if (!entries.length) {
        return `<tr><td colspan="2" style="padding:8px;">${escapeHtml(emptyText)}</td></tr>`;
    }

    return entries.map((entry) => `
        <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(entry[nameKey])}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatCurrency(entry.totalCost, currency))}</td>
        </tr>`).join("");
}

function buildHtmlReport(report, subscriptionId) {
    return `
        <html>
            <body style="font-family:Segoe UI, Arial, sans-serif;color:#111827;line-height:1.5;">
                <h2 style="margin-bottom:4px;">Azure Kostenbericht</h2>
                <p style="margin-top:0;color:#4b5563;">Subscription: ${escapeHtml(subscriptionId)}</p>
                <p><strong>Stand:</strong> ${escapeHtml(formatUsageDate(report.latestUsageDate))}</p>
                <p><strong>Gesamtkosten MTD:</strong> ${escapeHtml(formatCurrency(report.totalCost, report.currency))}</p>
                <p><strong>Schweregrad:</strong> ${escapeHtml(report.severity.level)}</p>
                <p><strong>Executive Summary:</strong> ${escapeHtml(report.executiveSummary)}</p>
                <p><strong>Trend:</strong> ${escapeHtml(report.trend.direction)} (${escapeHtml(formatCurrency(report.trend.currentWeekCost, report.currency))} diese Woche vs. ${escapeHtml(formatCurrency(report.trend.previousWeekCost, report.currency))} letzte Woche)</p>
                <h3>Top Kategorien</h3>
                <table style="border-collapse:collapse;min-width:420px;">
                    <thead>
                        <tr>
                            <th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db;">Kategorie</th>
                            <th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db;">Kosten</th>
                        </tr>
                    </thead>
                    <tbody>${buildTableRows(report.topCategories, "serviceCategory", report.currency, "Keine Kategoriedaten vorhanden.")}</tbody>
                </table>
                <h3>Top Services</h3>
                <table style="border-collapse:collapse;min-width:420px;">
                    <thead>
                        <tr>
                            <th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db;">Service</th>
                            <th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db;">Kosten</th>
                        </tr>
                    </thead>
                    <tbody>${buildTableRows(report.topServices, "serviceName", report.currency, "Keine Servicedaten vorhanden.")}</tbody>
                </table>
                <h3>Top Resource Groups</h3>
                <table style="border-collapse:collapse;min-width:420px;">
                    <thead>
                        <tr>
                            <th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db;">Resource Group</th>
                            <th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db;">Kosten</th>
                        </tr>
                    </thead>
                    <tbody>${buildTableRows(report.topResourceGroups, "resourceGroupName", report.currency, "Keine Resource-Group-Daten vorhanden.")}</tbody>
                </table>
            </body>
        </html>`;
}

function getRecipientList() {
    return getRequiredEnv("REPORT_RECIPIENTS")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

async function sendWithCommunicationServices(subject, textContent, htmlContent, recipients) {
    const connectionString = getRequiredEnv("COMMUNICATION_SERVICES_CONNECTION_STRING");
    const senderAddress = getRequiredEnv("ACS_EMAIL_FROM");
    const { endpoint, accessKey } = parseCommunicationConnectionString(connectionString);
    console.log("ACS DEBUG", {
        endpoint,
        senderAddress
    });
    const sendUrl = `${endpoint.replace(/\/$/, "")}/emails:send?api-version=2025-09-01`;
    const body = JSON.stringify({
        senderAddress,
        content: {
            subject,
            plainText: textContent,
            html: htmlContent
        },
        recipients: {
            to: recipients.map((email) => ({ address: email }))
        }
    });
    const authHeaders = createAcsAuthorizationHeader("POST", sendUrl, body, accessKey);
    const sendResponse = await sendRequestDetailed(sendUrl, "POST", {
        Authorization: authHeaders.authorization,
        "x-ms-date": authHeaders.date,
        "x-ms-content-sha256": authHeaders.contentHash,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Host: new URL(endpoint).host
    }, body);

    const operationLocation = sendResponse.headers["operation-location"];
    if (!operationLocation) {
        throw new Error("ACS Email hat keine Operation-Location fuer das Polling geliefert.");
    }

    const retryAfter = Number(sendResponse.headers["retry-after"] || 5);

    for (let attempt = 0; attempt < 10; attempt += 1) {
        if (attempt > 0) {
            await wait(retryAfter * 1000);
        }

        const pollHeaders = createAcsAuthorizationHeader("GET", operationLocation, "", accessKey);
        const pollResponse = await sendRequest(operationLocation, "GET", {
            Authorization: pollHeaders.authorization,
            "x-ms-date": pollHeaders.date,
            "x-ms-content-sha256": pollHeaders.contentHash,
            Host: new URL(operationLocation).host
        });

        const status = pollResponse?.status || pollResponse?.statusCode || "Unbekannt";
        if (status === "Succeeded") {
            return { provider: "Azure Communication Services Email", messageId: pollResponse.id || pollResponse.operationId || "" };
        }

        if (status === "Failed" || status === "Canceled") {
            throw new Error(`Azure Communication Services Email meldete den Status ${status}.`);
        }
    }

    throw new Error("Azure Communication Services Email konnte nicht erfolgreich abgeschlossen werden.");
}

async function sendLogicAppNotification(report, subscriptionId) {
    const logicAppUrl = getOptionalEnv("LOGIC_APP_URL");
    if (!logicAppUrl) {
        return false;
    }

    const payload = JSON.stringify({
        subscriptionId,
        generatedAt: report.generatedAt,
        severity: report.severity.level,
        executiveSummary: report.executiveSummary,
        totalCost: report.totalCost,
        currency: report.currency,
        latestUsageDate: report.latestUsageDate,
        thresholdsBreached: report.severity.breachedThresholds,
        trend: report.trend,
        topCategories: report.topCategories,
        topServices: report.topServices,
        topResourceGroups: report.topResourceGroups
    });

    await sendRequest(logicAppUrl, "POST", {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
    }, payload);

    return true;
}

async function sendReportEmail(report, subscriptionId) {
    const recipients = getRecipientList();
    const severityPrefix = report.severity.level === "kritisch"
        ? "[KRITISCH] "
        : report.severity.level === "warnung"
            ? "[WARNUNG] "
            : "";
    const subject = `${severityPrefix}Azure Kostenbericht ${new Date().toLocaleDateString("de-DE")}`;

    return sendWithCommunicationServices(subject, buildTextReport(report, subscriptionId), buildHtmlReport(report, subscriptionId), recipients);
}

app.timer("Time_Trigger", {
    schedule: "0 0 9 1 * *",
    handler: async (myTimer, context) => {
        context.log("Azure Cost Monitoring gestartet.", {
            scheduleStatus: myTimer.scheduleStatus,
            isPastDue: myTimer.isPastDue || false
        });

        try {
            validateStartupConfig();
            const subscriptionId = getRequiredEnv("AZURE_SUBSCRIPTION_ID");
            const managementToken = await getManagedIdentityToken("https://management.azure.com/");
            const costResponse = await queryCosts(subscriptionId, managementToken);
            const report = buildReport(costResponse);
            const emailResult = await sendReportEmail(report, subscriptionId);
            const logicAppTriggered = await sendLogicAppNotification(report, subscriptionId);

            context.log("Kostenbericht erfolgreich erstellt.", {
                emailProvider: emailResult.provider,
                emailMessageId: emailResult.messageId,
                logicAppTriggered,
                severity: report.severity.level,
                totalCost: formatCurrency(report.totalCost, report.currency),
                latestUsageDate: formatUsageDate(report.latestUsageDate),
                executiveSummary: report.executiveSummary
            });
        } catch (error) {
            context.error("Azure Cost Monitoring fehlgeschlagen.", error);
            throw error;
        }
    }
});

