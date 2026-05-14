const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const { normalizeCostRows, buildReport, isValidUsageDate, getOperationLocationOrThrow, evaluateAcsPollingStatus, getRetryAfterSeconds, parseCommunicationConnectionString } = require("../src/functions/Time_Trigger");

function buildCostResponse(columns, rows) {
    return {
        properties: {
            columns: columns.map((name) => ({ name })),
            rows
        }
    };
}

describe("normalizeCostRows", () => {
    test("maps a valid Cost Management response", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [[12.34, "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
        );

        const rows = normalizeCostRows(response);

        assert.equal(rows.length, 1);
        assert.equal(rows[0].serviceName, "Azure Functions");
        assert.equal(rows[0].serviceCategory, "Server");
        assert.equal(rows[0].resourceGroupName, "rg-cost-monitoring");
        assert.equal(rows[0].cost, 12.34);
        assert.equal(rows[0].usageDate, "20260415");
        assert.equal(rows[0].currency, "EUR");
    });

    test("fails when PreTaxCost column is missing", () => {
        const response = buildCostResponse(
            ["ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [["Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Schemafehler: Pflichtspalte PreTaxCost fehlt/
        );
    });

    test("fails when Cost Management response has no rows", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            []
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Datenmengenfehler: Cost-Management-Antwort enthaelt keine Kostenzeilen/
        );
    });

    test("fails when PreTaxCost value is not numeric", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [["not-a-number", "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Wertefehler: Ungueltiger PreTaxCost-Wert/
        );
    });

    test("fails when PreTaxCost value is empty", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [["", "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Ungueltiger PreTaxCost-Wert/
        );
    });

    test("fails when ServiceName value is empty", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [[12.34, "", "20260415", "EUR", "rg-cost-monitoring"]]
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Ungueltiger ServiceName-Wert/
        );
    });

    test("uses fallback when ResourceGroupName value is empty", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [[12.34, "Azure Functions", "20260415", "EUR", ""]]
        );

        const rows = normalizeCostRows(response);

        assert.equal(rows[0].resourceGroupName, "Nicht zugeordnet");
    });

    test("uses fallback when ResourceGroupName column is missing", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency"],
            [[12.34, "Azure Functions", "20260415", "EUR"]]
        );

        const rows = normalizeCostRows(response);

        assert.equal(rows[0].resourceGroupName, "Nicht zugeordnet");
    });

    test("fails when Currency value is not ISO code", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [[12.34, "Azure Functions", "20260415", "eur", "rg-cost-monitoring"]]
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Ungueltiger Currency-Wert/
        );
    });

    test("fails when UsageDate value is invalid", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [[12.34, "Azure Functions", "2026-04-15", "EUR", "rg-cost-monitoring"]]
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Ungueltiger UsageDate-Wert/
        );
    });
});

describe("isValidUsageDate", () => {
    test("rejects impossible dates", () => {
        assert.equal(isValidUsageDate("20260415"), true);
        assert.equal(isValidUsageDate("20269999"), false);
        assert.equal(isValidUsageDate("2026-04-15"), false);
    });
});

describe("buildReport", () => {
    test("fails when Cost Management response contains multiple currencies", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [
                [12.34, "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"],
                [10.00, "Storage", "20260415", "USD", "rg-cost-monitoring"]
            ]
        );

        assert.throws(
            () => buildReport(response),
            /mehrere Waehrungen/
        );
    });

    test("builds totals and top services for valid data", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [
                [10.00, "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"],
                [20.00, "Storage", "20260415", "EUR", "rg-cost-monitoring"]
            ]
        );

        const report = buildReport(response);

        assert.equal(report.totalCost, 30);
        assert.equal(report.currency, "EUR");
        assert.equal(report.topServices[0].serviceName, "Storage");
        assert.equal(report.topServices[0].totalCost, 20);
        assert.equal(report.topServices[1].serviceName, "Azure Functions");
        assert.equal(report.topServices[1].totalCost, 10);
    });

    test("aggregates duplicate services in topServices", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [
                [10.00, "Storage", "20260415", "EUR", "rg-cost-monitoring"],
                [15.00, "Storage", "20260416", "EUR", "rg-cost-monitoring"]
            ]
        );

        const report = buildReport(response);

        assert.equal(report.totalCost, 25);
        assert.equal(report.topServices.length, 1);
        assert.equal(report.topServices[0].serviceName, "Storage");
        assert.equal(report.topServices[0].totalCost, 25);
    });

    test("aggregates duplicate resource groups in topResourceGroups", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [
                [10.00, "Storage", "20260415", "EUR", "rg-a"],
                [15.00, "Azure Functions", "20260416", "EUR", "rg-a"]
            ]
        );

        const report = buildReport(response);

        assert.equal(report.topResourceGroups.length, 1);
        assert.equal(report.topResourceGroups[0].resourceGroupName, "rg-a");
        assert.equal(report.topResourceGroups[0].totalCost, 25);
    });

    test("filters entries that would display as 0,00 from report top lists", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [
                [0.04, "Storage", "20260415", "EUR", "rg-kostenwarnung"],
                [0.001, "Email", "20260415", "EUR", "defaultresourcegroup-dewc"],
                [0.002, "Azure App Service", "20260415", "EUR", "azurestorage50t"]
            ]
        );

        const report = buildReport(response);

        assert.equal(report.topServices.length, 1);
        assert.equal(report.topServices[0].serviceName, "Storage");
        assert.equal(report.topCategories.length, 1);
        assert.equal(report.topCategories[0].serviceCategory, "Speicher");
        assert.equal(report.topResourceGroups.length, 1);
        assert.equal(report.topResourceGroups[0].resourceGroupName, "rg-kostenwarnung");
    });

    test("sets severity to hinweis when one threshold is exceeded", () => {
        const previousThresholds = process.env.ALERT_THRESHOLDS;
        process.env.ALERT_THRESHOLDS = "10,25,50";

        try {
            const response = buildCostResponse(
                ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
                [[20.00, "Storage", "20260415", "EUR", "rg-a"]]
            );

            const report = buildReport(response);

            assert.equal(report.severity.level, "hinweis");
        } finally {
            if (previousThresholds === undefined) {
                delete process.env.ALERT_THRESHOLDS;
            } else {
                process.env.ALERT_THRESHOLDS = previousThresholds;
            }
        }
    });

    test("sets severity to warnung when two thresholds are exceeded", () => {
        const previousThresholds = process.env.ALERT_THRESHOLDS;
        process.env.ALERT_THRESHOLDS = "10,25,50";

        try {
            const response = buildCostResponse(
                ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
                [[26.00, "Storage", "20260415", "EUR", "rg-a"]]
            );

            const report = buildReport(response);

            assert.equal(report.severity.level, "warnung");
        } finally {
            if (previousThresholds === undefined) {
                delete process.env.ALERT_THRESHOLDS;
            } else {
                process.env.ALERT_THRESHOLDS = previousThresholds;
            }
        }
    });

    test("sets severity to kritisch when three thresholds are exceeded", () => {
        const previousThresholds = process.env.ALERT_THRESHOLDS;
        process.env.ALERT_THRESHOLDS = "10,25,50";

        try {
            const response = buildCostResponse(
                ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
                [[51.00, "Storage", "20260415", "EUR", "rg-a"]]
            );

            const report = buildReport(response);

            assert.equal(report.severity.level, "kritisch");
        } finally {
            if (previousThresholds === undefined) {
                delete process.env.ALERT_THRESHOLDS;
            } else {
                process.env.ALERT_THRESHOLDS = previousThresholds;
            }
        }
    });
});

describe("getOperationLocationOrThrow", () => {
    test("fails when ACS send response has no operation-location header", () => {
        const sendResponse = {
            headers: {}
        };

        assert.throws(
            () => getOperationLocationOrThrow(sendResponse),
            /Operation-Location/
        );
    });

    test("returns operation-location when ACS send response contains the header", () => {
        const sendResponse = {
            headers: {
                "operation-location": "https://example.test/operations/123"
            }
        };

        const operationLocation = getOperationLocationOrThrow(sendResponse);

        assert.equal(operationLocation, "https://example.test/operations/123");
    });
});

describe("evaluateAcsPollingStatus", () => {
    test("returns done true and messageId for succeeded ACS polling status", () => {
        const pollResponse = {
            status: "Succeeded",
            id: "mail-123"
        };

        const result = evaluateAcsPollingStatus(pollResponse);

        assert.equal(result.done, true);
        assert.equal(result.messageId, "mail-123");
        assert.equal(result.status, "Succeeded");
    });

    test("throws when ACS polling status is failed", () => {
        const pollResponse = {
            status: "Failed"
        };

        assert.throws(
            () => evaluateAcsPollingStatus(pollResponse),
            /Status Failed/
        );
    });

    test("returns done false when ACS polling status is still in progress", () => {
        const pollResponse = {
            status: "Running"
        };

        const result = evaluateAcsPollingStatus(pollResponse);

        assert.equal(result.done, false);
        assert.equal(result.messageId, "");
        assert.equal(result.status, "Running");
    });
});

describe("getRetryAfterSeconds", () => {
    test("returns retry-after header value when it is a positive number", () => {
        const sendResponse = {
            headers: {
                "retry-after": "12"
            }
        };

        const retryAfter = getRetryAfterSeconds(sendResponse);

        assert.equal(retryAfter, 12);
    });

    test("returns default retry-after when header is missing", () => {
        const sendResponse = {
            headers: {}
        };

        const retryAfter = getRetryAfterSeconds(sendResponse);

        assert.equal(retryAfter, 5);
    });

    test("returns default retry-after when header is invalid", () => {
        const sendResponse = {
            headers: {
                "retry-after": "abc"
            }
        };

        const retryAfter = getRetryAfterSeconds(sendResponse);

        assert.equal(retryAfter, 5);
    });
});

describe("parseCommunicationConnectionString", () => {
    test("returns endpoint and accessKey from a valid ACS connection string", () => {
        const connectionString = "endpoint=https://example.communication.azure.com/;accesskey=abc123base64";

        const result = parseCommunicationConnectionString(connectionString);

        assert.equal(result.endpoint, "https://example.communication.azure.com/");
        assert.equal(result.accessKey, "abc123base64");
    });

    test("throws when endpoint or accesskey is missing", () => {
        const connectionString = "endpoint=https://example.communication.azure.com/;";

        assert.throws(
            () => parseCommunicationConnectionString(connectionString),
            /endpoint und accesskey/
        );
    });
});
