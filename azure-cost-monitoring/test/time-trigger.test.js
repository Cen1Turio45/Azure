const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const { normalizeCostRows, buildReport, isValidUsageDate } = require("../src/functions/Time_Trigger");

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
            /Pflichtspalte PreTaxCost fehlt/
        );
    });

    test("fails when Cost Management response has no rows", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            []
        );

        assert.throws(
            () => normalizeCostRows(response),
            /keine Kostenzeilen/
        );
    });

    test("fails when PreTaxCost value is not numeric", () => {
        const response = buildCostResponse(
            ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
            [["not-a-number", "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
        );

        assert.throws(
            () => normalizeCostRows(response),
            /Ungueltiger PreTaxCost-Wert/
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
});
