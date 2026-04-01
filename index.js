const http = require("http");
const https = require("https");

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Umgebungsvariable ${name} fehlt.`);
    }

    return value;
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

function sendJsonRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
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
                    reject(new Error(`${options.method} ${options.hostname}${options.path} schlug fehl (${res.statusCode}): ${data}`));
                }
            });
        });

        req.on("error", reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
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
    const path = `/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`;
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
                {
                    type: "Dimension",
                    name: "ServiceName"
                }
            ]
        }
    });

    return sendJsonRequest(
        {
            hostname: "management.azure.com",
            path,
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        },
        body
    );
}

function getColumnIndex(columns, targetName) {
    return columns.findIndex((column) => column.name === targetName);
}

function normalizeCostRows(costResponse) {
    const properties = costResponse?.properties;
    const columns = properties?.columns || [];
    const rows = properties?.rows || [];

    const costIndex = getColumnIndex(columns, "PreTaxCost");
    const serviceIndex = getColumnIndex(columns, "ServiceName");
    const dateIndex = getColumnIndex(columns, "UsageDate");
    const currencyIndex = getColumnIndex(columns, "Currency");

    return rows.map((row) => ({
        serviceName: serviceIndex >= 0 ? row[serviceIndex] : "Unbekannt",
        cost: Number(row[costIndex] || 0),
        usageDate: dateIndex >= 0 ? String(row[dateIndex]) : "",
        currency: currencyIndex >= 0 ? row[currencyIndex] : "EUR"
    }));
}

function groupByService(costRows) {
    const totals = new Map();

    for (const row of costRows) {
        const current = totals.get(row.serviceName) || 0;
        totals.set(row.serviceName, current + row.cost);
    }

    return Array.from(totals.entries())
        .map(([serviceName, totalCost]) => ({ serviceName, totalCost }))
        .sort((left, right) => right.totalCost - left.totalCost);
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

    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    return `${day}.${month}.${year}`;
}

function buildReport(costResponse) {
    const costRows = normalizeCostRows(costResponse);
    const groupedServices = groupByService(costRows);
    const currency = costRows[0]?.currency || "EUR";
    const totalCost = costRows.reduce((sum, row) => sum + row.cost, 0);
    const latestEntry = costRows
        .map((row) => row.usageDate)
        .filter(Boolean)
        .sort()
        .pop();

    return {
        generatedAt: new Date().toISOString(),
        totalCost,
        currency,
        latestUsageDate: latestEntry,
        topServices: groupedServices.slice(0, 10),
        itemCount: costRows.length
    };
}

function buildTextReport(report, subscriptionId) {
    const header = [
        "Azure Kostenbericht",
        `Subscription: ${subscriptionId}`,
        `Stand: ${formatUsageDate(report.latestUsageDate)}`,
        `Gesamtkosten MTD: ${formatCurrency(report.totalCost, report.currency)}`,
        `Anzahl Positionen: ${report.itemCount}`,
        "",
        "Top Services:"
    ];

    const serviceLines = report.topServices.length
        ? report.topServices.map((service, index) => `${index + 1}. ${service.serviceName}: ${formatCurrency(service.totalCost, report.currency)}`)
        : ["Keine Kostendaten vorhanden."];

    return [...header, ...serviceLines].join("\n");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildHtmlReport(report, subscriptionId) {
    const rows = report.topServices.length
        ? report.topServices
            .map(
                (service) => `
                    <tr>
                        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(service.serviceName)}</td>
                        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatCurrency(service.totalCost, report.currency))}</td>
                    </tr>`
            )
            .join("")
        : '<tr><td colspan="2" style="padding:8px;">Keine Kostendaten vorhanden.</td></tr>';

    return `
        <html>
            <body style="font-family:Segoe UI, Arial, sans-serif;color:#111827;">
                <h2 style="margin-bottom:4px;">Azure Kostenbericht</h2>
                <p style="margin-top:0;color:#4b5563;">Subscription: ${escapeHtml(subscriptionId)}</p>
                <p><strong>Stand:</strong> ${escapeHtml(formatUsageDate(report.latestUsageDate))}</p>
                <p><strong>Gesamtkosten MTD:</strong> ${escapeHtml(formatCurrency(report.totalCost, report.currency))}</p>
                <p><strong>Anzahl Positionen:</strong> ${escapeHtml(String(report.itemCount))}</p>
                <table style="border-collapse:collapse;min-width:420px;">
                    <thead>
                        <tr>
                            <th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db;">Service</th>
                            <th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db;">Kosten</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
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

async function sendWithSendGrid(subject, textContent, htmlContent, recipients) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const sender = process.env.MAIL_FROM;

    if (!apiKey || !sender) {
        return false;
    }

    const body = JSON.stringify({
        personalizations: [
            {
                to: recipients.map((email) => ({ email }))
            }
        ],
        from: { email: sender },
        subject,
        content: [
            { type: "text/plain", value: textContent },
            { type: "text/html", value: htmlContent }
        ]
    });

    await sendJsonRequest(
        {
            hostname: "api.sendgrid.com",
            path: "/v3/mail/send",
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        },
        body
    );

    return true;
}

async function sendWithMicrosoftGraph(subject, textContent, htmlContent, recipients) {
    const senderUserId = process.env.GRAPH_SENDER_USER_ID;
    if (!senderUserId) {
        return false;
    }

    const graphToken = await getManagedIdentityToken("https://graph.microsoft.com/");
    const body = JSON.stringify({
        message: {
            subject,
            body: {
                contentType: "HTML",
                content: htmlContent
            },
            toRecipients: recipients.map((email) => ({
                emailAddress: { address: email }
            })),
            internetMessageHeaders: [
                {
                    name: "X-Report-Format",
                    value: "text-and-html"
                }
            ]
        },
        saveToSentItems: false
    });

    await sendJsonRequest(
        {
            hostname: "graph.microsoft.com",
            path: `/v1.0/users/${encodeURIComponent(senderUserId)}/sendMail`,
            method: "POST",
            headers: {
                Authorization: `Bearer ${graphToken}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        },
        body
    );

    return true;
}

async function sendReportEmail(report, subscriptionId) {
    const recipients = getRecipientList();
    const subject = `Azure Kostenbericht ${new Date().toLocaleDateString("de-DE")}`;
    const textContent = buildTextReport(report, subscriptionId);
    const htmlContent = buildHtmlReport(report, subscriptionId);

    const sentViaSendGrid = await sendWithSendGrid(subject, textContent, htmlContent, recipients);
    if (sentViaSendGrid) {
        return "SendGrid";
    }

    const sentViaGraph = await sendWithMicrosoftGraph(subject, textContent, htmlContent, recipients);
    if (sentViaGraph) {
        return "Microsoft Graph";
    }

    throw new Error("Keine E-Mail-Konfiguration gefunden. Setze SENDGRID_API_KEY + MAIL_FROM oder GRAPH_SENDER_USER_ID.");
}

module.exports = async function (context, myTimer) {
    const subscriptionId = getRequiredEnv("AZURE_SUBSCRIPTION_ID");
    context.log("Azure Cost Monitoring gestartet.", {
        scheduleStatus: myTimer?.scheduleStatus,
        isPastDue: myTimer?.isPastDue || false
    });

    try {
        const managementToken = await getManagedIdentityToken("https://management.azure.com/");
        const costResponse = await queryCosts(subscriptionId, managementToken);
        const report = buildReport(costResponse);
        const mailProvider = await sendReportEmail(report, subscriptionId);

        context.log("Kostenbericht erfolgreich erstellt und versendet.", {
            mailProvider,
            totalCost: formatCurrency(report.totalCost, report.currency),
            latestUsageDate: formatUsageDate(report.latestUsageDate)
        });
    } catch (error) {
        context.log.error("Azure Cost Monitoring fehlgeschlagen.", error);
        throw error;
    }
};

