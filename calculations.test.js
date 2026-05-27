// calculations.test.js
// Unit tests for calculations.js

const assert = require('assert');
const { FinancialCalculator } = require('./calculations');

describe('FinancialCalculator', function() {
    it('should instantiate', function() {
        const calc = new FinancialCalculator();
        assert(calc);
    });
    it('should return null for empty returns', function() {
        const calc = new FinancialCalculator();
        const result = calc.annualizeReturn([], 12);
        assert.strictEqual(result, null);
    });
    it('should calculate cumulative return for valid monthly data', function() {
        const calc = new FinancialCalculator();
        const result = calc.cumulativeReturn([1, 2, -1]);
        const expected = ((1.01 * 1.02 * 0.99) - 1) * 100;
        assert(Math.abs(result - expected) < 0.000001);
    });
});
