// calculations.test.js
// Unit tests for calculations.js

const assert = require('assert');
const { FinancialCalculator } = require('./calculations');

describe('FinancialCalculator', function() {
    it('should instantiate', function() {
        const calc = new FinancialCalculator();
        assert(calc);
    });
    it('should handle empty returns gracefully', function() {
        const calc = new FinancialCalculator();
        const result = calc.annualizeReturn([], 12);
        assert.strictEqual(result, 0);
    });
    // Add more edge case tests as needed
});
