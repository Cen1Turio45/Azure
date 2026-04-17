# Test der Funktion buildCost Response

const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeCostRows, isValidUsageDate } = require("../src/functions/Time_Trigger");

function buildCostResponse(columns, rows) {
    return {
        properties: {
            columns: columns.map((name) => ({ name })),
            rows
        }
    };
}

test("normalizeCostRows maps a valid Cost Management response", () => {
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

test("normalizeCostRows fails when PreTaxCost value is not numeric", () => {
    const response = buildCostResponse(
        ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
        [["not-a-number", "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
    );

    assert.throws(
        () => normalizeCostRows(response),
        /Ungueltiger PreTaxCost-Wert/
    );
});

test("normalizeCostRows fails when PreTaxCost value is empty", () => {
    const response = buildCostResponse(
        ["PreTaxCost", "ServiceName", "UsageDate", "Currency", "ResourceGroupName"],
        [["", "Azure Functions", "20260415", "EUR", "rg-cost-monitoring"]]
    );

    assert.throws(
        () => normalizeCostRows(response),
        /Ungueltiger PreTaxCost-Wert/
    );
});

test("isValidUsageDate rejects impossible dates", () => {
    assert.equal(isValidUsageDate("20260415"), true);
    assert.equal(isValidUsageDate("20269999"), false);
    assert.equal(isValidUsageDate("2026-04-15"), false);
});


