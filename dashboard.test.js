// dashboard.test.js
// Tests for Client Returns Dashboard logic and calculations

const assert = require('assert');
const { FinancialCalculator } = require('./calculations');

// Mock data for testing
const mockReturns = [2, 3, -1, 4, 0, 1, 2, 3, 2, 1, 0, -2]; // monthly returns in %
const mockBenchmark = [1, 2, 0, 3, 1, 0, 1, 2, 1, 0, 1, -1];

function approxEqual(a, b, tol = 0.01) {
    return Math.abs(a - b) < tol;
}

describe('FinancialCalculator', function() {
    it('should annualize returns correctly', function() {
        const calc = new FinancialCalculator();
        const annualized = calc.annualizeReturn(mockReturns, 12);
        // Manually calculated expected value
        const expected = (Math.pow(mockReturns.reduce((acc, r) => acc * (1 + r/100), 1), 12/12) - 1) * 100;
        assert(approxEqual(annualized, expected));
    });

    it('should calculate performance metrics', function() {
        const calc = new FinancialCalculator();
        const metrics = calc.calculatePerformanceMetrics(mockReturns, mockBenchmark);
        assert(metrics.hasOwnProperty('annualizedReturn'));
        assert(metrics.hasOwnProperty('relativeReturn'));
        assert(typeof metrics.annualizedReturn === 'number');
        assert(typeof metrics.relativeReturn === 'number');
    });
});

// Add more tests for dashboard.js logic as needed
