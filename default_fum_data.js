const DEFAULT_FUM_DATASETS = {
    "2026-03-31": {
        date: "2026-03-31",
        values: {
            ESSDB: 13931.19,
            ESSSF: 12811.92,
            TAC: 20188.28,
            VMIA: 3904.15,
            VWA: 30284.74,
            VIF: 10248.29
        },
        objectives: {
            ESSDB: 4.00,
            ESSSF: 4.00,
            TAC: 4.00,
            VMIA: 4.00,
            VWA: 4.00,
            VIF: 4.00
        },
        rolling: {
            ESSDB: 8,
            ESSSF: 8,
            TAC: 8,
            VMIA: 8,
            VWA: 8,
            VIF: "inception"
        },
        inflationTypes: {
            ESSDB: "CPI",
            ESSSF: "CPI",
            TAC: "CPI",
            VMIA: "CPI",
            VWA: "CPI",
            VIF: "CPI"
        },
        savedAt: "2026-03-31T23:59:59.999Z",
        source: "Client Asset Allocation Report 31 March 2026.pdf"
    }
};