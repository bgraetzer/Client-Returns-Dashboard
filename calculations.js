// Financial calculations module
(function() {
    if (typeof document === 'undefined') return;
    const debugDiv = document.getElementById('debugInfo');
    if (debugDiv) debugDiv.innerHTML += '✓ calculations.js loaded<br>';
})();

class FinancialCalculator {
    constructor() {
        this.data = null;
        this.clients = [];
        this.fumValues = {};
    }

    /**
     * Annualize returns using compound growth formula
     */
    annualizeReturn(returns, periods) {
        if (!returns || returns.length === 0 || periods === 0) return null;

        // Require a full window with no missing values so annualisation isn't inflated
        if (returns.length !== periods) return null;

        const validReturns = returns.filter(r => r !== null && r !== undefined && !isNaN(r));
        if (validReturns.length !== periods) return null;

        let compoundedReturn = 1;
        for (let r of validReturns) {
            compoundedReturn *= (1 + r / 100);
        }

        const years = periods / 12;
        if (years <= 0) return null;

        return (Math.pow(compoundedReturn, 1 / years) - 1) * 100;
    }

    /**
     * Calculate simple average return
     */
    averageReturn(returns) {
        if (!returns || returns.length === 0) return null;
        const validReturns = returns.filter(r => r !== null && r !== undefined && !isNaN(r));
        if (validReturns.length === 0) return null;
        return validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
    }

    /**
     * Get returns for specific period
     */
    getReturnsForPeriod(allReturns, months) {
        if (!allReturns || allReturns.length === 0) return [];
        // Return the most recent 'months' worth of data
        return allReturns.slice(-months);
    }

    /**
     * Get Financial Year to Date returns (July 1 to current)
     */
    getFYTDReturns(allReturns, currentDate = new Date()) {
        if (!allReturns || allReturns.length === 0) return [];
        
        const currentMonth = currentDate.getMonth(); // 0-11
        const currentYear = currentDate.getFullYear();
        
        // Financial year starts in July (month 6)
        let monthsSinceJuly;
        if (currentMonth >= 6) {
            // We're past July in the current calendar year
            monthsSinceJuly = currentMonth - 6 + 1;
        } else {
            // We're before July, so FY started last calendar year
            monthsSinceJuly = 6 + currentMonth + 1;
        }
        
        return allReturns.slice(-monthsSinceJuly);
    }

    /**
     * Calculate performance metrics for all periods
     * @param {Array} actualReturns - Array of actual returns
     * @param {Array} benchmarkReturns - Array of benchmark returns
     * @param {number} asOfIndex - Optional index to calculate as of a specific date (default: latest)
     */
    calculatePerformanceMetrics(actualReturns, benchmarkReturns, asOfIndex = null) {
        // If asOfIndex is provided, slice the arrays to that point
        if (asOfIndex !== null && asOfIndex >= 0) {
            actualReturns = actualReturns.slice(0, asOfIndex + 1);
            benchmarkReturns = benchmarkReturns.slice(0, asOfIndex + 1);
        }
        const periods = {
            '1M': 1,
            '3M': 3,
            '6M': 6,
            '1Y': 12,
            '3Y': 36,
            '5Y': 60,
            '8Y': 96,
            '10Y': 120,
            'SI': actualReturns.length // Since Inception
        };

        const metrics = {};

        for (let [label, months] of Object.entries(periods)) {
            let actualPeriodReturns, benchmarkPeriodReturns;

            if (label === 'SI') {
                actualPeriodReturns = actualReturns;
                benchmarkPeriodReturns = benchmarkReturns;
            } else {
                actualPeriodReturns = this.getReturnsForPeriod(actualReturns, months);
                benchmarkPeriodReturns = this.getReturnsForPeriod(benchmarkReturns, months);
            }

            // For periods >= 1 year, annualize. For shorter periods, use simple return
            let actual, benchmark;
            
            if (months >= 12) {
                actual = this.annualizeReturn(actualPeriodReturns, actualPeriodReturns.length);
                benchmark = this.annualizeReturn(benchmarkPeriodReturns, benchmarkPeriodReturns.length);
            } else {
                // For periods < 1 year, show cumulative return
                actual = this.cumulativeReturn(actualPeriodReturns);
                benchmark = this.cumulativeReturn(benchmarkPeriodReturns);
            }

            const relative = (actual !== null && benchmark !== null) ? actual - benchmark : null;

            metrics[label] = {
                actual: actual,
                benchmark: benchmark,
                relative: relative,
                months: actualPeriodReturns.length
            };
        }

        // Add FYTD
        const fytdActual = this.getFYTDReturns(actualReturns);
        const fytdBenchmark = this.getFYTDReturns(benchmarkReturns);
        
        metrics['FYTD'] = {
            actual: this.cumulativeReturn(fytdActual),
            benchmark: this.cumulativeReturn(fytdBenchmark),
            relative: null,
            months: fytdActual.length
        };
        
        if (metrics['FYTD'].actual !== null && metrics['FYTD'].benchmark !== null) {
            metrics['FYTD'].relative = metrics['FYTD'].actual - metrics['FYTD'].benchmark;
        }

        return metrics;
    }

    /**
     * Calculate cumulative return (not annualized)
     */
    cumulativeReturn(returns) {
        if (!returns || returns.length === 0) return null;
        const validReturns = returns.filter(r => r !== null && r !== undefined && !isNaN(r));
        if (validReturns.length === 0) return null;
        
        let compoundedReturn = 1;
        for (let r of validReturns) {
            compoundedReturn *= (1 + r / 100);
        }
        return (compoundedReturn - 1) * 100;
    }

    /**
     * Calculate rolling returns
     */
    calculateRollingReturns(actualReturns, benchmarkReturns, windowMonths) {
        const rollingReturns = {
            dates: [],
            actual: [],
            benchmark: [],
            relative: []
        };

        if (actualReturns.length < windowMonths) {
            return rollingReturns;
        }

        // Calculate rolling window returns
        for (let i = windowMonths - 1; i < actualReturns.length; i++) {
            const actualWindow = actualReturns.slice(i - windowMonths + 1, i + 1);
            const benchmarkWindow = benchmarkReturns.slice(i - windowMonths + 1, i + 1);

            const actualAnnualized = this.annualizeReturn(actualWindow, windowMonths);
            const benchmarkAnnualized = this.annualizeReturn(benchmarkWindow, windowMonths);
            const relative = actualAnnualized !== null && benchmarkAnnualized !== null 
                ? actualAnnualized - benchmarkAnnualized 
                : null;

            rollingReturns.dates.push(i - windowMonths + 1);
            rollingReturns.actual.push(actualAnnualized);
            rollingReturns.benchmark.push(benchmarkAnnualized);
            rollingReturns.relative.push(relative);
        }

        return rollingReturns;
    }

    /**
     * Calculate weighted average returns across multiple clients
     */
    calculateWeightedReturns(clientsData, fumValues) {
        const totalFUM = Object.values(fumValues).reduce((sum, val) => sum + (val || 0), 0);
        
        if (totalFUM === 0) {
            return null;
        }

        const weightedMetrics = {};
        const periods = ['1M', '3M', 'FYTD', '6M', '1Y', '3Y', '5Y', '8Y', '10Y', 'SI'];

        for (let period of periods) {
            let weightedActual = 0;
            let weightedBenchmark = 0;
            let totalWeight = 0;

            for (let client in fumValues) {
                const fum = fumValues[client] || 0;
                if (fum > 0 && clientsData[client] && clientsData[client].metrics[period]) {
                    const weight = fum / totalFUM;
                    const actual = clientsData[client].metrics[period].actual;
                    const benchmark = clientsData[client].metrics[period].benchmark;

                    if (actual !== null) {
                        weightedActual += actual * weight;
                        totalWeight += weight;
                    }
                    if (benchmark !== null) {
                        weightedBenchmark += benchmark * weight;
                    }
                }
            }

            if (totalWeight > 0) {
                weightedMetrics[period] = {
                    actual: weightedActual,
                    benchmark: weightedBenchmark,
                    relative: weightedActual - weightedBenchmark
                };
            }
        }

        return weightedMetrics;
    }

    /**
     * Forecast future returns
     */
    forecastReturns(currentReturns, monthlyForecastReturn, forecastMonths) {
        const forecast = [];
        let compoundedValue = 1;

        // Compound existing returns
        for (let r of currentReturns) {
            if (r !== null && r !== undefined && !isNaN(r)) {
                compoundedValue *= (1 + r / 100);
            }
        }

        // Generate forecast
        const totalMonths = currentReturns.length + forecastMonths;
        
        for (let i = currentReturns.length; i < totalMonths; i++) {
            compoundedValue *= (1 + monthlyForecastReturn / 100);
            
            // Calculate rolling return for the forecast period
            const windowStart = Math.max(0, i - 95); // 96 month or 120 month window
            const windowLength = i - windowStart + 1;
            
            if (windowLength >= 96) {
                const annualized = (Math.pow(compoundedValue, 12 / windowLength) - 1) * 100;
                forecast.push({
                    month: i + 1,
                    value: annualized
                });
            }
        }

        return forecast;
    }

    /**
     * Calculate required return to achieve target outperformance
     */
    calculateRequiredReturn(benchmarkReturn, outperformanceTarget) {
        return benchmarkReturn + outperformanceTarget;
    }

    /**
     * Format return value for display
     */
    formatReturn(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'N/A';
        }
        return value.toFixed(decimals) + '%';
    }

    /**
     * Get return class for styling
     */
    getReturnClass(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'return-neutral';
        }
        if (value > 0) return 'return-positive';
        if (value < 0) return 'return-negative';
        return 'return-neutral';
    }

    /**
     * Get metric card class for styling
     */
    getMetricCardClass(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'neutral';
        }
        if (value > 0) return 'positive';
        if (value < 0) return 'negative';
        return 'neutral';
    }
}

// Export for use in other modules
const calculator = new FinancialCalculator();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FinancialCalculator, calculator };
}
