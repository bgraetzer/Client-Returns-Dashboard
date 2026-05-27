// Main dashboard JavaScript (rebuilt)
(function() {
    try {
        const debugDiv = document.getElementById('debugInfo');
        if (debugDiv) debugDiv.innerHTML += '✓ dashboard.js loaded<br>';
    } catch (e) {
        alert('Error in dashboard.js debug: ' + e.message);
    }
})();

// VIF inception date: September 2023 (index 440 in dates array)
const VIF_INCEPTION_INDEX = 440; // 2023-09-30

// Define explicit client order for display
const CLIENT_ORDER = ['ESSDB', 'ESSSF', 'TAC', 'VMIA', 'VWA', 'VIF'];

let globalData = {
    clients: {},
    dates: [],
    rawData: null,
    selectedClient: null,
    rollingObjective: 8,
    fumValues: {},
    clientRollingObjectives: {},
    clientInflationTypes: {},
    charts: {},
    forecastResults: null,
    forecastQuarters: []
};

const FORECAST_DATA_LIBRARY_KEY = 'forecastDataLibrary';

function seedDefaultFUMDatasets() {
    if (typeof DEFAULT_FUM_DATASETS === 'undefined' || !DEFAULT_FUM_DATASETS) return;

    const existing = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
    const merged = { ...existing };
    let hasChanges = false;

    for (const [date, dataset] of Object.entries(DEFAULT_FUM_DATASETS)) {
        const currentDataset = existing[date];
        const currentSignature = currentDataset ? JSON.stringify(currentDataset) : null;
        const incomingSignature = JSON.stringify(dataset);

        if (currentSignature !== incomingSignature) {
            merged[date] = dataset;
            hasChanges = true;
        }
    }

    if (hasChanges) {
        localStorage.setItem('clientFUMDatasets', JSON.stringify(merged));
    }
}

// ---------- Helpers ----------
function formatReturn(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return `${value.toFixed(2)}%`;
}

function getReturnClass(value) {
    if (value === null || value === undefined || isNaN(value)) return 'neutral';
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
}

function getMetricCardClass(value) {
    const cls = getReturnClass(value);
    return cls === 'neutral' ? '' : cls;
}

function annualToQuarterlyCompounded(annualPercent) {
    return (Math.pow(1 + annualPercent / 100, 1 / 4) - 1) * 100;
}

function quarterlyToMonthlyCompounded(quarterlyPercent) {
    return (Math.pow(1 + quarterlyPercent / 100, 1 / 3) - 1) * 100;
}

function quarterlyToAnnualCompounded(quarterlyPercent) {
    return (Math.pow(1 + quarterlyPercent / 100, 4) - 1) * 100;
}

function annualToMonthlyCompounded(annualPercent) {
    return (Math.pow(1 + annualPercent / 100, 1 / 12) - 1) * 100;
}

function getBenchmarkMonthlyReturn(quarterlyInflationPercent, objectiveAnnualPercent) {
    const objectiveMonthly = annualToMonthlyCompounded(objectiveAnnualPercent);
    const inflationMonthly = quarterlyToMonthlyCompounded(quarterlyInflationPercent);
    return objectiveMonthly + inflationMonthly;
}

function parseNumberOrDefault(value, defaultValue) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseDashboardDate(dateValue) {
    if (!dateValue) return null;
    const normalized = typeof dateValue === 'string' ? dateValue.replace(' ', 'T') : dateValue;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLastActualDataDate() {
    if (!Array.isArray(globalData.dates) || globalData.dates.length === 0) return null;
    return parseDashboardDate(globalData.dates[globalData.dates.length - 1]);
}

function getForecastAnchorDate() {
    return getLastActualDataDate() || parseDashboardDate(document.getElementById('fumDate')?.value) || new Date();
}

function getLatestActualDateInputValue() {
    const latestActualDate = getLastActualDataDate();
    return latestActualDate ? latestActualDate.toISOString().split('T')[0] : '';
}

function setFUMDateToLatestActualDate() {
    const dateInput = document.getElementById('fumDate');
    if (!dateInput) return;

    const latestActualDateValue = getLatestActualDateInputValue();
    if (latestActualDateValue) {
        dateInput.value = latestActualDateValue;
    }
}

// ---------- UI population ----------
function populateClientSelector() {
    // Legacy function - no longer used
    // Detailed Client Analysis section has been removed
}

function populateHistoricalClientSelector() {
    const select = document.getElementById('historicalClientSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Select a client --</option>';
    select.innerHTML += '<option value="ALL">All Clients (FUM Weighted)</option>';
    
    for (let clientName in globalData.clients) {
        const option = document.createElement('option');
        option.value = clientName;
        option.textContent = clientName;
        select.appendChild(option);
    }
}

function populateFUMInputs() {
    const container = document.getElementById('fumInputs');
    container.innerHTML = '';
    
    // Iterate through clients in defined order
    const clientsToDisplay = CLIENT_ORDER.filter(name => globalData.clients[name]);
    for (let clientName of clientsToDisplay) {
        const div = document.createElement('div');
        div.className = 'fum-input';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.gap = '8px';

        const label = document.createElement('label');
        label.textContent = clientName;
        label.style.fontWeight = '600';
        label.style.marginBottom = '5px';

        const fumInput = document.createElement('input');
        fumInput.type = 'number';
        fumInput.id = `fum-${clientName}`;
        fumInput.placeholder = 'FUM ($M)';
        fumInput.step = '0.01';
        fumInput.value = globalData.fumValues[clientName] || '';
        fumInput.addEventListener('change', function() {
            globalData.fumValues[clientName] = parseFloat(this.value) || 0;
            saveFUMData();
        });
        
        const select = document.createElement('select');
        select.id = `rolling-${clientName}`;
        select.style.width = '100%';
        select.style.padding = '8px';
        select.style.fontSize = '14px';
        select.style.borderRadius = '4px';
        select.style.border = '1px solid #ced4da';
        
        // VIF uses "Since Inception" instead of rolling years
        if (clientName === 'VIF') {
            select.innerHTML = '<option value="inception">Since Inception</option>';
            select.value = 'inception';
            select.disabled = true;
            globalData.clientRollingObjectives[clientName] = 'inception';
        } else {
            select.innerHTML = '<option value="8">8 Years</option><option value="10">10 Years</option>';
            select.value = globalData.clientRollingObjectives[clientName] || '8';
            select.addEventListener('change', () => {
                globalData.clientRollingObjectives[clientName] = parseInt(select.value);
                saveFUMData();
            });
        }

        const objectiveInput = document.createElement('input');
        objectiveInput.type = 'number';
        objectiveInput.id = `objective-${clientName}`;
        objectiveInput.placeholder = 'Objective % p.a.';
        objectiveInput.step = '0.01';
        objectiveInput.value = '4.00';
        objectiveInput.addEventListener('change', () => {
            saveFUMData();
            updateForecastObjectiveDisplays();
        });

        const inflationTypeSelect = document.createElement('select');
        inflationTypeSelect.id = `inflation-type-${clientName}`;
        inflationTypeSelect.style.width = '100%';
        inflationTypeSelect.style.padding = '8px';
        inflationTypeSelect.style.fontSize = '14px';
        inflationTypeSelect.style.borderRadius = '4px';
        inflationTypeSelect.style.border = '1px solid #ced4da';
        inflationTypeSelect.innerHTML = '<option value="CPI">CPI</option><option value="WPI">WPI</option><option value="AWE">AWE</option>';
        inflationTypeSelect.value = globalData.clientInflationTypes[clientName] || 'CPI';
        inflationTypeSelect.addEventListener('change', () => {
            globalData.clientInflationTypes[clientName] = inflationTypeSelect.value;
            saveFUMData();
        });

        div.appendChild(label);
        div.appendChild(fumInput);
        div.appendChild(select);
        div.appendChild(objectiveInput);
        div.appendChild(inflationTypeSelect);
        container.appendChild(div);
    }
}

function populateClientForecastInputs() {
    // No longer needed - using global inputs instead
}

function populateObjectiveInputs() {
    // Legacy function - no longer used
    // Objectives are now part of the FUM inputs section
}

// ---------- Main table ----------
function populatePerformanceDateSelector() {
    const select = document.getElementById('performanceAsOfDate');
    if (!select || !globalData.dates || globalData.dates.length === 0) return;
    
    select.innerHTML = '';
    
    // Populate with dates from most recent to oldest
    for (let i = globalData.dates.length - 1; i >= 0; i--) {
        const dateStr = globalData.dates[i];
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            select.appendChild(option);
        }
    }
    
    // Default to the latest date
    select.value = globalData.dates.length - 1;
}

function updatePerformanceDate() {
    updateMainTable();
}

function populateFutureDateSelector() {
    const select = document.getElementById('futurePerformanceDate');
    if (!select) {
        console.error('futurePerformanceDate selector not found');
        return;
    }
    
    if (!globalData.forecastQuarters || globalData.forecastQuarters.length === 0) {
        console.error('No forecast quarters available');
        return;
    }
    
    select.innerHTML = '';
    
    // Populate with forecast quarter dates
    for (let i = 0; i < globalData.forecastQuarters.length; i++) {
        const quarter = globalData.forecastQuarters[i];
        const option = document.createElement('option');
        option.value = i;
        option.textContent = quarter.label;
        select.appendChild(option);
    }
    
    // Default to the first forecast quarter after the latest actual return month
    if (select.options.length > 0) {
        select.selectedIndex = 0;
    }
}

function updateFuturePerformanceTable() {
    const tbody = document.getElementById('futurePerformanceTableBody');
    if (!tbody) {
        alert('Error: Cannot find futurePerformanceTableBody element');
        return;
    }
    tbody.innerHTML = '';
    
    const dateSelect = document.getElementById('futurePerformanceDate');
    if (!dateSelect) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #dc3545;">⚠️ Error: Date selector not found. Please click "Generate Quarterly Rolling Forecast" first.</td></tr>';
        return;
    }
    
    if (!globalData.forecastResults || !globalData.forecastQuarters) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #dc3545;">⚠️ No forecast data available. Please click "Generate Quarterly Rolling Forecast" button above.</td></tr>';
        return;
    }
    
    const quarterIndex = parseInt(dateSelect.value);
    if (isNaN(quarterIndex) || quarterIndex < 0 || quarterIndex >= globalData.forecastQuarters.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #dc3545;">⚠️ Invalid quarter selected (index: ' + dateSelect.value + '). Please select a valid forecast date.</td></tr>';
        return;
    }
    
    // FUM projections assume the entered FUM is already at the latest actual month-end,
    // so only forecast returns are compounded from that base.
    const monthsToForecast = globalData.forecastQuarters[quarterIndex].monthsFromNow;
    const assumptions = globalData.forecastAssumptions;
    
    // Track totals for weighted average row
    let totalFUM = 0;
    let weightedPerformance = 0;
    let weightedTarget = 0;
    let weightedRelative = 0;
    let validClients = 0;

    // Client rows - iterate in defined order
    const clientsToDisplay = CLIENT_ORDER.filter(name => globalData.clients[name]);
    for (let clientName of clientsToDisplay) {
        const client = globalData.clients[clientName];
        const row = document.createElement('tr');

        // Client name
        const nameCell = document.createElement('td');
        nameCell.textContent = clientName;
        nameCell.style.fontWeight = '600';
        row.appendChild(nameCell);

        // Calculate FUM growth based on cumulative actual returns
        const baseFUM = globalData.fumValues[clientName] || 0;
        let cumulativeReturn = 1.0;
        
        // Build the returns up to this forecast quarter
        const clientAssumptions = assumptions[clientName];
        if (clientAssumptions) {
            let monthsAdded = 0;
            while (monthsAdded < monthsToForecast) {
                const currentQuarter = Math.floor(monthsAdded / 3);
                let quarterlyActual;
                
                if (currentQuarter < 8) {
                    quarterlyActual = clientAssumptions.actualQuarters[currentQuarter];
                } else {
                    quarterlyActual = annualToQuarterlyCompounded(clientAssumptions.actualLongTerm);
                }
                
                const actualMonthly = quarterlyToMonthlyCompounded(quarterlyActual);
                
                for (let m = 0; m < 3 && monthsAdded < monthsToForecast; m++) {
                    cumulativeReturn *= (1 + actualMonthly / 100);
                    monthsAdded++;
                }
            }
        }
        
        const forecastFUM = baseFUM * cumulativeReturn;
        const fumCell = document.createElement('td');
        fumCell.textContent = forecastFUM.toFixed(1);
        fumCell.style.textAlign = 'center';
        row.appendChild(fumCell);

        // Objective Horizon (years or "Since Inception")
        const horizonYears = globalData.clientRollingObjectives[clientName];
        const horizonCell = document.createElement('td');
        if (clientName === 'VIF' || horizonYears === 'inception') {
            horizonCell.textContent = 'Since Inception';
        } else {
            horizonCell.textContent = horizonYears || 8;
        }
        horizonCell.style.textAlign = 'center';
        row.appendChild(horizonCell);

        // Get performance and target from forecast results
        const forecastData = globalData.forecastResults[clientName];
        if (forecastData && forecastData[quarterIndex]) {
            const performancePA = forecastData[quarterIndex].actual;
            const targetReturn = forecastData[quarterIndex].benchmark;
            const relativeReturn = forecastData[quarterIndex].relative;
            
            // Performance Net of Fees % p.a.
            const perfCell = document.createElement('td');
            perfCell.textContent = performancePA !== null ? performancePA.toFixed(1) : 'N/A';
            perfCell.style.textAlign = 'center';
            perfCell.style.fontWeight = '600';
            if (performancePA !== null) {
                perfCell.style.color = performancePA >= 0 ? '#10b981' : '#ef4444';
            }
            row.appendChild(perfCell);

            // Target Return per Objective % p.a.
            const targetCell = document.createElement('td');
            targetCell.textContent = targetReturn !== null ? targetReturn.toFixed(1) : 'N/A';
            targetCell.style.textAlign = 'center';
            row.appendChild(targetCell);

            // Relative Return
            const relativeCell = document.createElement('td');
            relativeCell.textContent = relativeReturn !== null ? relativeReturn.toFixed(1) : 'N/A';
            relativeCell.style.textAlign = 'center';
            relativeCell.style.fontWeight = '600';
            if (relativeReturn !== null) {
                relativeCell.style.color = relativeReturn >= 0 ? '#10b981' : '#ef4444';
            }
            row.appendChild(relativeCell);

            // Investment Objective
            const objectiveInput = document.getElementById(`objective-${clientName}`);
            const objectiveValue = objectiveInput ? parseNumberOrDefault(objectiveInput.value, 4.0) : 4.0;
            const inflationType = globalData.clientInflationTypes[clientName] || 'CPI';
            let objectiveText;
            if (clientName === 'VIF' || horizonYears === 'inception') {
                objectiveText = `${inflationType} + ${objectiveValue.toFixed(2)}% p.a. since inception`;
            } else {
                objectiveText = `${inflationType} + ${objectiveValue.toFixed(2)}% p.a. over rolling ${horizonYears === 8 ? 'eight' : 'ten'} year periods`;
            }
            const objCell = document.createElement('td');
            objCell.textContent = objectiveText;
            row.appendChild(objCell);

            // Probability Hurdle
            const hurdleCell = document.createElement('td');
            hurdleCell.textContent = '60%';
            hurdleCell.style.textAlign = 'center';
            row.appendChild(hurdleCell);

            tbody.appendChild(row);

            // Accumulate weighted totals
            if (forecastFUM > 0 && performancePA !== null && targetReturn !== null && relativeReturn !== null) {
                totalFUM += forecastFUM;
                weightedPerformance += performancePA * forecastFUM;
                weightedTarget += targetReturn * forecastFUM;
                weightedRelative += relativeReturn * forecastFUM;
                validClients++;
            }
        }
    }

    // Add FUM-weighted total row
    if (totalFUM > 0 && validClients > 0) {
        const totalRow = document.createElement('tr');
        totalRow.style.borderTop = '3px solid #6c757d';
        totalRow.style.backgroundColor = '#f8f9fa';
        totalRow.style.fontWeight = '700';

        const totalLabelCell = document.createElement('td');
        totalLabelCell.textContent = 'TOTAL (FUM Weighted)';
        totalLabelCell.style.fontWeight = '700';
        totalRow.appendChild(totalLabelCell);

        const totalFUMCell = document.createElement('td');
        totalFUMCell.textContent = totalFUM.toFixed(1);
        totalFUMCell.style.textAlign = 'center';
        totalRow.appendChild(totalFUMCell);

        const blankHorizonCell = document.createElement('td');
        blankHorizonCell.textContent = '-';
        blankHorizonCell.style.textAlign = 'center';
        totalRow.appendChild(blankHorizonCell);

        const avgPerformance = weightedPerformance / totalFUM;
        const avgPerfCell = document.createElement('td');
        avgPerfCell.textContent = avgPerformance.toFixed(1);
        avgPerfCell.style.textAlign = 'center';
        avgPerfCell.style.fontWeight = '700';
        avgPerfCell.style.color = avgPerformance >= 0 ? '#10b981' : '#ef4444';
        totalRow.appendChild(avgPerfCell);

        const avgTarget = weightedTarget / totalFUM;
        const avgTargetCell = document.createElement('td');
        avgTargetCell.textContent = avgTarget.toFixed(1);
        avgTargetCell.style.textAlign = 'center';
        totalRow.appendChild(avgTargetCell);

        const avgRelative = weightedRelative / totalFUM;
        const avgRelativeCell = document.createElement('td');
        avgRelativeCell.textContent = avgRelative.toFixed(1);
        avgRelativeCell.style.textAlign = 'center';
        avgRelativeCell.style.fontWeight = '700';
        avgRelativeCell.style.color = avgRelative >= 0 ? '#10b981' : '#ef4444';
        totalRow.appendChild(avgRelativeCell);

        const blankObjCell = document.createElement('td');
        blankObjCell.textContent = '-';
        totalRow.appendChild(blankObjCell);

        const blankHurdleCell = document.createElement('td');
        blankHurdleCell.textContent = '-';
        blankHurdleCell.style.textAlign = 'center';
        totalRow.appendChild(blankHurdleCell);

        tbody.appendChild(totalRow);
    }
}

function updateMainTable() {
    const tbody = document.getElementById('mainPerformanceTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Get selected as-of date index
    const dateSelect = document.getElementById('performanceAsOfDate');
    const asOfDateIndex = dateSelect ? parseInt(dateSelect.value) : globalData.dates.length - 1;

    // Collect FUM values
    for (let clientName in globalData.clients) {
        const input = document.getElementById(`fum-${clientName}`);
        if (input) {
            globalData.fumValues[clientName] = parseFloat(input.value) || 0;
        }
    }

    // Track totals for weighted average row
    let totalFUM = 0;
    let weightedPerformance = 0;
    let weightedTarget = 0;
    let weightedRelative = 0;
    let validClients = 0;

    // Client rows - iterate in defined order
    const clientsToDisplay = CLIENT_ORDER.filter(name => globalData.clients[name]);
    for (let clientName of clientsToDisplay) {
        const client = globalData.clients[clientName];
        const row = document.createElement('tr');

        // Client name
        const nameCell = document.createElement('td');
        nameCell.textContent = clientName;
        nameCell.style.fontWeight = '600';
        row.appendChild(nameCell);

        // FUM ($M)
        const fumValue = globalData.fumValues[clientName] || 0;
        const fumCell = document.createElement('td');
        fumCell.textContent = fumValue.toFixed(1);
        fumCell.style.textAlign = 'center';
        row.appendChild(fumCell);

        // Objective Horizon (years or "Since Inception")
        const horizonYears = globalData.clientRollingObjectives[clientName];
        const horizonCell = document.createElement('td');
        if (clientName === 'VIF' || horizonYears === 'inception') {
            horizonCell.textContent = 'Since Inception';
        } else {
            horizonCell.textContent = horizonYears || 8;
        }
        horizonCell.style.textAlign = 'center';
        row.appendChild(horizonCell);

        // Performance Net of Fees % p.a. (based on objective horizon)
        let actualForPeriod, performancePA;
        if (clientName === 'VIF' || horizonYears === 'inception') {
            // VIF: Calculate from inception (Sep 2023) to selected date
            const actualReturns = client.actual.slice(VIF_INCEPTION_INDEX, asOfDateIndex + 1);
            actualForPeriod = actualReturns;
            performancePA = calculator.annualizeReturn(actualForPeriod, actualForPeriod.length);
        } else {
            const horizonMonths = (horizonYears || 8) * 12;
            const actualReturns = client.actual.slice(0, asOfDateIndex + 1);
            actualForPeriod = actualReturns.slice(-horizonMonths);
            performancePA = calculator.annualizeReturn(actualForPeriod, actualForPeriod.length);
        }
        
        const perfCell = document.createElement('td');
        perfCell.textContent = performancePA !== null ? performancePA.toFixed(1) : 'N/A';
        perfCell.style.textAlign = 'center';
        perfCell.style.fontWeight = '600';
        if (performancePA !== null) {
            perfCell.style.color = performancePA >= 0 ? '#10b981' : '#ef4444';
        }
        row.appendChild(perfCell);

        // Target Return per Objective % p.a. (calculated from historical benchmark)
        let benchmarkForPeriod, targetReturn;
        if (clientName === 'VIF' || horizonYears === 'inception') {
            // VIF: Calculate from inception to selected date
            const benchmarkReturns = client.benchmark.slice(VIF_INCEPTION_INDEX, asOfDateIndex + 1);
            benchmarkForPeriod = benchmarkReturns;
            targetReturn = calculator.annualizeReturn(benchmarkForPeriod, benchmarkForPeriod.length);
        } else {
            const horizonMonths = (horizonYears || 8) * 12;
            const benchmarkReturns = client.benchmark.slice(0, asOfDateIndex + 1);
            benchmarkForPeriod = benchmarkReturns.slice(-horizonMonths);
            targetReturn = calculator.annualizeReturn(benchmarkForPeriod, benchmarkForPeriod.length);
        }
        const targetCell = document.createElement('td');
        targetCell.textContent = targetReturn !== null ? targetReturn.toFixed(1) : 'N/A';
        targetCell.style.textAlign = 'center';
        row.appendChild(targetCell);

        // Relative Return (Performance - Target)
        const relativeReturn = (performancePA !== null && targetReturn !== null) ? performancePA - targetReturn : null;
        const relativeCell = document.createElement('td');
        relativeCell.textContent = relativeReturn !== null ? relativeReturn.toFixed(1) : 'N/A';
        relativeCell.style.textAlign = 'center';
        relativeCell.style.fontWeight = '600';
        if (relativeReturn !== null) {
            relativeCell.style.color = relativeReturn >= 0 ? '#10b981' : '#ef4444';
        }
        row.appendChild(relativeCell);

        // Investment Objective
        const objectiveInput = document.getElementById(`objective-${clientName}`);
        const objectiveValue = objectiveInput ? parseNumberOrDefault(objectiveInput.value, 4.0) : 4.0;
        const inflationType = globalData.clientInflationTypes[clientName] || 'CPI';
        let objectiveText;
        if (clientName === 'VIF' || horizonYears === 'inception') {
            objectiveText = `${inflationType} + ${objectiveValue.toFixed(2)}% p.a. since inception`;
        } else {
            objectiveText = `${inflationType} + ${objectiveValue.toFixed(2)}% p.a. over rolling ${horizonYears === 8 ? 'eight' : 'ten'} year periods`;
        }
        const objCell = document.createElement('td');
        objCell.textContent = objectiveText;
        row.appendChild(objCell);

        // Probability Hurdle
        const hurdleCell = document.createElement('td');
        hurdleCell.textContent = '60%';
        hurdleCell.style.textAlign = 'center';
        row.appendChild(hurdleCell);

        tbody.appendChild(row);

        // Accumulate weighted totals
        if (fumValue > 0 && performancePA !== null && targetReturn !== null && relativeReturn !== null) {
            totalFUM += fumValue;
            weightedPerformance += performancePA * fumValue;
            weightedTarget += targetReturn * fumValue;
            weightedRelative += relativeReturn * fumValue;
            validClients++;
        }
    }

    // Add FUM-weighted total row
    if (totalFUM > 0 && validClients > 0) {
        const totalRow = document.createElement('tr');
        totalRow.style.borderTop = '3px solid #6c757d';
        totalRow.style.backgroundColor = '#f8f9fa';
        totalRow.style.fontWeight = '700';

        // Total label
        const totalLabelCell = document.createElement('td');
        totalLabelCell.textContent = 'TOTAL (FUM Weighted)';
        totalLabelCell.style.fontWeight = '700';
        totalRow.appendChild(totalLabelCell);

        // Total FUM
        const totalFUMCell = document.createElement('td');
        totalFUMCell.textContent = totalFUM.toFixed(1);
        totalFUMCell.style.textAlign = 'center';
        totalRow.appendChild(totalFUMCell);

        // Horizon (blank for total row)
        const blankHorizonCell = document.createElement('td');
        blankHorizonCell.textContent = '-';
        blankHorizonCell.style.textAlign = 'center';
        totalRow.appendChild(blankHorizonCell);

        // Weighted Performance
        const avgPerformance = weightedPerformance / totalFUM;
        const avgPerfCell = document.createElement('td');
        avgPerfCell.textContent = avgPerformance.toFixed(1);
        avgPerfCell.style.textAlign = 'center';
        avgPerfCell.style.fontWeight = '700';
        avgPerfCell.style.color = avgPerformance >= 0 ? '#10b981' : '#ef4444';
        totalRow.appendChild(avgPerfCell);

        // Weighted Target
        const avgTarget = weightedTarget / totalFUM;
        const avgTargetCell = document.createElement('td');
        avgTargetCell.textContent = avgTarget.toFixed(1);
        avgTargetCell.style.textAlign = 'center';
        totalRow.appendChild(avgTargetCell);

        // Weighted Relative Return
        const avgRelative = weightedRelative / totalFUM;
        const avgRelativeCell = document.createElement('td');
        avgRelativeCell.textContent = avgRelative.toFixed(1);
        avgRelativeCell.style.textAlign = 'center';
        avgRelativeCell.style.fontWeight = '700';
        avgRelativeCell.style.color = avgRelative >= 0 ? '#10b981' : '#ef4444';
        totalRow.appendChild(avgRelativeCell);

        // Investment Objective (blank for total row)
        const blankObjCell = document.createElement('td');
        blankObjCell.textContent = '-';
        totalRow.appendChild(blankObjCell);

        // Probability Hurdle (blank for total row)
        const blankHurdleCell = document.createElement('td');
        blankHurdleCell.textContent = '-';
        blankHurdleCell.style.textAlign = 'center';
        totalRow.appendChild(blankHurdleCell);

        tbody.appendChild(totalRow);
    }
}

// ---------- Rolling chart ----------
function updateDashboard() {
    // Legacy function - no longer used
    // Detailed Client Analysis section has been removed
}

function updateHistoricalRollingReturnsChart() {
    const selectedValue = document.getElementById('historicalClientSelect').value;
    if (!selectedValue) return;
    
    if (globalData.charts.rolling) {
        globalData.charts.rolling.destroy();
    }
    
    const ctx = document.getElementById('rollingReturnsChart').getContext('2d');
    
    if (selectedValue === 'ALL') {
        // Calculate FUM-weighted aggregate using each client's individual rolling window
        const clientNames = Object.keys(globalData.clients);
        
        // Find the maximum data length across all clients
        let maxLength = 0;
        for (let clientName of clientNames) {
            const client = globalData.clients[clientName];
            if (client.actual.length > maxLength) maxLength = client.actual.length;
        }
        
        // For each time point, calculate weighted aggregate
        const aggregateActual = [];
        const aggregateBenchmark = [];
        const aggregateRelative = [];
        const dateLabels = [];
        
        // Determine the minimum rolling window needed (maximum across clients for alignment)
        let maxRollingMonths = 0;
        for (let clientName of clientNames) {
            const clientRollingYears = globalData.clientRollingObjectives[clientName] || 8;
            const rollingMonths = clientRollingYears * 12;
            if (rollingMonths > maxRollingMonths) maxRollingMonths = rollingMonths;
        }
        
        // Start from the point where we have enough data for the longest rolling window
        for (let endIdx = maxRollingMonths - 1; endIdx < maxLength; endIdx++) {
            let totalWeight = 0;
            let weightedActual = 0;
            let weightedBenchmark = 0;
            
            for (let clientName of clientNames) {
                const fum = globalData.fumValues[clientName] || 0;
                if (fum <= 0) continue;
                
                const client = globalData.clients[clientName];
                const clientRollingYears = globalData.clientRollingObjectives[clientName];
                
                let actualAnnualized, benchmarkAnnualized;
                
                if (clientName === 'VIF' || clientRollingYears === 'inception') {
                    // VIF: Calculate since inception to current endIdx
                    if (endIdx < VIF_INCEPTION_INDEX) continue;
                    
                    const actualReturns = client.actual.slice(VIF_INCEPTION_INDEX, endIdx + 1);
                    const benchmarkReturns = client.benchmark.slice(VIF_INCEPTION_INDEX, endIdx + 1);
                    const months = endIdx - VIF_INCEPTION_INDEX + 1;
                    
                    actualAnnualized = calculator.annualizeReturn(actualReturns, months);
                    benchmarkAnnualized = calculator.annualizeReturn(benchmarkReturns, months);
                } else {
                    // Normal rolling period
                    const rollingMonths = (clientRollingYears || 8) * 12;
                    
                    // Check if we have enough data for this client's rolling window
                    if (endIdx < rollingMonths - 1 || endIdx >= client.actual.length) continue;
                    
                    const startIdx = endIdx - rollingMonths + 1;
                    
                    // Calculate this client's rolling return
                    let actualProduct = 1.0;
                    let benchmarkProduct = 1.0;
                    for (let i = startIdx; i <= endIdx; i++) {
                        if (client.actual[i] !== null && client.actual[i] !== undefined) {
                            actualProduct *= (1 + client.actual[i] / 100);
                        }
                        if (client.benchmark[i] !== null && client.benchmark[i] !== undefined) {
                            benchmarkProduct *= (1 + client.benchmark[i] / 100);
                        }
                    }
                    
                    actualAnnualized = (Math.pow(actualProduct, 12 / rollingMonths) - 1) * 100;
                    benchmarkAnnualized = (Math.pow(benchmarkProduct, 12 / rollingMonths) - 1) * 100;
                }
                
                if (actualAnnualized !== null && benchmarkAnnualized !== null) {
                    weightedActual += actualAnnualized * fum;
                    weightedBenchmark += benchmarkAnnualized * fum;
                    totalWeight += fum;
                }
            }
            
            if (totalWeight > 0) {
                aggregateActual.push(weightedActual / totalWeight);
                aggregateBenchmark.push(weightedBenchmark / totalWeight);
                aggregateRelative.push((weightedActual / totalWeight) - (weightedBenchmark / totalWeight));
                
                // Use the date label
                const dateStr = globalData.dates[endIdx];
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        dateLabels.push(date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }));
                    } else {
                        dateLabels.push(`Period ${endIdx + 1}`);
                    }
                } else {
                    dateLabels.push(`Period ${endIdx + 1}`);
                }
            }
        }
        
        globalData.charts.rolling = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: [
                    { label: 'Actual', data: aggregateActual, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: false },
                    { label: 'Benchmark', data: aggregateBenchmark, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: false },
                    { label: 'Relative', data: aggregateRelative, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.4, fill: false },
                    { label: '', data: Array(dateLabels.length).fill(0), borderColor: '#000000', borderWidth: 3, pointRadius: 0, fill: false, tension: 0, order: 10 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: `Historical Blended Rolling Returns - All Clients (FUM Weighted)`, font: { size: 16, weight: 'bold' } },
                    legend: { display: true, position: 'top' },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}%` } }
                },
                scales: {
                    y: { title: { display: true, text: 'Annualized Return (%)' }, ticks: { callback: (v) => `${v.toFixed(1)}%` } },
                    x: { title: { display: true, text: 'Month End' }, ticks: { maxRotation: 45, minRotation: 45 } }
                }
            }
        });
    } else {
        // Individual client
        const clientName = selectedValue;
        const client = globalData.clients[clientName];
        if (!client) return;
        
        const clientRollingYears = globalData.clientRollingObjectives[clientName];
        let rollingData, dateLabels, chartTitle;
        
        if (clientName === 'VIF' || clientRollingYears === 'inception') {
            // VIF: Calculate since inception (cumulative annualized returns)
            const actualData = [];
            const benchmarkData = [];
            const relativeData = [];
            const labels = [];
            
            for (let endIdx = VIF_INCEPTION_INDEX; endIdx < client.actual.length; endIdx++) {
                const actualReturns = client.actual.slice(VIF_INCEPTION_INDEX, endIdx + 1);
                const benchmarkReturns = client.benchmark.slice(VIF_INCEPTION_INDEX, endIdx + 1);
                const months = endIdx - VIF_INCEPTION_INDEX + 1;
                
                const actualAnnualized = calculator.annualizeReturn(actualReturns, months);
                const benchmarkAnnualized = calculator.annualizeReturn(benchmarkReturns, months);
                
                actualData.push(actualAnnualized);
                benchmarkData.push(benchmarkAnnualized);
                relativeData.push(actualAnnualized !== null && benchmarkAnnualized !== null ? actualAnnualized - benchmarkAnnualized : null);
                
                const dateStr = globalData.dates[endIdx];
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        labels.push(date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }));
                    } else {
                        labels.push(`Period ${endIdx + 1}`);
                    }
                } else {
                    labels.push(`Period ${endIdx + 1}`);
                }
            }
            
            rollingData = { actual: actualData, benchmark: benchmarkData, relative: relativeData };
            dateLabels = labels;
            chartTitle = `Historical Since Inception Returns - ${clientName}`;
        } else {
            // Normal rolling period
            const windowMonths = (clientRollingYears || 8) * 12;
            rollingData = calculator.calculateRollingReturns(client.actual, client.benchmark, windowMonths);
            dateLabels = rollingData.dates.map(index => {
                const dateStr = globalData.dates[index + windowMonths - 1];
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                }
                return `Period ${index + 1}`;
            });
            chartTitle = `Historical Rolling ${clientRollingYears} Year Returns - ${clientName}`;
        }

        globalData.charts.rolling = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: [
                    { label: 'Actual', data: rollingData.actual, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: false },
                    { label: 'Benchmark', data: rollingData.benchmark, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: false },
                    { label: 'Relative', data: rollingData.relative, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.4, fill: false },
                    { label: '', data: Array(dateLabels.length).fill(0), borderColor: '#000000', borderWidth: 3, pointRadius: 0, fill: false, tension: 0, order: 10 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: chartTitle, font: { size: 16, weight: 'bold' } },
                    legend: { display: true, position: 'top' },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}%` } }
                },
                scales: {
                    y: { title: { display: true, text: 'Annualized Return (%)' }, ticks: { callback: (v) => `${v.toFixed(1)}%` } },
                    x: { title: { display: true, text: 'Month End' }, ticks: { maxRotation: 45, minRotation: 45 } }
                }
            }
        });
    }
}

function updateRollingReturnsChart(clientName, windowMonths) {
    const client = globalData.clients[clientName];
    if (!client) return;

    const rollingData = calculator.calculateRollingReturns(client.actual, client.benchmark, windowMonths);
    const dateLabels = rollingData.dates.map(index => {
        const dateStr = globalData.dates[index + windowMonths - 1];
        if (dateStr) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        }
        return `Period ${index + 1}`;
    });

    if (globalData.charts.rolling) {
        globalData.charts.rolling.destroy();
    }

    const ctx = document.getElementById('rollingReturnsChart').getContext('2d');
    globalData.charts.rolling = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dateLabels,
            datasets: [
                { label: 'Actual', data: rollingData.actual, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: false },
                { label: 'Benchmark', data: rollingData.benchmark, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: false },
                { label: 'Relative', data: rollingData.relative, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.4, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: `Rolling ${Math.round(windowMonths/12)} Year Returns - ${clientName}`, font: { size: 16, weight: 'bold' } },
                legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}%` } }
            },
            scales: {
                y: { title: { display: true, text: 'Annualized Return (%)' }, ticks: { callback: (v) => `${v.toFixed(1)}%` } },
                x: { title: { display: true, text: 'Month End' }, ticks: { maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

// ---------- Forecast helpers ----------
function getQuarterEnd(date) {
    const endMonth = Math.floor(date.getMonth() / 3) * 3 + 2; // 0-indexed months
    return new Date(Date.UTC(date.getFullYear(), endMonth + 1, 0)); // last day of quarter
}

function addQuarter(date) {
    return getQuarterEnd(new Date(Date.UTC(date.getFullYear(), date.getMonth() + 3, 1)));
}

function formatQuarterLabel(date) {
    const q = Math.floor(date.getMonth() / 3) + 1;
    return `Q${q} ${date.getFullYear()}`;
}

function formatQuarterDate(date) {
    return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

function monthsBetween(start, end) {
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

// ---------- Toggle quarterly inputs ----------
function toggleQuarterlyInputs() {
    const mode = document.getElementById('quarterlyInputMode').value;
    const inflationTypes = ['CPI', 'WPI', 'AWE'];
    const actualSame = document.getElementById('actualSameInput');
    const actualIndividual = document.getElementById('actualIndividualInputs');
    
    if (mode === 'same') {
        for (const type of inflationTypes) {
            const same = document.getElementById(`inflation${type}SameInput`);
            const individual = document.getElementById(`inflation${type}IndividualInputs`);
            if (same) same.style.display = 'block';
            if (individual) individual.style.display = 'none';
        }
        actualSame.style.display = 'block';
        actualIndividual.style.display = 'none';
    } else {
        for (const type of inflationTypes) {
            const same = document.getElementById(`inflation${type}SameInput`);
            const individual = document.getElementById(`inflation${type}IndividualInputs`);
            if (same) same.style.display = 'none';
            if (individual) individual.style.display = 'block';
        }
        actualSame.style.display = 'none';
        actualIndividual.style.display = 'block';
    }
}

function propagateInflationValue(type) {
    const value = document.getElementById(`inflation${type}Q1to8`)?.value || '';
    for (let i = 1; i <= 8; i++) {
        const input = document.getElementById(`inflation${type}Q${i}`);
        if (input) input.value = value;
    }
}

function propagateActualValue() {
    const value = document.getElementById('actualQ1to8')?.value || '';
    for (let i = 1; i <= 8; i++) {
        const input = document.getElementById(`actualQ${i}`);
        if (input) input.value = value;
    }
}

function getQuarterlyInflationValues() {
    const mode = document.getElementById('quarterlyInputMode')?.value || 'same';
    
    // Get values for all three inflation types
    const inflationTypes = ['CPI', 'WPI', 'AWE'];
    const result = {};
    
    for (const type of inflationTypes) {
        const longTermInput = document.getElementById(`inflation${type}LongTerm`)?.value;
        const longTerm = longTermInput !== '' && longTermInput !== null && longTermInput !== undefined ? parseFloat(longTermInput) : 4.0;
        
        if (mode === 'same') {
            const inputValue = document.getElementById(`inflation${type}Q1to8`)?.value;
            const value = (inputValue !== '' && inputValue !== null && inputValue !== undefined) ? parseFloat(inputValue) : 0;
            result[type] = { quarters: Array(8).fill(value), longTerm };
        } else {
            const quarters = [];
            for (let i = 1; i <= 8; i++) {
                const inputValue = document.getElementById(`inflation${type}Q${i}`)?.value;
                const value = (inputValue !== '' && inputValue !== null && inputValue !== undefined) ? parseFloat(inputValue) : 0;
                quarters.push(value);
            }
            result[type] = { quarters, longTerm };
        }
    }
    
    return result;
}

function getQuarterlyActualValues() {
    const mode = document.getElementById('quarterlyInputMode')?.value || 'same';
    const longTermInput = document.getElementById('actualLongTerm')?.value;
    const longTerm = longTermInput !== '' && longTermInput !== null && longTermInput !== undefined ? parseFloat(longTermInput) : 8.0;
    
    if (mode === 'same') {
        const inputValue = document.getElementById('actualQ1to8')?.value;
        // Treat blank/empty as 0, not as default 2.0
        const value = (inputValue !== '' && inputValue !== null && inputValue !== undefined) ? parseFloat(inputValue) : 0;
        return { quarters: Array(8).fill(value), longTerm };
    } else {
        const quarters = [];
        for (let i = 1; i <= 8; i++) {
            const inputValue = document.getElementById(`actualQ${i}`)?.value;
            // Treat blank/empty as 0, not as default 2.0
            const value = (inputValue !== '' && inputValue !== null && inputValue !== undefined) ? parseFloat(inputValue) : 0;
            quarters.push(value);
        }
        return { quarters, longTerm };
    }
}

// ---------- Forecast generation ----------
function generateQuarterlyForecast() {
    // Create debug panel
    let debugPanel = document.getElementById('debugPanel');
    if (!debugPanel) {
        debugPanel = document.createElement('div');
        debugPanel.id = 'debugPanel';
        debugPanel.style.cssText = 'position: fixed; top: 50px; right: 20px; background: white; padding: 15px; border: 2px solid #dc3545; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000; max-width: 400px; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 12px;';
        document.body.appendChild(debugPanel);
    }
    
    function logDebug(message) {
        debugPanel.innerHTML += message + '<br>';
        debugPanel.scrollTop = debugPanel.scrollHeight;
    }
    
    try {
        debugPanel.innerHTML = '<strong style="color: #dc3545;">DEBUG LOG:</strong><br>';
        
        // Show processing message WITHOUT destroying the forecastResults content
        const resultsDiv = document.getElementById('forecastResults');
        if (!resultsDiv) {
            alert('⚠️ ERROR: Page not loaded correctly.\n\nThe forecast results section is missing from the page.\n\nPlease do a HARD REFRESH:\n• Windows: Ctrl + F5 or Ctrl + Shift + R\n• Mac: Cmd + Shift + R\n\nThis will clear your browser cache and reload the latest version.');
            throw new Error('forecastResults div not found. Browser cache issue - user needs to hard refresh.');
        }
        resultsDiv.style.display = 'block';
        
        // Create a temporary loading overlay instead of replacing content
        let loadingOverlay = document.getElementById('forecastLoadingOverlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'forecastLoadingOverlay';
            loadingOverlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;';
            loadingOverlay.innerHTML = '<div style="background: white; padding: 30px; border-radius: 8px; font-size: 18px; color: #0066cc;">⏳ Generating forecast data...</div>';
            document.body.appendChild(loadingOverlay);
        }
        loadingOverlay.style.display = 'flex';
        
        logDebug('✓ Step 1: Getting forecast years...');
        const forecastYears = parseInt(document.getElementById('forecastYears')?.value) || 8;
        logDebug(`  forecastYears = ${forecastYears}`);
        const rollingObjectiveYears = 8;

        logDebug('✓ Step 2: Getting inflation values...');
        const inflationValues = getQuarterlyInflationValues();
        logDebug(`  Inflation types: ${Object.keys(inflationValues).join(', ')}`);
        
        logDebug('✓ Step 3: Getting actual values...');
        const actualValues = getQuarterlyActualValues();
        logDebug(`  Actual quarters: ${actualValues.quarters.length}`);

    logDebug('✓ Step 4: Building client assumptions...');
    const forecastAssumptions = {};
    for (let clientName in globalData.clients) {
        logDebug(`  Processing: ${clientName}`);
        const objectiveInput = document.getElementById(`objective-${clientName}`);
        if (!objectiveInput) {
            logDebug(`  ❌ MISSING: objective-${clientName}`);
            throw new Error(`Cannot find objective input for ${clientName}. Check if FUM inputs have been populated.`);
        }
        const objectiveAnnual = parseNumberOrDefault(objectiveInput.value, 4.0);
        const clientInflationType = globalData.clientInflationTypes[clientName] || 'CPI';
        const clientInflation = inflationValues[clientInflationType];
        
        // Calculate representative display values (use Q1 values for display)
        const avgInflationQuarterly = clientInflation.quarters[0] || 1.0;
        const avgActualQuarterly = actualValues.quarters[0] || 2.0;
        const benchmarkMonthly = getBenchmarkMonthlyReturn(avgInflationQuarterly, objectiveAnnual);
        const benchmarkAnnualTarget = (Math.pow(1 + benchmarkMonthly / 100, 12) - 1) * 100;
        const actualAnnualTarget = quarterlyToAnnualCompounded(avgActualQuarterly);
        const actualMonthly = quarterlyToMonthlyCompounded(avgActualQuarterly);
        
        // Store quarterly and long-term values
        forecastAssumptions[clientName] = {
            objectiveAnnual: objectiveAnnual,
            inflationType: clientInflationType,
            inflationQuarters: clientInflation.quarters,
            inflationLongTerm: clientInflation.longTerm,
            actualQuarters: actualValues.quarters,
            actualLongTerm: actualValues.longTerm,
            // Display-friendly values (for diagnostic table)
            actualQuarterly: avgActualQuarterly,
            benchmarkQuarterly: avgInflationQuarterly,
            actualAnnualTarget: actualAnnualTarget,
            benchmarkAnnualTarget: benchmarkAnnualTarget,
            actualMonthly: actualMonthly,
            benchmarkMonthly: benchmarkMonthly
        };
    }

    logDebug('✓ Step 5: Getting last actual date...');
    // Forecasts always start after the latest actual return month.
    const lastActualDate = getForecastAnchorDate();
    const fumDateInput = document.getElementById('fumDate');
    logDebug(`  fumDate element: ${fumDateInput ? 'found' : 'NOT FOUND'}`);
    const lastDataDate = getLastActualDataDate();
    if (lastDataDate) {
        logDebug(`  Using last data date: ${lastDataDate.toISOString()}`);
    } else if (fumDateInput && fumDateInput.value) {
        logDebug(`  No data end date found, falling back to FUM date: ${lastActualDate.toISOString()}`);
    } else {
        logDebug(`  No data end date found, falling back to current date: ${lastActualDate.toISOString()}`);
    }
    const lastQuarterEnd = getQuarterEnd(lastActualDate);
    logDebug(`  Last quarter end: ${lastQuarterEnd.toISOString()}`);

    logDebug('✓ Step 6: Building quarters array...');
    const quarters = [];
    // Only include the last quarter if there are future months remaining in it
    const monthsInLastQuarter = Math.max(0, monthsBetween(lastActualDate, lastQuarterEnd));
    if (monthsInLastQuarter > 0) {
        quarters.push({ date: lastQuarterEnd, label: formatQuarterLabel(lastQuarterEnd), monthsFromNow: monthsInLastQuarter });
    }
    
    let currentEnd = lastQuarterEnd;
    for (let i = 1; i <= forecastYears * 4; i++) {
        currentEnd = addQuarter(currentEnd);
        quarters.push({ date: currentEnd, label: formatQuarterLabel(currentEnd), monthsFromNow: Math.max(0, monthsBetween(lastActualDate, currentEnd)) });
    }
    logDebug(`  Created ${quarters.length} quarters`);

    logDebug('✓ Step 7: Building forecast results...');
    const forecastResults = {};

    for (let clientName in globalData.clients) {
        const client = globalData.clients[clientName];
        const assumptions = forecastAssumptions[clientName];
        const clientRollingYears = globalData.clientRollingObjectives[clientName];
        const rollingMonths = (typeof clientRollingYears === 'number') ? clientRollingYears * 12 : rollingObjectiveYears * 12;
        const quarterlyRolling = [];

        for (let q = 0; q < quarters.length; q++) {
            const monthsToAdd = quarters[q].monthsFromNow;
            const actualCombined = [...client.actual];
            const benchmarkCombined = [...client.benchmark];

            // Determine which quarterly values to use
            let monthsAdded = 0;
            while (monthsAdded < monthsToAdd) {
                const currentQuarter = Math.floor(monthsAdded / 3);
                let quarterlyInflation, quarterlyActual;
                
                if (currentQuarter < 8) {
                    quarterlyInflation = assumptions.inflationQuarters[currentQuarter];
                    quarterlyActual = assumptions.actualQuarters[currentQuarter];
                } else {
                    quarterlyInflation = annualToQuarterlyCompounded(assumptions.inflationLongTerm);
                    quarterlyActual = annualToQuarterlyCompounded(assumptions.actualLongTerm);
                }

                const benchmarkMonthly = getBenchmarkMonthlyReturn(quarterlyInflation, assumptions.objectiveAnnual);
                const actualMonthly = quarterlyToMonthlyCompounded(quarterlyActual);
                
                // Add 3 months for this quarter
                for (let m = 0; m < 3 && monthsAdded < monthsToAdd; m++) {
                    actualCombined.push(actualMonthly);
                    benchmarkCombined.push(benchmarkMonthly);
                    monthsAdded++;
                }
            }

            let actualRolling = null;
            let benchmarkRolling = null;
            let relative = null;

            if (clientName === 'VIF' || clientRollingYears === 'inception') {
                // VIF: Calculate since inception
                const actualSinceInception = actualCombined.slice(VIF_INCEPTION_INDEX);
                const benchmarkSinceInception = benchmarkCombined.slice(VIF_INCEPTION_INDEX);
                const monthsSinceInception = actualSinceInception.length;
                
                actualRolling = calculator.annualizeReturn(actualSinceInception, monthsSinceInception);
                benchmarkRolling = calculator.annualizeReturn(benchmarkSinceInception, monthsSinceInception);
                if (actualRolling !== null && benchmarkRolling !== null) relative = actualRolling - benchmarkRolling;
            } else {
                // Normal rolling period
                if (actualCombined.length >= rollingMonths) {
                    const windowActual = actualCombined.slice(-rollingMonths);
                    const windowBenchmark = benchmarkCombined.slice(-rollingMonths);
                    actualRolling = calculator.annualizeReturn(windowActual, rollingMonths);
                    benchmarkRolling = calculator.annualizeReturn(windowBenchmark, rollingMonths);
                    if (actualRolling !== null && benchmarkRolling !== null) relative = actualRolling - benchmarkRolling;
                }
            }

            quarterlyRolling.push({ quarter: quarters[q], actual: actualRolling, benchmark: benchmarkRolling, relative });
        }

        forecastResults[clientName] = quarterlyRolling;
    }

    logDebug('✓ Step 8: Saving results to globalData...');
    globalData.forecastResults = forecastResults;
    globalData.forecastQuarters = quarters;
    globalData.rollingObjective = rollingObjectiveYears;
    globalData.forecastAssumptions = forecastAssumptions;

    logDebug('✓ Step 9: Populating forecast client selector...');
    // Populate selector while preserving current selection
    const select = document.getElementById('forecastClientSelect');
    if (!select) {
        logDebug('  ❌ MISSING: forecastClientSelect');
        alert('⚠️ ERROR: Forecast control element missing.\n\nThe forecast client selector is not found on the page.\n\nPlease do a HARD REFRESH to clear browser cache:\n• Windows: Ctrl + F5 or Ctrl + Shift + R\n• Mac: Cmd + Shift + R');
        throw new Error('Cannot find forecastClientSelect element - browser cache issue, please hard refresh');
    }
    logDebug('  ✓ forecastClientSelect found');
    const currentSelection = select.value || 'ALL';
    select.innerHTML = '<option value="ALL">All Clients (FUM Weighted)</option>';
    for (let clientName in globalData.clients) {
        const option = document.createElement('option');
        option.value = clientName;
        option.textContent = clientName;
        select.appendChild(option);
    }
    logDebug(`  ✓ Added ${Object.keys(globalData.clients).length} client options`);
    // Restore the previous selection if it still exists
    if (currentSelection && Array.from(select.options).some(opt => opt.value === currentSelection)) {
        select.value = currentSelection;
    }

    logDebug('✓ Step 10: Calling display functions...');
    logDebug('  → displayQuarterlyForecast...');
    displayQuarterlyForecast(forecastResults, rollingObjectiveYears);
    logDebug('  → updateForecastChart...');
    updateForecastChart();
    logDebug('  → updateForecastImpactChart...');
    updateForecastImpactChart();
    logDebug('  → updateRequiredReturnsChart...');
    updateRequiredReturnsChart();
    logDebug('  → displayRequiredReturnsTableData...');
    displayRequiredReturnsTableData();
    logDebug('  → displayDiagnosticTable...');
    displayDiagnosticTable();
    logDebug('  → displayRequiredReturnsTable...');
    displayRequiredReturnsTable();
    logDebug('  → populateFutureDateSelector...');
    populateFutureDateSelector();
    logDebug('  → updateFuturePerformanceTable...');
    updateFuturePerformanceTable();
    
    logDebug('✓ SUCCESS! All steps completed.');
    
    // Hide loading overlay
    loadingOverlay = document.getElementById('forecastLoadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    
    // Show save button
    const saveBtn = document.getElementById('saveForecastBtn');
    if (saveBtn) saveBtn.style.display = 'inline-block';
    
    // Show success message
    const successMsg = document.createElement('div');
    successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000; font-weight: 600;';
    successMsg.textContent = '✅ Forecast generated successfully!';
    document.body.appendChild(successMsg);
    setTimeout(() => {
        document.body.removeChild(successMsg);
        // Remove debug panel after success
        const debugPanel = document.getElementById('debugPanel');
        if (debugPanel) document.body.removeChild(debugPanel);
    }, 3000);
    
    } catch (error) {
        // Hide loading overlay on error
        const loadingOverlay = document.getElementById('forecastLoadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        
        alert('❌ Error generating forecast: ' + error.message + '\n\nPlease ensure you have entered FUM values and clicked Save.');
        console.error('Forecast generation error:', error);
    }
}

function collectForecastInputsSnapshot() {
    const snapshot = {
        forecastYears: document.getElementById('forecastYears')?.value,
        quarterlyInputMode: document.getElementById('quarterlyInputMode')?.value,
        inflationCPIQ1to8: document.getElementById('inflationCPIQ1to8')?.value,
        inflationCPILongTerm: document.getElementById('inflationCPILongTerm')?.value,
        inflationWPIQ1to8: document.getElementById('inflationWPIQ1to8')?.value,
        inflationWPILongTerm: document.getElementById('inflationWPILongTerm')?.value,
        inflationAWEQ1to8: document.getElementById('inflationAWEQ1to8')?.value,
        inflationAWELongTerm: document.getElementById('inflationAWELongTerm')?.value,
        actualQ1to8: document.getElementById('actualQ1to8')?.value,
        actualLongTerm: document.getElementById('actualLongTerm')?.value
    };

    const inflationTypes = ['CPI', 'WPI', 'AWE'];
    for (const type of inflationTypes) {
        for (let i = 1; i <= 8; i++) {
            snapshot[`inflation${type}Q${i}`] = document.getElementById(`inflation${type}Q${i}`)?.value;
        }
    }
    for (let i = 1; i <= 8; i++) {
        snapshot[`actualQ${i}`] = document.getElementById(`actualQ${i}`)?.value;
    }

    return snapshot;
}

function loadForecastDataLibrary() {
    let library = [];

    try {
        const rawLibrary = localStorage.getItem(FORECAST_DATA_LIBRARY_KEY);
        if (rawLibrary) {
            const parsed = JSON.parse(rawLibrary);
            if (Array.isArray(parsed)) {
                library = parsed;
            }
        }
    } catch (error) {
        console.warn('Could not parse saved forecast library:', error);
    }

    if (library.length === 0) {
        try {
            const legacyRaw = localStorage.getItem('forecastData');
            if (legacyRaw) {
                const legacy = JSON.parse(legacyRaw);
                if (legacy && legacy.forecastResults && legacy.forecastQuarters && legacy.forecastAssumptions) {
                    library.push({
                        id: `legacy-${Date.now()}`,
                        name: 'Legacy Forecast Save',
                        timestamp: legacy.timestamp || new Date().toISOString(),
                        forecastResults: legacy.forecastResults,
                        forecastQuarters: legacy.forecastQuarters,
                        forecastAssumptions: legacy.forecastAssumptions,
                        rollingObjective: legacy.rollingObjective,
                        inputs: legacy.inputs || {}
                    });
                    localStorage.setItem(FORECAST_DATA_LIBRARY_KEY, JSON.stringify(library));
                }
            }
        } catch (error) {
            console.warn('Could not migrate legacy forecast data:', error);
        }
    }

    library.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return library;
}

function saveForecastDataLibrary(library) {
    localStorage.setItem(FORECAST_DATA_LIBRARY_KEY, JSON.stringify(library));
}

function formatForecastDatasetLabel(dataset) {
    const name = dataset?.name || 'Unnamed Forecast';
    const date = dataset?.timestamp ? new Date(dataset.timestamp) : null;
    const dateLabel = date && !isNaN(date.getTime())
        ? date.toLocaleString()
        : 'Unknown date';
    const typeLabel = (dataset?.forecastResults && dataset?.forecastQuarters && dataset?.forecastAssumptions)
        ? 'Forecast + Inputs'
        : 'Inputs only';
    return `${name} - ${dateLabel} (${typeLabel})`;
}

function populateSavedForecastDatasets(selectedId = null) {
    const select = document.getElementById('savedForecastDatasetSelect');
    if (!select) return;

    const library = loadForecastDataLibrary();
    select.innerHTML = '';

    if (library.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No saved datasets';
        select.appendChild(option);
        return;
    }

    for (const dataset of library) {
        const option = document.createElement('option');
        option.value = dataset.id;
        option.textContent = formatForecastDatasetLabel(dataset);
        select.appendChild(option);
    }

    if (selectedId && library.some(d => d.id === selectedId)) {
        select.value = selectedId;
    } else {
        select.value = library[0].id;
    }
}

function refreshSavedForecastDatasets() {
    populateSavedForecastDatasets();
}

function applyForecastInputsSnapshot(inputs) {
    if (!inputs || typeof inputs !== 'object') return;

    const assignValue = (id, key) => {
        if (Object.prototype.hasOwnProperty.call(inputs, key)) {
            const element = document.getElementById(id);
            if (element) element.value = inputs[key];
        }
    };

    assignValue('forecastYears', 'forecastYears');
    assignValue('quarterlyInputMode', 'quarterlyInputMode');
    toggleQuarterlyInputs();

    assignValue('inflationCPIQ1to8', 'inflationCPIQ1to8');
    assignValue('inflationCPILongTerm', 'inflationCPILongTerm');
    assignValue('inflationWPIQ1to8', 'inflationWPIQ1to8');
    assignValue('inflationWPILongTerm', 'inflationWPILongTerm');
    assignValue('inflationAWEQ1to8', 'inflationAWEQ1to8');
    assignValue('inflationAWELongTerm', 'inflationAWELongTerm');
    assignValue('actualQ1to8', 'actualQ1to8');
    assignValue('actualLongTerm', 'actualLongTerm');

    const inflationTypes = ['CPI', 'WPI', 'AWE'];
    for (const type of inflationTypes) {
        for (let i = 1; i <= 8; i++) {
            assignValue(`inflation${type}Q${i}`, `inflation${type}Q${i}`);
        }
    }
    for (let i = 1; i <= 8; i++) {
        assignValue(`actualQ${i}`, `actualQ${i}`);
    }
}

function reviveLoadedForecastData(forecastData) {
    if (!forecastData || typeof forecastData !== 'object') return forecastData;

    if (Array.isArray(forecastData.forecastQuarters)) {
        forecastData.forecastQuarters = forecastData.forecastQuarters.map(q => ({
            ...q,
            date: q?.date ? new Date(q.date) : q?.date
        }));
    }

    if (forecastData.forecastResults && typeof forecastData.forecastResults === 'object') {
        for (let clientName of Object.keys(forecastData.forecastResults)) {
            const rows = forecastData.forecastResults[clientName];
            if (!Array.isArray(rows)) continue;
            forecastData.forecastResults[clientName] = rows.map(row => ({
                ...row,
                quarter: row?.quarter ? {
                    ...row.quarter,
                    date: row.quarter.date ? new Date(row.quarter.date) : row.quarter.date
                } : row?.quarter
            }));
        }
    }

    return forecastData;
}

// Save forecast data to localStorage
function saveForecastData() {
    try {
        if (!globalData.forecastResults || !globalData.forecastQuarters || !globalData.forecastAssumptions) {
            alert('⚠️ No forecast data to save. Please generate a forecast first.');
            return;
        }

        const now = new Date();
        const defaultName = `Forecast ${now.toLocaleString()}`;
        const enteredName = window.prompt('Enter a name for this forecast dataset:', defaultName);
        if (enteredName === null) return;
        const datasetName = enteredName.trim() || defaultName;
        
        const forecastData = {
            id: `forecast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: datasetName,
            timestamp: now.toISOString(),
            forecastResults: globalData.forecastResults,
            forecastQuarters: globalData.forecastQuarters,
            forecastAssumptions: globalData.forecastAssumptions,
            rollingObjective: globalData.rollingObjective,
            inputs: collectForecastInputsSnapshot()
        };
        
        const library = loadForecastDataLibrary();
        library.unshift(forecastData);
        saveForecastDataLibrary(library);
        localStorage.setItem('forecastData', JSON.stringify(forecastData));
        populateSavedForecastDatasets(forecastData.id);
        
        const successMsg = document.createElement('div');
        successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000; font-weight: 600;';
        successMsg.textContent = `✅ Saved dataset: ${datasetName}`;
        document.body.appendChild(successMsg);
        setTimeout(() => document.body.removeChild(successMsg), 3000);
        
    } catch (error) {
        console.error('Error saving forecast data:', error);
        alert('❌ Error saving forecast data: ' + error.message);
    }
}

// Load forecast data from localStorage
function loadForecastData() {
    try {
        const library = loadForecastDataLibrary();
        if (library.length === 0) {
            alert('ℹ️ No saved forecast data found.');
            return;
        }

        const datasetSelect = document.getElementById('savedForecastDatasetSelect');
        const selectedId = datasetSelect?.value;
        if (!selectedId) {
            alert('ℹ️ Please select a saved dataset first.');
            return;
        }

        const selectedDataset = library.find(d => d.id === selectedId);
        if (!selectedDataset) {
            alert('⚠️ Selected dataset not found. Please refresh saved datasets and try again.');
            populateSavedForecastDatasets();
            return;
        }
        
        const forecastData = reviveLoadedForecastData(selectedDataset);
        const savedDate = new Date(forecastData.timestamp);
        const hasForecastResults = !!(forecastData.forecastResults && forecastData.forecastQuarters && forecastData.forecastAssumptions);
        
        const confirm = window.confirm(
            `Load dataset "${forecastData.name || 'Unnamed Forecast'}"\n` +
            `Saved: ${savedDate.toLocaleString()}?\n\n` +
            (hasForecastResults
                ? 'This will restore forecast results and all input values (same + individual quarterly inputs).'
                : 'This dataset has inputs only. It will restore all input values (same + individual quarterly inputs).')
        );
        
        if (!confirm) return;
        
        applyForecastInputsSnapshot(forecastData.inputs);

        if (hasForecastResults) {
            // Restore global data
            globalData.forecastResults = forecastData.forecastResults;
            globalData.forecastQuarters = forecastData.forecastQuarters;
            globalData.forecastAssumptions = forecastData.forecastAssumptions;
            globalData.rollingObjective = forecastData.rollingObjective;
        }

        // Rebuild selector options (in case loading occurs before generation in this session)
        const select = document.getElementById('forecastClientSelect');
        if (select) {
            const currentSelection = select.value || 'ALL';
            select.innerHTML = '<option value="ALL">All Clients (FUM Weighted)</option>';
            for (let clientName in globalData.clients) {
                const option = document.createElement('option');
                option.value = clientName;
                option.textContent = clientName;
                select.appendChild(option);
            }
            if (Array.from(select.options).some(opt => opt.value === currentSelection)) {
                select.value = currentSelection;
            }
        }
        
        if (hasForecastResults) {
            // Refresh all displays
            displayQuarterlyForecast(forecastData.forecastResults, forecastData.rollingObjective);
            updateForecastChart();
            updateForecastImpactChart();
            updateRequiredReturnsChart();
            displayRequiredReturnsTableData();
            displayDiagnosticTable();
            displayRequiredReturnsTable();
            populateFutureDateSelector();
            updateFuturePerformanceTable();
        }
        
        // Show save button
        const saveBtn = document.getElementById('saveForecastBtn');
        if (saveBtn) saveBtn.style.display = 'inline-block';
        populateSavedForecastDatasets(forecastData.id);
        
        const successMsg = document.createElement('div');
        successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000; font-weight: 600;';
        successMsg.textContent = hasForecastResults
            ? `✅ Loaded dataset: ${forecastData.name || 'Unnamed Forecast'}`
            : `✅ Loaded inputs: ${forecastData.name || 'Unnamed Forecast'}`;
        document.body.appendChild(successMsg);
        setTimeout(() => document.body.removeChild(successMsg), 3000);
        
    } catch (error) {
        console.error('Error loading forecast data:', error);
        alert('❌ Error loading forecast data: ' + error.message);
    }
}

// Save forecast input values to localStorage
function saveForecastInputs() {
    try {
        const now = new Date();
        const defaultName = `Inputs ${now.toLocaleString()}`;
        const enteredName = window.prompt('Enter a name for this input dataset:', defaultName);
        if (enteredName === null) return;
        const datasetName = enteredName.trim() || defaultName;

        const inputs = {
            timestamp: now.toISOString(),
            ...collectForecastInputsSnapshot()
        };
        
        localStorage.setItem('forecastInputs', JSON.stringify(inputs));

        const datasetEntry = {
            id: `inputs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: datasetName,
            timestamp: now.toISOString(),
            forecastResults: globalData.forecastResults,
            forecastQuarters: globalData.forecastQuarters,
            forecastAssumptions: globalData.forecastAssumptions,
            rollingObjective: globalData.rollingObjective,
            inputs: collectForecastInputsSnapshot()
        };

        const library = loadForecastDataLibrary();
        library.unshift(datasetEntry);
        saveForecastDataLibrary(library);
        populateSavedForecastDatasets(datasetEntry.id);
        
        const successMsg = document.createElement('div');
        successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000; font-weight: 600;';
        successMsg.textContent = `✅ Saved inputs dataset: ${datasetName}`;
        document.body.appendChild(successMsg);
        setTimeout(() => document.body.removeChild(successMsg), 2000);
        
    } catch (error) {
        console.error('Error saving forecast inputs:', error);
    }
}

// Load forecast input values from localStorage
function loadForecastInputs() {
    try {
        const savedInputs = localStorage.getItem('forecastInputs');
        if (!savedInputs) return;
        
        const inputs = JSON.parse(savedInputs);
        applyForecastInputsSnapshot(inputs);
        
        console.log('Loaded saved forecast inputs from', new Date(inputs.timestamp).toLocaleString());
        
    } catch (error) {
        console.error('Error loading forecast inputs:', error);
    }
}

// Export forecast assumptions to Excel template
function exportForecastAssumptionsExcel() {
    try {
        const snapshot = collectForecastInputsSnapshot();
        const inflationTypes = ['CPI', 'WPI', 'AWE'];

        // Build header row and data rows
        const headers = ['Parameter'];
        for (let i = 1; i <= 8; i++) headers.push(`Quarter ${i}`);
        headers.push('Long-term Annual (%)');

        const rows = [headers];

        for (const type of inflationTypes) {
            const row = [`${type} Inflation (%)`];
            for (let i = 1; i <= 8; i++) {
                const val = snapshot[`inflation${type}Q${i}`];
                row.push(val !== undefined && val !== '' ? parseFloat(val) : '');
            }
            row.push(snapshot[`inflation${type}LongTerm`] !== undefined && snapshot[`inflation${type}LongTerm`] !== '' ? parseFloat(snapshot[`inflation${type}LongTerm`]) : '');
            rows.push(row);
        }

        // Actual returns row
        const actualRow = ['Actual Return (%)'];
        for (let i = 1; i <= 8; i++) {
            const val = snapshot[`actualQ${i}`];
            actualRow.push(val !== undefined && val !== '' ? parseFloat(val) : '');
        }
        actualRow.push(snapshot.actualLongTerm !== undefined && snapshot.actualLongTerm !== '' ? parseFloat(snapshot.actualLongTerm) : '');
        rows.push(actualRow);

        // Forecast period row
        const forecastRow = ['Forecast Period (years)', parseFloat(snapshot.forecastYears) || 8];
        rows.push(forecastRow);

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Set column widths
        ws['!cols'] = [
            { wch: 24 },
            ...Array(8).fill({ wch: 12 }),
            { wch: 20 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Forecast Assumptions');

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Forecast_Assumptions_${dateStr}.xlsx`);

        const msg = document.createElement('div');
        msg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000; font-weight: 600;';
        msg.textContent = '✅ Forecast assumptions exported to Excel';
        document.body.appendChild(msg);
        setTimeout(() => document.body.removeChild(msg), 2000);
    } catch (error) {
        console.error('Error exporting forecast assumptions:', error);
        alert('❌ Error exporting forecast assumptions: ' + error.message);
    }
}

// Import forecast assumptions from Excel template
function importForecastAssumptionsExcel() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls,.csv';

    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = new Uint8Array(event.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

                if (rows.length < 2) {
                    alert('❌ The file appears to be empty or has no data rows.');
                    return;
                }

                // Find header row (look for "Parameter" in first column)
                let headerIdx = -1;
                for (let i = 0; i < rows.length; i++) {
                    if (rows[i] && rows[i][0] && String(rows[i][0]).toLowerCase().includes('parameter')) {
                        headerIdx = i;
                        break;
                    }
                }
                if (headerIdx === -1) headerIdx = 0;

                const inflationTypeMap = {
                    'cpi': 'CPI',
                    'wpi': 'WPI',
                    'awe': 'AWE'
                };

                const snapshot = {};
                let allSame = true;

                for (let r = headerIdx + 1; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || !row[0]) continue;
                    const label = String(row[0]).toLowerCase().trim();

                    // Detect inflation rows
                    let matchedType = null;
                    for (const [key, val] of Object.entries(inflationTypeMap)) {
                        if (label.includes(key)) {
                            matchedType = val;
                            break;
                        }
                    }

                    if (matchedType) {
                        // Quarters 1-8 in columns 1-8
                        const vals = [];
                        for (let i = 1; i <= 8; i++) {
                            const v = row[i] !== undefined && row[i] !== '' ? parseFloat(row[i]) : NaN;
                            snapshot[`inflation${matchedType}Q${i}`] = isNaN(v) ? '' : String(v);
                            vals.push(v);
                        }
                        // Long-term in column 9
                        const lt = row[9] !== undefined && row[9] !== '' ? parseFloat(row[9]) : NaN;
                        snapshot[`inflation${matchedType}LongTerm`] = isNaN(lt) ? '' : String(lt);

                        // Check if all quarterly values are same
                        const firstVal = vals[0];
                        if (vals.some(v => !isNaN(v) && v !== firstVal)) allSame = false;
                        snapshot[`inflation${matchedType}Q1to8`] = !isNaN(firstVal) ? String(firstVal) : '';
                    }

                    // Detect actual return row
                    if (label.includes('actual') && label.includes('return')) {
                        const vals = [];
                        for (let i = 1; i <= 8; i++) {
                            const v = row[i] !== undefined && row[i] !== '' ? parseFloat(row[i]) : NaN;
                            snapshot[`actualQ${i}`] = isNaN(v) ? '' : String(v);
                            vals.push(v);
                        }
                        const lt = row[9] !== undefined && row[9] !== '' ? parseFloat(row[9]) : NaN;
                        snapshot.actualLongTerm = isNaN(lt) ? '' : String(lt);

                        const firstVal = vals[0];
                        if (vals.some(v => !isNaN(v) && v !== firstVal)) allSame = false;
                        snapshot.actualQ1to8 = !isNaN(firstVal) ? String(firstVal) : '';
                    }

                    // Detect forecast period row
                    if (label.includes('forecast') && label.includes('period')) {
                        const v = row[1] !== undefined && row[1] !== '' ? parseFloat(row[1]) : NaN;
                        if (!isNaN(v)) snapshot.forecastYears = String(v);
                    }
                }

                // Set input mode based on whether values differ
                snapshot.quarterlyInputMode = allSame ? 'same' : 'individual';

                applyForecastInputsSnapshot(snapshot);

                const msg = document.createElement('div');
                msg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000; font-weight: 600;';
                msg.textContent = `✅ Imported forecast assumptions from ${file.name}`;
                document.body.appendChild(msg);
                setTimeout(() => document.body.removeChild(msg), 3000);

            } catch (error) {
                console.error('Error importing forecast assumptions:', error);
                alert('❌ Error importing file: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    fileInput.click();
}

function displayQuarterlyForecast(forecastResults, rollingObjective) {
    const resultsDiv = document.getElementById('forecastResults');
    resultsDiv.style.display = 'block';
    const latestBanner = document.getElementById('latestQuarterInfo');

    const table = document.getElementById('forecastTable');
    table.innerHTML = '';

    const quarters = globalData.forecastQuarters || [];
    if (quarters.length === 0) return;

    const thead = document.createElement('thead');
    const headerRow1 = document.createElement('tr');
    const headerRow2 = document.createElement('tr');

    const quarterHeader = document.createElement('th');
    quarterHeader.textContent = 'Quarter End';
    quarterHeader.rowSpan = 2;
    headerRow1.appendChild(quarterHeader);

    for (let clientName in forecastResults) {
        const clientHeader = document.createElement('th');
        clientHeader.textContent = clientName;
        clientHeader.colSpan = 3;
        headerRow1.appendChild(clientHeader);
        ['Actual % p.a.', 'Bmk % p.a.', 'Relative % p.a.'].forEach(label => {
            const sub = document.createElement('th');
            sub.textContent = label;
            headerRow2.appendChild(sub);
        });
    }

    thead.appendChild(headerRow1);
    thead.appendChild(headerRow2);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 0; i < quarters.length; i++) {
        const row = document.createElement('tr');
        const quarterCell = document.createElement('td');
        quarterCell.textContent = `${quarters[i].label} (${formatQuarterDate(quarters[i].date)})`;
        quarterCell.style.fontWeight = '600';
        row.appendChild(quarterCell);

        for (let clientName in forecastResults) {
            const data = forecastResults[clientName][i];
            const actualCell = document.createElement('td');
            actualCell.textContent = formatReturn(data?.actual);
            actualCell.className = getReturnClass(data?.actual);
            row.appendChild(actualCell);

            const bmkCell = document.createElement('td');
            bmkCell.textContent = formatReturn(data?.benchmark);
            bmkCell.className = getReturnClass(data?.benchmark);
            row.appendChild(bmkCell);

            const relCell = document.createElement('td');
            relCell.textContent = formatReturn(data?.relative);
            relCell.className = getReturnClass(data?.relative);
            row.appendChild(relCell);
        }

        tbody.appendChild(row);
    }
    table.appendChild(tbody);

    if (latestBanner) {
        const latestLabel = `${quarters[0].label} (${formatQuarterDate(quarters[0].date)})`;
        const weighted = calculateWeightedForecastRow(forecastResults, 0);
        if (weighted) {
            latestBanner.textContent = `Latest rolling returns as at ${latestLabel}: Actual ${formatReturn(weighted.actual)}, Benchmark ${formatReturn(weighted.benchmark)}, Relative ${formatReturn(weighted.relative)}`;
        } else {
            latestBanner.textContent = `Latest rolling returns as at ${latestLabel} will appear once enough history is available.`;
        }
    }
}

function calculateWeightedForecastRow(forecastResults, index) {
    let sumActual = 0, sumBenchmark = 0, totalWeight = 0;
    for (let clientName in forecastResults) {
        const fum = globalData.fumValues[clientName] || 0;
        const row = forecastResults[clientName][index];
        if (fum > 0 && row && row.actual !== null && row.benchmark !== null) {
            sumActual += row.actual * fum;
            sumBenchmark += row.benchmark * fum;
            totalWeight += fum;
        }
    }
    if (totalWeight > 0) {
        const actual = sumActual / totalWeight;
        const benchmark = sumBenchmark / totalWeight;
        return { actual, benchmark, relative: actual - benchmark };
    }
    return null;
}

function updateForecastChart() {
    const selectedValue = document.getElementById('forecastClientSelect').value;
    const forecastResults = globalData.forecastResults;
    const quarters = globalData.forecastQuarters || [];
    if (!forecastResults || quarters.length === 0) return;

    if (globalData.charts.forecast) globalData.charts.forecast.destroy();
    const ctx = document.getElementById('forecastChart').getContext('2d');

    // Get the as-of date for historical rolling return
    const dateSelect = document.getElementById('performanceAsOfDate');
    const asOfDateIndex = dateSelect ? parseInt(dateSelect.value) : globalData.dates.length - 1;
    const asOfDateStr = globalData.dates[asOfDateIndex];
    const asOfDate = new Date(asOfDateStr);
    const asOfLabel = asOfDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

    let labels = [asOfLabel, ...quarters.map(q => q.label)];
    let datasets = [];

    if (selectedValue === 'ALL') {
        // Calculate weighted historical rolling return at as-of date
        let totalWeight = 0;
        let weightedHistActual = 0;
        let weightedHistBenchmark = 0;
        
        for (let clientName in globalData.clients) {
            const fum = globalData.fumValues[clientName] || 0;
            if (fum <= 0) continue;
            
            const client = globalData.clients[clientName];
            const horizonYears = globalData.clientRollingObjectives[clientName];
            let histActual, histBenchmark;
            
            if (clientName === 'VIF' || horizonYears === 'inception') {
                // VIF: Calculate since inception
                const actualReturns = client.actual.slice(VIF_INCEPTION_INDEX, asOfDateIndex + 1);
                const benchmarkReturns = client.benchmark.slice(VIF_INCEPTION_INDEX, asOfDateIndex + 1);
                const months = asOfDateIndex - VIF_INCEPTION_INDEX + 1;
                
                histActual = calculator.annualizeReturn(actualReturns, months);
                histBenchmark = calculator.annualizeReturn(benchmarkReturns, months);
            } else {
                // Normal rolling period
                const horizonMonths = (horizonYears || 8) * 12;
                
                const actualReturns = client.actual.slice(0, asOfDateIndex + 1);
                const benchmarkReturns = client.benchmark.slice(0, asOfDateIndex + 1);
                const actualForPeriod = actualReturns.slice(-horizonMonths);
                const benchmarkForPeriod = benchmarkReturns.slice(-horizonMonths);
                
                histActual = calculator.annualizeReturn(actualForPeriod, actualForPeriod.length);
                histBenchmark = calculator.annualizeReturn(benchmarkForPeriod, benchmarkForPeriod.length);
            }
            
            if (histActual !== null && histBenchmark !== null) {
                weightedHistActual += histActual * fum;
                weightedHistBenchmark += histBenchmark * fum;
                totalWeight += fum;
            }
        }
        
        const histActualAvg = totalWeight > 0 ? weightedHistActual / totalWeight : null;
        const histBenchmarkAvg = totalWeight > 0 ? weightedHistBenchmark / totalWeight : null;
        const histRelativeAvg = (histActualAvg !== null && histBenchmarkAvg !== null) ? histActualAvg - histBenchmarkAvg : null;
        
        const weightedActual = [histActualAvg];
        const weightedBenchmark = [histBenchmarkAvg];
        const weightedRelative = [histRelativeAvg];
        
        for (let i = 0; i < quarters.length; i++) {
            const row = calculateWeightedForecastRow(forecastResults, i);
            weightedActual.push(row ? row.actual : null);
            weightedBenchmark.push(row ? row.benchmark : null);
            weightedRelative.push(row ? row.relative : null);
        }
        datasets = [
            { label: 'Actual % p.a.', data: weightedActual, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, yAxisID: 'y' },
            { label: 'Benchmark % p.a.', data: weightedBenchmark, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, yAxisID: 'y' },
            { label: 'Relative % p.a. (RHS)', data: weightedRelative, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.4, yAxisID: 'y1' }
        ];
    } else {
        // Calculate historical rolling return for individual client
        const client = globalData.clients[selectedValue];
        if (client) {
            const horizonYears = globalData.clientRollingObjectives[selectedValue];
            let histActual, histBenchmark, histRelative;
            
            if (selectedValue === 'VIF' || horizonYears === 'inception') {
                // VIF: Calculate since inception
                const actualReturns = client.actual.slice(VIF_INCEPTION_INDEX, asOfDateIndex + 1);
                const benchmarkReturns = client.benchmark.slice(VIF_INCEPTION_INDEX, asOfDateIndex + 1);
                const months = asOfDateIndex - VIF_INCEPTION_INDEX + 1;
                
                histActual = calculator.annualizeReturn(actualReturns, months);
                histBenchmark = calculator.annualizeReturn(benchmarkReturns, months);
                histRelative = (histActual !== null && histBenchmark !== null) ? histActual - histBenchmark : null;
            } else {
                // Normal rolling period
                const horizonMonths = (horizonYears || 8) * 12;
                
                const actualReturns = client.actual.slice(0, asOfDateIndex + 1);
                const benchmarkReturns = client.benchmark.slice(0, asOfDateIndex + 1);
                const actualForPeriod = actualReturns.slice(-horizonMonths);
                const benchmarkForPeriod = benchmarkReturns.slice(-horizonMonths);
                
                histActual = calculator.annualizeReturn(actualForPeriod, actualForPeriod.length);
                histBenchmark = calculator.annualizeReturn(benchmarkForPeriod, benchmarkForPeriod.length);
                histRelative = (histActual !== null && histBenchmark !== null) ? histActual - histBenchmark : null;
            }
            
            const series = forecastResults[selectedValue];
            const actualData = [histActual, ...series.map(d => d.actual)];
            const benchmarkData = [histBenchmark, ...series.map(d => d.benchmark)];
            const relativeData = [histRelative, ...series.map(d => d.relative)];
            
            datasets = [
                { label: 'Actual % p.a.', data: actualData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, yAxisID: 'y' },
                { label: 'Benchmark % p.a.', data: benchmarkData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, yAxisID: 'y' },
                { label: 'Relative % p.a. (RHS)', data: relativeData, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.4, yAxisID: 'y1' }
            ];
        }
    }

    const horizonLabel = selectedValue === 'ALL' 
        ? 'Blended Rolling Return Window'
        : (selectedValue === 'VIF' || globalData.clientRollingObjectives[selectedValue] === 'inception')
            ? 'Since Inception'
            : `${globalData.clientRollingObjectives[selectedValue] || 8}-Year`;
    const chartTitle = selectedValue === 'ALL'
        ? `Forecasted ${horizonLabel} - All Clients (FUM Weighted)`
        : `Forecasted ${horizonLabel} ${(selectedValue === 'VIF' || globalData.clientRollingObjectives[selectedValue] === 'inception') ? 'Returns' : 'Rolling Returns'} - ${selectedValue}`;

    globalData.charts.forecast = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: chartTitle, font: { size: 16, weight: 'bold' } },
                legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}%` } }
            },
            scales: {
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Actual & Benchmark Returns (% p.a.)' }, ticks: { callback: (v) => `${v.toFixed(1)}%` } },
                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Relative Return (% p.a.)' }, ticks: { callback: (v) => `${v.toFixed(1)}%` } },
                x: { title: { display: true, text: 'Quarter End' }, ticks: { maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

function updateForecastImpactChart() {
    const selectedValue = document.getElementById('forecastClientSelect').value;
    const forecastResults = globalData.forecastResults;
    const quarters = globalData.forecastQuarters || [];
    if (!forecastResults || quarters.length === 0) return;

    // Get the as-of date for historical rolling return
    const dateSelect = document.getElementById('performanceAsOfDate');
    const asOfDateIndex = dateSelect ? parseInt(dateSelect.value) : globalData.dates.length - 1;
    const asOfDateStr = globalData.dates[asOfDateIndex];
    const asOfDate = new Date(asOfDateStr);
    const asOfLabel = asOfDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

    let labels = [asOfLabel, ...quarters.map(q => q.label)];
    let actualDropOut = [];
    let actualAddIn = [];
    let benchmarkDropOut = [];
    let benchmarkAddIn = [];

    // Helper function to calculate decomposed impacts
    function calculateRollingImpacts(client, clientName, qIdx, actualCombined, benchmarkCombined) {
        const clientRollingYears = globalData.clientRollingObjectives[clientName];
        const rollingMonths = (typeof clientRollingYears === 'number') ? clientRollingYears * 12 : 96; // default 8 years

        // For VIF or inception-based, we can't do drop/add analysis the same way
        if (clientName === 'VIF' || clientRollingYears === 'inception') {
            return { actualDrop: 0, actualAdd: 0, bmkDrop: 0, bmkAdd: 0 };
        }

        const histLength = client.actual.length;
        const currentLength = actualCombined.length;
        const forecastMonthsAdded = currentLength - histLength;
        
        // Need enough historical data to calculate windows
        if (histLength < rollingMonths) {
            return { actualDrop: null, actualAdd: null, bmkDrop: null, bmkAdd: null };
        }

        // STEP 1: Previous window - last rollingMonths BEFORE the current quarter
        // Previous window is the trailing full rolling window immediately before the current forecast quarter.
        // For the first forecast quarter, this is the historical window ending at the last actual quarter-end.
        // Later forecast quarters extend that window with prior forecast quarters.
        const dataBeforeCurrentQuarter = actualCombined.slice(0, -3); // Remove current quarter's 3 months
        const prevActual = dataBeforeCurrentQuarter.slice(-rollingMonths);
        const prevBmk = benchmarkCombined.slice(0, -3).slice(-rollingMonths);
        
        let prevActualProduct = 1.0, prevBmkProduct = 1.0;
        for (let i = 0; i < prevActual.length; i++) {
            if (prevActual[i] !== null) prevActualProduct *= (1 + prevActual[i] / 100);
            if (prevBmk[i] !== null) prevBmkProduct *= (1 + prevBmk[i] / 100);
        }
        const prevActualAnnual = (Math.pow(prevActualProduct, 12 / rollingMonths) - 1) * 100;
        const prevBmkAnnual = (Math.pow(prevBmkProduct, 12 / rollingMonths) - 1) * 100;
        
        // STEP 2: Drop-out window - shift forward by 3 months with 0% for the new quarter
        // Remove oldest 3 months from previous window, add 3 months of 0%
        const dropoutActualWithZeros = [...prevActual.slice(3), 0, 0, 0];
        const dropoutBmkWithZeros = [...prevBmk.slice(3), 0, 0, 0];
        
        let dropoutActualProduct = 1.0, dropoutBmkProduct = 1.0;
        for (let i = 0; i < dropoutActualWithZeros.length; i++) {
            if (dropoutActualWithZeros[i] !== null) dropoutActualProduct *= (1 + dropoutActualWithZeros[i] / 100);
            if (dropoutBmkWithZeros[i] !== null) dropoutBmkProduct *= (1 + dropoutBmkWithZeros[i] / 100);
        }
        const dropoutActualAnnual = (Math.pow(dropoutActualProduct, 12 / rollingMonths) - 1) * 100;
        const dropoutBmkAnnual = (Math.pow(dropoutBmkProduct, 12 / rollingMonths) - 1) * 100;
        
        // Drop-out impact: effect of oldest quarter leaving and new quarter with 0% entering
        const actualDrop = dropoutActualAnnual - prevActualAnnual;
        const bmkDrop = dropoutBmkAnnual - prevBmkAnnual;
        
        // STEP 3: Add-in window - replace the 0% with actual forecast
        let actualAdd = 0, bmkAdd = 0;
        if (forecastMonthsAdded >= 3) {
            // Get the forecast data that was added (last 3 months of actualCombined)
            const forecastActual = actualCombined.slice(-3);
            const forecastBmk = benchmarkCombined.slice(-3);
            
            // Check if forecast is non-zero
            const hasActualForecast = forecastActual.some(v => v !== null && v !== undefined && Math.abs(v) > 0.001);
            const hasBmkForecast = forecastBmk.some(v => v !== null && v !== undefined && Math.abs(v) > 0.001);
            
            if (hasActualForecast || hasBmkForecast) {
                // Add-in window: Same as dropout but replace the 3 zeros with actual forecast
                const addinActual = [...prevActual.slice(3), ...(hasActualForecast ? forecastActual : [0, 0, 0])];
                const addinBmk = [...prevBmk.slice(3), ...(hasBmkForecast ? forecastBmk : [0, 0, 0])];
                
                let addinActualProduct = 1.0, addinBmkProduct = 1.0;
                for (let i = 0; i < addinActual.length; i++) {
                    if (addinActual[i] !== null) addinActualProduct *= (1 + addinActual[i] / 100);
                    if (addinBmk[i] !== null) addinBmkProduct *= (1 + addinBmk[i] / 100);
                }
                const addinActualAnnual = (Math.pow(addinActualProduct, 12 / rollingMonths) - 1) * 100;
                const addinBmkAnnual = (Math.pow(addinBmkProduct, 12 / rollingMonths) - 1) * 100;
                
                // Add-in impact: effect of replacing 0% with actual forecast
                if (hasActualForecast) actualAdd = addinActualAnnual - dropoutActualAnnual;
                if (hasBmkForecast) bmkAdd = addinBmkAnnual - dropoutBmkAnnual;
            }
        }

        return { actualDrop, actualAdd, bmkDrop, bmkAdd };
    }

    if (selectedValue === 'ALL') {
        // For weighted average, we need to aggregate impacts across all clients
        // Initialize arrays
        for (let i = 0; i < labels.length; i++) {
            actualDropOut.push(null);
            actualAddIn.push(null);
            benchmarkDropOut.push(null);
            benchmarkAddIn.push(null);
        }

        // First element (historical) has no decomposition
        actualDropOut[0] = null;
        actualAddIn[0] = null;
        benchmarkDropOut[0] = null;
        benchmarkAddIn[0] = null;

        // For each forecast quarter
        for (let qIdx = 0; qIdx < quarters.length; qIdx++) {
            let totalWeight = 0;
            let weightedActualDrop = 0;
            let weightedActualAdd = 0;
            let weightedBmkDrop = 0;
            let weightedBmkAdd = 0;

            for (let clientName in globalData.clients) {
                const fum = globalData.fumValues[clientName] || 0;
                if (fum <= 0) continue;

                const client = globalData.clients[clientName];
                const assumptions = globalData.forecastAssumptions[clientName];
                if (!assumptions) continue;

                // Rebuild the combined series up to this quarter - only add if non-zero
                const monthsToAdd = quarters[qIdx].monthsFromNow;
                const actualCombined = [...client.actual];
                const benchmarkCombined = [...client.benchmark];

                let monthsAdded = 0;
                while (monthsAdded < monthsToAdd) {
                    const currentQuarter = Math.floor(monthsAdded / 3);
                    let quarterlyInflation, quarterlyActual;
                    
                    if (currentQuarter < 8) {
                        quarterlyInflation = assumptions.inflationQuarters[currentQuarter];
                        quarterlyActual = assumptions.actualQuarters[currentQuarter];
                    } else {
                        quarterlyInflation = annualToQuarterlyCompounded(assumptions.inflationLongTerm);
                        quarterlyActual = annualToQuarterlyCompounded(assumptions.actualLongTerm);
                    }
                    
                    // Only add forecast data if it's non-zero (indicates actual forecast provided)
                    const hasActualData = Math.abs(quarterlyActual) > 0.001;
                    const hasBenchmarkData = Math.abs(quarterlyInflation) > 0.001 || Math.abs(assumptions.objectiveAnnual) > 0.001;
                    
                    if (hasActualData || hasBenchmarkData) {
                        const benchmarkMonthly = getBenchmarkMonthlyReturn(quarterlyInflation, assumptions.objectiveAnnual);
                        const actualMonthly = quarterlyToMonthlyCompounded(quarterlyActual);
                        
                        for (let m = 0; m < 3 && monthsAdded < monthsToAdd; m++) {
                            actualCombined.push(actualMonthly);
                            benchmarkCombined.push(benchmarkMonthly);
                            monthsAdded++;
                        }
                    } else {
                        // Skip adding forecast if all values are zero/blank
                        monthsAdded += 3;
                    }
                }

                const impacts = calculateRollingImpacts(client, clientName, qIdx, actualCombined, benchmarkCombined);
                
                if (impacts.actualDrop !== null && impacts.actualAdd !== null) {
                    weightedActualDrop += impacts.actualDrop * fum;
                    weightedActualAdd += impacts.actualAdd * fum;
                    weightedBmkDrop += impacts.bmkDrop * fum;
                    weightedBmkAdd += impacts.bmkAdd * fum;
                    totalWeight += fum;
                }
            }

            if (totalWeight > 0) {
                actualDropOut[qIdx + 1] = weightedActualDrop / totalWeight;
                actualAddIn[qIdx + 1] = weightedActualAdd / totalWeight;
                benchmarkDropOut[qIdx + 1] = weightedBmkDrop / totalWeight;
                benchmarkAddIn[qIdx + 1] = weightedBmkAdd / totalWeight;
            }
        }
    } else {
        // Individual client
        const client = globalData.clients[selectedValue];
        const assumptions = globalData.forecastAssumptions[selectedValue];
        
        if (client && assumptions) {
            // First element (historical) has no decomposition
            actualDropOut.push(null);
            actualAddIn.push(null);
            benchmarkDropOut.push(null);
            benchmarkAddIn.push(null);

            for (let qIdx = 0; qIdx < quarters.length; qIdx++) {
                const monthsToAdd = quarters[qIdx].monthsFromNow;
                const actualCombined = [...client.actual];
                const benchmarkCombined = [...client.benchmark];

                // Build forecast data up to this quarter - only add if non-zero
                let monthsAdded = 0;
                while (monthsAdded < monthsToAdd) {
                    const currentQuarter = Math.floor(monthsAdded / 3);
                    let quarterlyInflation, quarterlyActual;
                    
                    if (currentQuarter < 8) {
                        quarterlyInflation = assumptions.inflationQuarters[currentQuarter];
                        quarterlyActual = assumptions.actualQuarters[currentQuarter];
                    } else {
                        quarterlyInflation = annualToQuarterlyCompounded(assumptions.inflationLongTerm);
                        quarterlyActual = annualToQuarterlyCompounded(assumptions.actualLongTerm);
                    }
                    
                    // Only add forecast data if it's non-zero (indicates actual forecast provided)
                    const hasActualData = Math.abs(quarterlyActual) > 0.001;
                    const hasBenchmarkData = Math.abs(quarterlyInflation) > 0.001 || Math.abs(assumptions.objectiveAnnual) > 0.001;
                    
                    if (hasActualData || hasBenchmarkData) {
                        const benchmarkMonthly = getBenchmarkMonthlyReturn(quarterlyInflation, assumptions.objectiveAnnual);
                        const actualMonthly = quarterlyToMonthlyCompounded(quarterlyActual);
                        
                        for (let m = 0; m < 3 && monthsAdded < monthsToAdd; m++) {
                            actualCombined.push(actualMonthly);
                            benchmarkCombined.push(benchmarkMonthly);
                            monthsAdded++;
                        }
                    } else {
                        // Skip adding forecast if all values are zero/blank
                        monthsAdded += 3;
                    }
                }

                const impacts = calculateRollingImpacts(client, selectedValue, qIdx, actualCombined, benchmarkCombined);
                actualDropOut.push(impacts.actualDrop);
                actualAddIn.push(impacts.actualAdd);
                benchmarkDropOut.push(impacts.bmkDrop);
                benchmarkAddIn.push(impacts.bmkAdd);
            }
        }
    }

    // Create striped patterns for drop-out bars
    function createStripePattern(color, ctx) {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const patternCtx = canvas.getContext('2d');
        
        patternCtx.fillStyle = color;
        patternCtx.fillRect(0, 0, 10, 10);
        
        patternCtx.strokeStyle = 'white';
        patternCtx.lineWidth = 2;
        patternCtx.beginPath();
        patternCtx.moveTo(0, 0);
        patternCtx.lineTo(10, 10);
        patternCtx.moveTo(5, -5);
        patternCtx.lineTo(15, 5);
        patternCtx.moveTo(-5, 5);
        patternCtx.lineTo(5, 15);
        patternCtx.stroke();
        
        return ctx.createPattern(canvas, 'repeat');
    }

    // Calculate net values for overlay points
    const netActual = actualDropOut.map((drop, i) => {
        if (drop === null || actualAddIn[i] === null) return null;
        return drop + actualAddIn[i];
    });
    const netBenchmark = benchmarkDropOut.map((drop, i) => {
        if (drop === null || benchmarkAddIn[i] === null) return null;
        return drop + benchmarkAddIn[i];
    });
    const netChange = netActual.map((act, i) => {
        if (act === null || netBenchmark[i] === null) return null;
        return act - netBenchmark[i];
    });

    const impactTitle = selectedValue === 'ALL'
        ? `Rolling Return Decomposition - Drop Out vs Add In (Quarterly)`
        : (selectedValue === 'VIF' || globalData.clientRollingObjectives[selectedValue] === 'inception')
            ? `Since Inception Change Components`
            : `${globalData.clientRollingObjectives[selectedValue] || 8}-Year Rolling Return Decomposition`;

    // Calculate shared y-axis scale across all data with automated range and steps
    const allValues = [
        ...actualDropOut.filter(v => v !== null),
        ...actualAddIn.filter(v => v !== null),
        ...benchmarkDropOut.filter(v => v !== null),
        ...benchmarkAddIn.filter(v => v !== null),
        ...netActual.filter(v => v !== null),
        ...netBenchmark.filter(v => v !== null),
        ...netChange.filter(v => v !== null)
    ];
    let yMin, yMax, stepSize;
    if (allValues.length > 0) {
        const dataMin = Math.min(...allValues);
        const dataMax = Math.max(...allValues);
        const maxAbs = Math.max(Math.abs(dataMin), Math.abs(dataMax));
        
        // Determine step size based on data range
        let niceStep;
        if (maxAbs <= 0.5) {
            niceStep = 0.1;
        } else if (maxAbs <= 1.5) {
            niceStep = 0.2;
        } else if (maxAbs <= 3) {
            niceStep = 0.5;
        } else {
            niceStep = 1.0;
        }
        
        // Calculate symmetric range with buffer
        const rangeMax = Math.ceil((maxAbs + niceStep * 0.5) / niceStep) * niceStep;
        yMin = -rangeMax;
        yMax = rangeMax;
        stepSize = niceStep;
    } else {
        yMin = -1;
        yMax = 1;
        stepSize = 0.2;
    }

    // Destroy existing charts
    if (globalData.charts.forecastImpactActual) globalData.charts.forecastImpactActual.destroy();
    if (globalData.charts.forecastImpactBenchmark) globalData.charts.forecastImpactBenchmark.destroy();
    if (globalData.charts.forecastImpactNet) globalData.charts.forecastImpactNet.destroy();

    // CHART 1: Actual Returns
    const ctxActual = document.getElementById('forecastImpactChartActual').getContext('2d');
    const greenStripeActual = createStripePattern('rgba(16,185,129,0.8)', ctxActual);
    globalData.charts.forecastImpactActual = new Chart(ctxActual, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Actual Drop Out', data: actualDropOut, backgroundColor: greenStripeActual, borderColor: '#10b981', borderWidth: 1, type: 'bar', order: 2 },
                { label: 'Actual Add In', data: actualAddIn, backgroundColor: 'rgba(16,185,129,0.8)', borderColor: '#10b981', borderWidth: 1, type: 'bar', order: 2 },
                { label: 'Net Actual', data: netActual, type: 'line', pointStyle: 'triangle', backgroundColor: 'rgba(16,185,129,1)', borderColor: '#000000', borderWidth: 2, pointRadius: 5, pointBorderWidth: 2, showLine: false, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 10, bottom: 40, left: 0, right: 0 } },
            plugins: {
                title: { 
                    display: true, 
                    text: 'Actual Returns', 
                    font: { size: 14 }, 
                    padding: { top: 0, bottom: 5 },
                    align: 'center',
                    position: 'top'
                },
                legend: { display: true, position: 'bottom', align: 'center', labels: { boxWidth: 15, padding: 8 } },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}% p.a.`
                    }
                }
            },
            scales: {
                y: { 
                    min: yMin,
                    max: yMax,
                    title: { display: true, text: 'Impact (% p.a.)' }, 
                    ticks: { 
                        stepSize: stepSize,
                        callback: (v) => `${v.toFixed(1)}%`
                    },
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.1)', drawBorder: true, lineWidth: 1 }
                },
                x: { 
                    display: true,
                    title: { display: true, text: 'Quarter End' },
                    ticks: { maxRotation: 45, minRotation: 45 },
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.1)', drawBorder: true, lineWidth: 1 }
                }
            }
        }
    });

    // CHART 2: Benchmark Returns
    const ctxBenchmark = document.getElementById('forecastImpactChartBenchmark').getContext('2d');
    const orangeStripeBenchmark = createStripePattern('rgba(245,158,11,0.8)', ctxBenchmark);
    globalData.charts.forecastImpactBenchmark = new Chart(ctxBenchmark, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Benchmark Drop Out', data: benchmarkDropOut, backgroundColor: orangeStripeBenchmark, borderColor: '#f59e0b', borderWidth: 1, type: 'bar', order: 2 },
                { label: 'Benchmark Add In', data: benchmarkAddIn, backgroundColor: 'rgba(245,158,11,0.8)', borderColor: '#f59e0b', borderWidth: 1, type: 'bar', order: 2 },
                { label: 'Net Benchmark', data: netBenchmark, type: 'line', pointStyle: 'circle', backgroundColor: 'rgba(245,158,11,1)', borderColor: '#000000', borderWidth: 2, pointRadius: 5, pointBorderWidth: 2, showLine: false, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 10, bottom: 40, left: 0, right: 0 } },
            plugins: {
                title: { 
                    display: true, 
                    text: 'Benchmark Returns', 
                    font: { size: 14 }, 
                    padding: { top: 0, bottom: 5 },
                    align: 'center',
                    position: 'top'
                },
                legend: { display: true, position: 'bottom', align: 'center', labels: { boxWidth: 15, padding: 8 } },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}% p.a.`
                    }
                }
            },
            scales: {
                y: { 
                    min: yMin,
                    max: yMax,
                    title: { display: true, text: 'Impact (% p.a.)' }, 
                    ticks: { 
                        stepSize: stepSize,
                        callback: (v) => `${v.toFixed(1)}%`
                    },
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.1)', drawBorder: true, lineWidth: 1 }
                },
                x: { 
                    display: true,
                    title: { display: true, text: 'Quarter End' },
                    ticks: { maxRotation: 45, minRotation: 45 },
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.1)', drawBorder: true, lineWidth: 1 }
                }
            }
        }
    });

    // CHART 3: Net Comparison
    const ctxNet = document.getElementById('forecastImpactChartNet').getContext('2d');
    globalData.charts.forecastImpactNet = new Chart(ctxNet, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Net Actual', data: netActual, backgroundColor: 'rgba(16,185,129,0.8)', borderColor: '#10b981', borderWidth: 1, type: 'bar', order: 2 },
                { label: 'Net Benchmark', data: netBenchmark, backgroundColor: 'rgba(245,158,11,0.8)', borderColor: '#f59e0b', borderWidth: 1, type: 'bar', order: 2 },
                { label: 'Net Change', data: netChange, type: 'line', pointStyle: 'circle', backgroundColor: '#000000', borderColor: '#000000', borderWidth: 2, pointRadius: 5, pointBorderWidth: 2, showLine: false, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 10, bottom: 40, left: 0, right: 0 } },
            plugins: {
                title: { 
                    display: true, 
                    text: 'Net Returns Impact', 
                    font: { size: 14 }, 
                    padding: { top: 0, bottom: 5 },
                    align: 'center',
                    position: 'top'
                },
                legend: { display: true, position: 'bottom', align: 'center', labels: { boxWidth: 15, padding: 8 } },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}% p.a.`
                    }
                }
            },
            scales: {
                y: { 
                    min: yMin,
                    max: yMax,
                    title: { display: true, text: 'Impact (% p.a.)' }, 
                    ticks: { 
                        stepSize: stepSize,
                        callback: (v) => `${v.toFixed(1)}%`
                    },
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.1)', drawBorder: true, lineWidth: 1 }
                },
                x: { 
                    title: { display: true, text: 'Quarter End' }, 
                    ticks: { maxRotation: 45, minRotation: 45 },
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.1)', drawBorder: true, lineWidth: 1 }
                }
            }
        }
    });
}

// ---------- Objective returns persistence ----------
function saveObjectiveReturns() {
    const objectiveData = {};
    const rollingData = {};
    for (let clientName in globalData.clients) {
        const input = document.getElementById(`objective-${clientName}`);
        const rollingSelect = document.getElementById(`rolling-${clientName}`);
        if (input && input.value) objectiveData[clientName] = parseFloat(input.value);
        if (rollingSelect) {
            rollingData[clientName] = parseInt(rollingSelect.value);
            globalData.clientRollingObjectives[clientName] = parseInt(rollingSelect.value);
        }
    }
    const dataToSave = { values: objectiveData, rolling: rollingData, savedAt: new Date().toISOString() };
    localStorage.setItem('clientObjectiveReturns', JSON.stringify(dataToSave));
    updateForecastObjectiveDisplays();
}

function loadObjectiveReturns() {
    const savedData = localStorage.getItem('clientObjectiveReturns');
    if (!savedData) return;
    try {
        const data = JSON.parse(savedData);
        if (data.values) {
            for (let clientName in data.values) {
                const input = document.getElementById(`objective-${clientName}`);
                if (input) input.value = data.values[clientName];
            }
        }
        if (data.rolling) {
            for (let clientName in data.rolling) {
                const rollingSelect = document.getElementById(`rolling-${clientName}`);
                if (rollingSelect) rollingSelect.value = data.rolling[clientName];
                globalData.clientRollingObjectives[clientName] = data.rolling[clientName];
            }
        }
        updateForecastObjectiveDisplays();
    } catch (err) {
        console.error('Error loading objective returns:', err);
    }
}

function clearObjectiveReturns() {
    if (!confirm('Are you sure you want to clear all objective returns?')) return;
    localStorage.removeItem('clientObjectiveReturns');
    for (let clientName in globalData.clients) {
        const input = document.getElementById(`objective-${clientName}`);
        const rollingSelect = document.getElementById(`rolling-${clientName}`);
        if (input) input.value = '';
        if (rollingSelect) rollingSelect.value = '8';
    }
    globalData.clientRollingObjectives = {};
    updateForecastObjectiveDisplays();
    alert('Objective returns cleared');
}

function updateForecastObjectiveDisplays() {
    // No longer needed - not using per-client forecast displays
}

// ---------- FUM persistence ----------
function saveFUMData() {
    const fumData = {};
    const objectiveData = {};
    const rollingData = {};
    const inflationTypeData = {};
    
    for (let clientName in globalData.clients) {
        const fumInput = document.getElementById(`fum-${clientName}`);
        const objectiveInput = document.getElementById(`objective-${clientName}`);
        const rollingSelect = document.getElementById(`rolling-${clientName}`);
        const inflationTypeSelect = document.getElementById(`inflation-type-${clientName}`);
        
        if (fumInput && fumInput.value) fumData[clientName] = parseFloat(fumInput.value);
        if (objectiveInput && objectiveInput.value) objectiveData[clientName] = parseFloat(objectiveInput.value);
        if (rollingSelect) {
            // Handle VIF's 'inception' value or numeric rolling years
            const rollingValue = rollingSelect.value === 'inception' ? 'inception' : parseInt(rollingSelect.value);
            rollingData[clientName] = rollingValue;
            globalData.clientRollingObjectives[clientName] = rollingValue;
        }
        if (inflationTypeSelect) {
            inflationTypeData[clientName] = inflationTypeSelect.value;
            globalData.clientInflationTypes[clientName] = inflationTypeSelect.value;
        }
    }
    
    const fumDate = document.getElementById('fumDate').value || getLatestActualDateInputValue();
    if (!fumDate) { alert('Please select a date for the FUM data'); return; }

    const allSaved = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
    allSaved[fumDate] = { 
        date: fumDate, 
        values: fumData, 
        objectives: objectiveData,
        rolling: rollingData,
        inflationTypes: inflationTypeData,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem('clientFUMDatasets', JSON.stringify(allSaved));

    globalData.fumValues = fumData;
    populateSavedDates();
    updateMainTable();
    updateForecastObjectiveDisplays();
}

function loadFUMData(dateToLoad = null) {
    const allSaved = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
    if (Object.keys(allSaved).length === 0) {
        setFUMDateToLatestActualDate();
        return;
    }
    let data = null;
    if (dateToLoad && allSaved[dateToLoad]) data = allSaved[dateToLoad];
    else {
        const dates = Object.keys(allSaved).sort().reverse();
        data = allSaved[dates[0]];
    }
    if (data) {
        const dateInput = document.getElementById('fumDate');
        if (dateInput && data.date) dateInput.value = data.date;
        const dateSelect = document.getElementById('savedDatesSelect');
        if (dateSelect) dateSelect.value = data.date;
        
        // Load FUM values
        if (data.values) {
            for (let clientName in data.values) {
                const input = document.getElementById(`fum-${clientName}`);
                if (input) input.value = data.values[clientName];
                globalData.fumValues[clientName] = data.values[clientName];
            }
        }
        
        // Load objective values
        if (data.objectives) {
            for (let clientName in data.objectives) {
                const input = document.getElementById(`objective-${clientName}`);
                if (input) input.value = data.objectives[clientName];
            }
        }
        
        // Load rolling window values
        if (data.rolling) {
            for (let clientName in data.rolling) {
                const rollingSelect = document.getElementById(`rolling-${clientName}`);
                if (rollingSelect) {
                    const rollingValue = data.rolling[clientName];
                    if (rollingValue === 'inception') {
                        rollingSelect.value = 'inception';
                        globalData.clientRollingObjectives[clientName] = 'inception';
                    } else {
                        rollingSelect.value = rollingValue;
                        globalData.clientRollingObjectives[clientName] = rollingValue;
                    }
                }
            }
        }
        
        // Load inflation type values
        if (data.inflationTypes) {
            for (let clientName in data.inflationTypes) {
                const inflationTypeSelect = document.getElementById(`inflation-type-${clientName}`);
                if (inflationTypeSelect) {
                    inflationTypeSelect.value = data.inflationTypes[clientName];
                    globalData.clientInflationTypes[clientName] = data.inflationTypes[clientName];
                }
            }
        }
        
        updateMainTable();
        updateForecastObjectiveDisplays();
    }
}

function populateSavedDates() {
    const select = document.getElementById('savedDatesSelect');
    if (!select) return;
    const allSaved = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
    const dates = Object.keys(allSaved).sort().reverse();
    
    // Debug logging
    console.log('Populating saved dates. Found:', dates.length, 'date(s)');
    if (dates.length > 0) {
        console.log('Saved dates:', dates);
    }
    
    select.innerHTML = '<option value="">-- Select a saved date --</option>';
    dates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDateForDisplay(date);
        select.appendChild(option);
    });
    
    // Warn if no saved FUM dates are available.
    if (dates.length === 0) {
        console.warn('No saved FUM dates found in localStorage. If you had previously saved data, it may have been cleared.');
    }
}

function loadSelectedDate() {
    const sel = document.getElementById('savedDatesSelect');
    if (sel && sel.value) loadFUMData(sel.value);
}

function formatDateForDisplay(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

function deleteCurrentDate() {
    const fumDate = document.getElementById('fumDate').value;
    if (!fumDate) { alert('No date selected to delete'); return; }
    if (!confirm(`Delete FUM data for ${formatDateForDisplay(fumDate)}?`)) return;
    const allSaved = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
    delete allSaved[fumDate];
    localStorage.setItem('clientFUMDatasets', JSON.stringify(allSaved));
    clearFUMInputs();
    populateSavedDates();
}

function clearAllFUMData() {
    if (!confirm('Delete ALL saved FUM data? This cannot be undone.')) return;
    localStorage.removeItem('clientFUMDatasets');
    clearFUMInputs();
    populateSavedDates();
}

function viewAllSavedData() {
    const allSaved = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
    const dates = Object.keys(allSaved).sort();
    
    if (dates.length === 0) {
        alert('No saved data found in localStorage.');
        return;
    }
    
    let message = `Found ${dates.length} saved dataset(s):\n\n`;
    dates.forEach(date => {
        const data = allSaved[date];
        const savedAt = data.savedAt ? new Date(data.savedAt).toLocaleString() : 'Unknown';
        const numClients = Object.keys(data.values || {}).length;
        message += `📅 ${formatDateForDisplay(date)} (${date})\n`;
        message += `   Saved: ${savedAt}\n`;
        message += `   Clients: ${numClients}\n\n`;
    });
    
    message += '\nTo recover data for a specific date, select it from the "Load Previously Saved Data" dropdown.';
    
    // Create a modal or alert with the data
    if (confirm(message + '\n\nWould you like to export this data to console for backup?')) {
        console.log('=== ALL SAVED FUM DATA ===');
        console.log(JSON.stringify(allSaved, null, 2));
        alert('Data exported to browser console. Press F12 to view and copy it for backup.');
    }
}

function clearFUMInputs() {
    for (let clientName in globalData.clients) {
        const fumInput = document.getElementById(`fum-${clientName}`);
        if (fumInput) fumInput.value = '';
        
        const objectiveInput = document.getElementById(`objective-${clientName}`);
        if (objectiveInput) objectiveInput.value = '4.00';
        
        const rollingSelect = document.getElementById(`rolling-${clientName}`);
        if (rollingSelect) rollingSelect.value = '8';
    }
    const dateInput = document.getElementById('fumDate');
    if (dateInput) dateInput.value = getLatestActualDateInputValue();
    const dateSelect = document.getElementById('savedDatesSelect');
    if (dateSelect) dateSelect.value = '';
    globalData.fumValues = {};
    globalData.clientRollingObjectives = {};
    updateMainTable();
}

function clearFUMInputsForManualEntry() {
    // Clear all FUM inputs and set date to the latest actual return month-end.
    for (let clientName in globalData.clients) {
        const fumInput = document.getElementById(`fum-${clientName}`);
        if (fumInput) fumInput.value = '';
    }
    
    setFUMDateToLatestActualDate();
    
    globalData.fumValues = {};
    updateMainTable();
    
    // Scroll to the FUM inputs
    const fumInputs = document.getElementById('fumInputs');
    if (fumInputs) {
        fumInputs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function exportBackup() {
    const allSaved = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
    
    if (Object.keys(allSaved).length === 0) {
        alert('No saved data to export.');
        return;
    }
    
    const dataStr = JSON.stringify(allSaved, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `client_fum_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
    
    alert('Backup file downloaded successfully!');
}

function importBackup() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const importedData = JSON.parse(event.target.result);
                
                // Validate the data structure
                if (typeof importedData !== 'object') {
                    throw new Error('Invalid backup file format');
                }
                
                // Ask user if they want to merge or replace
                const merge = confirm('Merge with existing data? Click OK to merge, Cancel to replace all existing data.');
                
                if (merge) {
                    const existingData = JSON.parse(localStorage.getItem('clientFUMDatasets') || '{}');
                    const mergedData = { ...existingData, ...importedData };
                    localStorage.setItem('clientFUMDatasets', JSON.stringify(mergedData));
                } else {
                    localStorage.setItem('clientFUMDatasets', JSON.stringify(importedData));
                }
                
                populateSavedDates();
                alert('Backup restored successfully!');
                
                // Auto-load the most recent date
                const dates = Object.keys(importedData).sort().reverse();
                if (dates.length > 0) {
                    loadFUMData(dates[0]);
                }
            } catch (error) {
                alert('Error importing backup: ' + error.message);
            }
        };
        reader.readAsText(file);
    };
    
    fileInput.click();
}

async function handlePDFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Please select a PDF file.');
        return;
    }
    
    try {
        // Show loading message
        const loadingMsg = document.createElement('div');
        loadingMsg.id = 'pdfLoadingMsg';
        loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 10000;';
        loadingMsg.innerHTML = '<p style="margin: 0; font-size: 16px;">📄 Extracting FUM data from PDF...</p>';
        document.body.appendChild(loadingMsg);
        
        // Read PDF file
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        // Extract text from all pages, preserving line structure
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Group text items by Y position to preserve lines
            const lines = {};
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]); // Y coordinate
                if (!lines[y]) lines[y] = [];
                lines[y].push(item.str);
            });
            
            // Sort by Y position (top to bottom) and join
            const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a);
            for (let y of sortedY) {
                fullText += lines[y].join(' ') + '\n';
            }
        }
        
        console.log('Extracted PDF text preview:', fullText.substring(0, 1000));
        
        // Parse FUM data from extracted text
        const fumData = parsePDFFUMData(fullText, file.name);
        
        // Remove loading message
        document.body.removeChild(loadingMsg);
        
        if (Object.keys(fumData.values).length === 0) {
            alert('Could not extract FUM data from the PDF. Please check the file format.');
            return;
        }
        
        // Auto-populate the date if found in filename
        if (fumData.date) {
            const dateInput = document.getElementById('fumDate');
            if (dateInput) dateInput.value = fumData.date;
        }
        
        // Populate FUM values
        let populated = 0;
        for (let clientName in fumData.values) {
            const fumInput = document.getElementById(`fum-${clientName}`);
            if (fumInput) {
                fumInput.value = fumData.values[clientName];
                globalData.fumValues[clientName] = fumData.values[clientName];
                populated++;
            }
        }
        
        // Update the table
        updateMainTable();
        
        // Show success message
        alert(`✅ Successfully extracted FUM data for ${populated} client(s)!\n\n${Object.entries(fumData.values).map(([name, value]) => `${name}: $${value.toFixed(2)}M`).join('\n')}\n\nPlease review the values and save if correct.`);
        
        // Reset file input
        event.target.value = '';
        
    } catch (error) {
        console.error('Error processing PDF:', error);
        const loadingMsg = document.getElementById('pdfLoadingMsg');
        if (loadingMsg) document.body.removeChild(loadingMsg);
        alert('Error reading PDF file: ' + error.message);
    }
}

function computeClientRequiredReturnForData(clientName, quarterIndex, data) {
    const quarters = data.forecastQuarters || [];
    if (quarterIndex < 0 || quarterIndex >= quarters.length) return null;

    const client = data.clients?.[clientName];
    const assumptions = data.forecastAssumptions?.[clientName];
    if (!client || !assumptions) return null;

    const monthsFromNow = quarters[quarterIndex].monthsFromNow;
    if (monthsFromNow <= 0) {
        return {
            monthsFromNow,
            requiredMonthly: 0,
            requiredQuarterly: 0,
            requiredCumulative: 0,
            requiredAnnual: 0,
            displayValue: 0
        };
    }

    const clientRollingYears = data.clientRollingObjectives?.[clientName];
    const isInception = (clientName === 'VIF' || clientRollingYears === 'inception');

    const benchmarkCombined = [...client.benchmark];
    let monthsAdded = 0;
    while (monthsAdded < monthsFromNow) {
        const currentQuarter = Math.floor(monthsAdded / 3);
        let quarterlyInflation;

        if (currentQuarter < 8) {
            quarterlyInflation = assumptions.inflationQuarters[currentQuarter];
        } else {
            quarterlyInflation = annualToQuarterlyCompounded(assumptions.inflationLongTerm);
        }

        const benchmarkMonthly = getBenchmarkMonthlyReturn(quarterlyInflation, assumptions.objectiveAnnual);

        for (let m = 0; m < 3 && monthsAdded < monthsFromNow; m++) {
            benchmarkCombined.push(benchmarkMonthly);
            monthsAdded++;
        }
    }

    const multiplyReturns = (returns) => {
        let product = 1.0;
        for (let i = 0; i < returns.length; i++) {
            const r = returns[i];
            if (r !== null && r !== undefined && !isNaN(r)) {
                product *= (1 + r / 100);
            }
        }
        return product;
    };

    let futureInWindow;
    let historicalActualProduct = 1.0;
    let benchmarkWindowProduct = 1.0;

    if (isInception) {
        const benchmarkWindow = benchmarkCombined.slice(VIF_INCEPTION_INDEX);
        const historicalActualWindow = client.actual.slice(VIF_INCEPTION_INDEX);

        benchmarkWindowProduct = multiplyReturns(benchmarkWindow);
        historicalActualProduct = multiplyReturns(historicalActualWindow);
        futureInWindow = monthsFromNow;
    } else {
        const rollingMonths = (typeof clientRollingYears === 'number' ? clientRollingYears : 8) * 12;
        const benchmarkWindow = benchmarkCombined.slice(-rollingMonths);

        benchmarkWindowProduct = multiplyReturns(benchmarkWindow);

        const historicalInWindow = Math.max(0, rollingMonths - monthsFromNow);
        if (historicalInWindow > 0) {
            const historicalActualWindow = client.actual.slice(-historicalInWindow);
            historicalActualProduct = multiplyReturns(historicalActualWindow);
        }

        futureInWindow = Math.min(monthsFromNow, rollingMonths);
    }

    if (futureInWindow <= 0 || historicalActualProduct <= 0 || benchmarkWindowProduct <= 0) return null;

    const requiredFutureProduct = benchmarkWindowProduct / historicalActualProduct;
    if (requiredFutureProduct <= 0) return null;

    const requiredMonthly = (Math.pow(requiredFutureProduct, 1 / futureInWindow) - 1) * 100;
    const requiredQuarterly = (Math.pow(1 + requiredMonthly / 100, 3) - 1) * 100;
    const requiredCumulative = (Math.pow(1 + requiredMonthly / 100, monthsFromNow) - 1) * 100;
    const requiredAnnual = (Math.pow(1 + requiredMonthly / 100, 12) - 1) * 100;
    const displayValue = monthsFromNow <= 12 ? requiredCumulative : requiredAnnual;

    return {
        monthsFromNow,
        requiredMonthly,
        requiredQuarterly,
        requiredCumulative,
        requiredAnnual,
        displayValue
    };
}

function computeClientRequiredReturn(clientName, quarterIndex) {
    return computeClientRequiredReturnForData(clientName, quarterIndex, {
        clients: globalData.clients,
        clientRollingObjectives: globalData.clientRollingObjectives,
        forecastAssumptions: globalData.forecastAssumptions,
        forecastQuarters: globalData.forecastQuarters
    });
}

function parsePDFFUMData(text, filename) {
    const result = {
        date: null,
        values: {}
    };
    
    // Extract date from filename (e.g., "Client Asset Allocation Report 31 December 2025.pdf")
    const dateMatch = filename.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const month = (monthNames.indexOf(dateMatch[2]) + 1).toString().padStart(2, '0');
        const year = dateMatch[3];
        result.date = `${year}-${month}-${day}`;
    }
    
    // Split text into lines for more accurate section detection
    const lines = text.split(/\r?\n/);
    let currentSection = null;
    const sectionGrandTotals = {};
    
    // Define section header patterns matching actual PDF content
    const sectionPatterns = {
        'VWA': /VICTORIAN WORKCOVER|VWA/i,
        'TAC': /TRANSPORT ACCIDENT COMMISSION/i,
        'VMIA': /VICTORIAN MANAGED INSURANCE|VMIA/i,
        'ESSSF': /STATE SUPERANNUATION FUND|SSF/i,
        'ESSDB': /EMERGENCY SERVICES SUPERANNUATION|ESSS.*DB/i,
        'VIF': /VICTORIAN INVESTMENT FUND/i
    };
    
    // Parse line by line to identify sections and their first Grand Total
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();
        
        // Check if this line indicates a new section
        for (let clientName in sectionPatterns) {
            if (sectionPatterns[clientName].test(line)) {
                // Only set as current section if we haven't already found this client's Grand Total
                if (!sectionGrandTotals[clientName]) {
                    currentSection = clientName;
                    console.log(`Found section: ${currentSection} at line ${i}: "${line}"`);
                }
                break;
            }
        }
        
        // Look for Grand Total lines - must have "Grand Total" and a number pattern
        if (/GRAND\s*TOTAL/i.test(lineUpper) && currentSection) {
            console.log(`Grand Total line for ${currentSection}: "${line}"`);
            // Extract the first FUM value (number with comma separators like 14,364.73)
            // Match pattern: one to three digits, optionally followed by comma and three digits, then decimal point and two digits
            const match = line.match(/(\d{1,3}(?:,\d{3})+\.\d{2})/);
            if (match && !sectionGrandTotals[currentSection]) {
                const fumValue = parseFloat(match[1].replace(/,/g, ''));
                // Only accept values greater than 1000 (should be in millions)
                if (fumValue > 1000) {
                    sectionGrandTotals[currentSection] = fumValue;
                    console.log(`✓ Extracted ${currentSection}: $${fumValue}M`);
                } else {
                    console.log(`✗ Rejected small value ${fumValue} for ${currentSection}`);
                }
            }
        }
    }
    
    console.log('Final extracted values:', sectionGrandTotals);
    result.values = sectionGrandTotals;
    return result;
}

function updateRequiredReturnsChart() {
    const selectedValue = document.getElementById('forecastClientSelect').value;
    const quarters = globalData.forecastQuarters || [];
    if (quarters.length === 0) return;
    
    if (globalData.charts.requiredReturns) globalData.charts.requiredReturns.destroy();
    const ctx = document.getElementById('requiredReturnsChart').getContext('2d');
    
    let labels = quarters.map(q => q.label);
    let clientNames = [];
    let showIndividualLines = true;
    
    if (selectedValue === 'ALL') {
        clientNames = Object.keys(globalData.clients);
        showIndividualLines = false; // Only show aggregate line for All Clients
    } else {
        clientNames = [selectedValue];
        showIndividualLines = true;
    }
    
    const datasets = [];
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
    
    let inflationValues;
    try {
        inflationValues = getQuarterlyInflationValues();
    } catch (e) {
        inflationValues = { quarters: Array(8).fill(1.0), longTerm: 4.0 };
    }
    
    clientNames.forEach((clientName, idx) => {
        const forecastResults = globalData.forecastResults;
        if (!forecastResults || !forecastResults[clientName]) {
            return;
        }
        
        const requiredReturns = [];
        
        for (let q = 0; q < quarters.length; q++) {
            const required = computeClientRequiredReturn(clientName, q);
            requiredReturns.push(required ? required.displayValue : null);
        }
        
        if (showIndividualLines) {
            const color = colors[idx % colors.length];
            datasets.push({
                label: `${clientName} Required`,
                data: requiredReturns,
                borderColor: color,
                backgroundColor: `${color}33`,
                tension: 0.4,
                pointRadius: 3
            });
        }
    });
    
    // Add "All Clients" aggregate line if showing all clients
    // Use the correct bisection-based aggregate method instead of averaging per-client values
    if (selectedValue === 'ALL' && clientNames.length > 1) {
        const aggregateReturns = [];
        
        for (let q = 0; q < quarters.length; q++) {
            const result = computeAggregateRequiredReturn(q);
            aggregateReturns.push(result !== null ? result.displayValue : null);
        }
        
        datasets.push({
            label: 'All Clients Required (FUM Weighted)',
            data: aggregateReturns,
            borderColor: '#6366f1',
            backgroundColor: '#6366f133',
            borderWidth: 3,
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 4
        });
    }
    
    const chartTitle = selectedValue === 'ALL'
        ? `Required Returns to Achieve Target (Cumulative ≤ 1yr, Annual > 1yr) - All Clients`
        : `Required Returns to Achieve Target (Cumulative ≤ 1yr, Annual > 1yr) - ${selectedValue}`;
    
    globalData.charts.requiredReturns = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: chartTitle, font: { size: 16, weight: 'bold' } },
                legend: { display: true, position: 'top' },
                tooltip: { 
                    callbacks: { 
                        label: (ctx) => {
                            const qIndex = ctx.dataIndex;
                            const monthsFromNow = quarters[qIndex]?.monthsFromNow || 0;
                            const unit = monthsFromNow <= 12 ? '% cumulative' : '% p.a.';
                            return `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}${unit}`;
                        }
                    }
                }
            },
            scales: {
                y: { 
                    title: { display: true, text: 'Required Return (% cumulative ≤ 1yr, % p.a. > 1yr)' }, 
                    ticks: { callback: (v) => `${v.toFixed(1)}%` } 
                },
                x: { title: { display: true, text: 'Quarter End' }, ticks: { maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

// ---------- Aggregate Required Return (correct method) ----------
/**
 * Compute the correct FUM-weighted aggregate required return for a given quarter.
 * Instead of averaging per-client required returns (which is mathematically invalid
 * due to Jensen's inequality), this uses bisection to find the single monthly return
 * that makes the FUM-weighted actual rolling return equal the FUM-weighted benchmark
 * rolling return at the given forecast quarter.
 *
 * Returns { displayValue, monthsFromNow } or null if not computable.
 */
function computeAggregateRequiredReturn(quarterIndex) {
    const quarters = globalData.forecastQuarters || [];
    if (quarterIndex >= quarters.length) return null;
    
    const monthsFromNow = quarters[quarterIndex].monthsFromNow;
    const clientNames = Object.keys(globalData.clients);
    const forecastResults = globalData.forecastResults;
    if (!forecastResults) return null;

    // Get the FUM-weighted benchmark rolling return (this is the target)
    let totalFUM = 0;
    let weightedBmk = 0;
    for (let clientName of clientNames) {
        const fum = globalData.fumValues[clientName] || 0;
        if (fum <= 0) continue;
        const fr = forecastResults[clientName]?.[quarterIndex];
        if (!fr || fr.benchmark === null) continue;
        weightedBmk += fr.benchmark * fum;
        totalFUM += fum;
    }
    if (totalFUM <= 0) return null;
    const targetWeightedBenchmark = weightedBmk / totalFUM;

    // Function: given a candidate monthly actual return, compute FUM-weighted actual rolling
    function computeWeightedActualRolling(candidateMonthly) {
        let wActual = 0, wFUM = 0;
        for (let clientName of clientNames) {
            const fum = globalData.fumValues[clientName] || 0;
            if (fum <= 0) continue;
            const client = globalData.clients[clientName];
            const clientRollingYears = globalData.clientRollingObjectives[clientName];

            // Build combined actual series with candidate monthly return
            const actualCombined = [...client.actual];
            for (let m = 0; m < monthsFromNow; m++) {
                actualCombined.push(candidateMonthly);
            }

            let actualRolling;
            if (clientName === 'VIF' || clientRollingYears === 'inception') {
                const slice = actualCombined.slice(VIF_INCEPTION_INDEX);
                actualRolling = calculator.annualizeReturn(slice, slice.length);
            } else {
                const rollingMonths = (typeof clientRollingYears === 'number' ? clientRollingYears : 8) * 12;
                if (actualCombined.length >= rollingMonths) {
                    const window = actualCombined.slice(-rollingMonths);
                    actualRolling = calculator.annualizeReturn(window, rollingMonths);
                } else {
                    actualRolling = null;
                }
            }
            if (actualRolling !== null) {
                wActual += actualRolling * fum;
                wFUM += fum;
            }
        }
        return wFUM > 0 ? wActual / wFUM : null;
    }

    // Bisection: find monthly return where weighted actual = target benchmark
    let lo = -5.0, hi = 10.0; // monthly return bounds (%)
    for (let iter = 0; iter < 100; iter++) {
        const mid = (lo + hi) / 2;
        const result = computeWeightedActualRolling(mid);
        if (result === null) return null;
        if (result < targetWeightedBenchmark) {
            lo = mid;
        } else {
            hi = mid;
        }
        if (Math.abs(hi - lo) < 1e-8) break;
    }
    const requiredMonthly = (lo + hi) / 2;

    // Convert to display value (cumulative for <=12m, annualized for >12m)
    let displayValue;
    if (monthsFromNow <= 12) {
        displayValue = (Math.pow(1 + requiredMonthly / 100, monthsFromNow) - 1) * 100;
    } else {
        displayValue = (Math.pow(1 + requiredMonthly / 100, 12) - 1) * 100;
    }

    return { displayValue, monthsFromNow, requiredMonthly };
}

// ---------- Required Returns Table Data ----------
function displayRequiredReturnsTableData() {
    const tableBody = document.getElementById('requiredReturnsTableData');
    if (!tableBody) return;
    
    const quarters = globalData.forecastQuarters || [];
    if (quarters.length === 0 || !globalData.forecastResults) {
        tableBody.innerHTML = '<tr><td colspan="100%">No forecast data available</td></tr>';
        return;
    }
    
    // Limit to first 12 quarters
    const numQuarters = Math.min(12, quarters.length);
    const clientNames = Object.keys(globalData.clients);
    
    // Build header row with quarters as columns
    let html = '<thead><tr><th>Client</th>';
    for (let q = 0; q < numQuarters; q++) {
        const monthsFromNow = quarters[q].monthsFromNow;
        const unit = monthsFromNow <= 12 ? '% (cum)' : '% p.a.';
        html += `<th>${quarters[q].label}<br>${unit}</th>`;
    }
    html += '</tr></thead><tbody>';
    
    // Calculate required returns for each client (rows)
    clientNames.forEach(clientName => {
        html += `<tr><td><strong>${clientName}</strong></td>`;
        const forecastResults = globalData.forecastResults;
        
        for (let q = 0; q < numQuarters; q++) {
            if (!forecastResults || !forecastResults[clientName]) {
                html += '<td>-</td>';
                continue;
            }

            const required = computeClientRequiredReturn(clientName, q);
            html += required ? `<td>${required.displayValue.toFixed(2)}</td>` : '<td>-</td>';
        }
        
        html += '</tr>';
    });
    
    // Add FUM-weighted aggregate row (using correct aggregate bisection method)
    html += '<tr><td><strong>All Clients (FUM-weighted)</strong></td>';
    
    for (let q = 0; q < numQuarters; q++) {
        const result = computeAggregateRequiredReturn(q);
        if (result !== null) {
            html += `<td><strong>${result.displayValue.toFixed(2)}</strong></td>`;
        } else {
            html += '<td>-</td>';
        }
    }
    
    html += '</tr></tbody>';
    tableBody.innerHTML = html;
}

// ---------- Diagnostic table ----------
function displayDiagnosticTable() {
    const diagnosticDiv = document.getElementById('diagnosticTable');
    if (!diagnosticDiv) return;
    
    // Save current selection before rebuilding
    const existingSelect = document.getElementById('diagnosticClientSelect');
    const currentSelection = existingSelect ? existingSelect.value : null;
    
    diagnosticDiv.innerHTML = '<h3>Diagnostic: Historical & Future Returns</h3>';
    
    // Create client selector
    const selectorDiv = document.createElement('div');
    selectorDiv.style.marginBottom = '15px';
    
    const label = document.createElement('label');
    label.textContent = 'Select Client: ';
    label.style.marginRight = '10px';
    label.style.fontWeight = '600';
    
    const select = document.createElement('select');
    select.id = 'diagnosticClientSelect';
    select.style.padding = '8px 12px';
    select.style.fontSize = '14px';
    select.style.borderRadius = '4px';
    select.style.border = '1px solid #dee2e6';
    
    for (let clientName in globalData.clients) {
        const option = document.createElement('option');
        option.value = clientName;
        option.textContent = clientName;
        select.appendChild(option);
    }
    
    // Restore previous selection
    if (currentSelection && Array.from(select.options).some(opt => opt.value === currentSelection)) {
        select.value = currentSelection;
    }
    
    select.onchange = updateDiagnosticDisplay;
    
    selectorDiv.appendChild(label);
    selectorDiv.appendChild(select);
    diagnosticDiv.appendChild(selectorDiv);
    
    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.id = 'diagnosticContent';
    diagnosticDiv.appendChild(contentDiv);
    
    // Display first client by default
    updateDiagnosticDisplay();
}

function updateDiagnosticDisplay() {
    const select = document.getElementById('diagnosticClientSelect');
    const contentDiv = document.getElementById('diagnosticContent');
    if (!select || !contentDiv) return;
    
    const clientName = select.value;
    if (!clientName) return;
    
    const client = globalData.clients[clientName];
    const assumptions = globalData.forecastAssumptions?.[clientName];
    if (!client || !assumptions) return;
    
    contentDiv.innerHTML = '';
    
    const section = document.createElement('div');
    section.style.marginBottom = '30px';
    
    const header = document.createElement('h4');
    header.textContent = clientName;
    section.appendChild(header);
    
    const inflationType = globalData.clientInflationTypes[clientName] || 'CPI';
    const info = document.createElement('p');
    info.style.fontSize = '0.9em';
    info.style.color = 'var(--text-secondary)';
    info.innerHTML = `
        <strong>Note:</strong> Future returns use quarterly-specific assumptions (Q1-Q8 have individual values, Q9+ use long-term annual rates).<br>
        Q1 Example: Actual ${assumptions.actualQuarters[0].toFixed(2)}% quarterly (${quarterlyToAnnualCompounded(assumptions.actualQuarters[0]).toFixed(2)}% annualized), 
        Benchmark ${assumptions.inflationQuarters[0].toFixed(2)}% ${inflationType} spread + ${assumptions.objectiveAnnual.toFixed(2)}% objective
    `;
    section.appendChild(info);
    
    const table = document.createElement('table');
    table.className = 'forecast-table';
    table.style.fontSize = '0.85em';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Period</th>
            <th>Date/Quarter</th>
            <th>Actual %</th>
            <th>Benchmark %</th>
            <th>Relative %</th>
        </tr>
    `;
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    
    // All historical monthly returns
    for (let i = 0; i < client.actual.length; i++) {
        const row = document.createElement('tr');
        const dateStr = globalData.dates[i] || `Month ${i + 1}`;
        const actual = client.actual[i];
        const benchmark = client.benchmark[i];
        const relative = actual - benchmark;
        
        row.innerHTML = `
            <td>Historical</td>
            <td>${dateStr}</td>
            <td>${formatReturn(actual)}</td>
            <td>${formatReturn(benchmark)}</td>
            <td>${formatReturn(relative)}</td>
        `;
        tbody.appendChild(row);
    }
    
    // All future quarterly returns (show per-quarter values)
    const quarters = globalData.forecastQuarters || [];
    for (let i = 0; i < quarters.length; i++) {
        const row = document.createElement('tr');
        row.style.background = '#f8f9fa';
        const q = quarters[i];
        
      // Determine which quarter's values apply
        let quarterlyInflation, quarterlyActual;
        if (i < 8) {
            quarterlyInflation = assumptions.inflationQuarters[i];
            quarterlyActual = assumptions.actualQuarters[i];
        } else {
            quarterlyInflation = annualToQuarterlyCompounded(assumptions.inflationLongTerm);
            quarterlyActual = annualToQuarterlyCompounded(assumptions.actualLongTerm);
        }

        const benchmarkMonthly = getBenchmarkMonthlyReturn(quarterlyInflation, assumptions.objectiveAnnual);
        const actualMonthly = quarterlyToMonthlyCompounded(quarterlyActual);
        const relative = actualMonthly - benchmarkMonthly;
        
        row.innerHTML = `
            <td>Future Q${i+1}</td>
            <td>${q.label} (${formatQuarterDate(q.date)})</td>
            <td>${formatReturn(actualMonthly)} /mo (${quarterlyActual.toFixed(2)}% qtly)</td>
            <td>${formatReturn(benchmarkMonthly)} /mo (${quarterlyInflation.toFixed(2)}% spr)</td>
            <td>${formatReturn(relative)} /month</td>
        `;
        tbody.appendChild(row);
    }
    
    table.appendChild(tbody);
    section.appendChild(table);
    contentDiv.appendChild(section);
}

// ---------- Required Returns Table ----------
function displayRequiredReturnsTable() {
    const requiredDiv = document.getElementById('requiredReturnsTable');
    if (!requiredDiv) {
        console.error('requiredReturnsTable element not found');
        return;
    }
    
    // Save current selection before rebuilding
    const existingSelect = document.getElementById('requiredReturnsClientSelect');
    const currentSelection = existingSelect ? existingSelect.value : null;
    
    requiredDiv.innerHTML = '<h3>Required Returns to Achieve Rolling Objective</h3>';
    requiredDiv.innerHTML += '<p style="color: var(--text-secondary); font-size: 0.9em; margin-bottom: 15px;">Shows the actual return required to achieve the rolling objective + inflation target (ignoring your forecast assumptions).</p>';
    
    // Create client selector
    const selectorDiv = document.createElement('div');
    selectorDiv.style.marginBottom = '15px';
    
    const label = document.createElement('label');
    label.textContent = 'Select Client: ';
    label.style.marginRight = '10px';
    label.style.fontWeight = '600';
    
    const select = document.createElement('select');
    select.id = 'requiredReturnsClientSelect';
    select.style.padding = '8px 12px';
    select.style.fontSize = '14px';
    select.style.borderRadius = '4px';
    select.style.border = '1px solid #dee2e6';
    
    for (let clientName in globalData.clients) {
        const option = document.createElement('option');
        option.value = clientName;
        option.textContent = clientName;
        select.appendChild(option);
    }
    
    // Restore previous selection
    if (currentSelection && Array.from(select.options).some(opt => opt.value === currentSelection)) {
        select.value = currentSelection;
    }
    
    select.onchange = updateRequiredReturnsDisplay;
    
    selectorDiv.appendChild(label);
    selectorDiv.appendChild(select);
    requiredDiv.appendChild(selectorDiv);
    
    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.id = 'requiredReturnsContent';
    requiredDiv.appendChild(contentDiv);
    
    // Display first client by default
    if (Object.keys(globalData.clients).length > 0) {
        updateRequiredReturnsDisplay();
    }
}

function updateRequiredReturnsDisplay() {
    const select = document.getElementById('requiredReturnsClientSelect');
    const contentDiv = document.getElementById('requiredReturnsContent');
    if (!select || !contentDiv) {
        console.error('Required returns selector or content div not found');
        return;
    }
    
    const clientName = select.value;
    if (!clientName) {
        console.error('No client selected');
        return;
    }
    
    const client = globalData.clients[clientName];
    if (!client) {
        console.error('Client not found:', clientName);
        return;
    }
    
    const objectiveAnnual = parseNumberOrDefault(document.getElementById(`objective-${clientName}`)?.value, 4.0);
    
    // Get the client's inflation type and corresponding values
    const clientInflationType = globalData.clientInflationTypes[clientName] || 'CPI';
    let inflationData;
    try {
        const inflationValues = getQuarterlyInflationValues();
        inflationData = inflationValues[clientInflationType];
        if (!inflationData || !inflationData.quarters) {
            throw new Error('Invalid inflation data structure');
        }
    } catch (e) {
        // Use default if inputs not yet available
        inflationData = { quarters: Array(8).fill(1.0), longTerm: 4.0 };
    }
    const avgInflation = inflationData.quarters.reduce((a, b) => a + b, 0) / inflationData.quarters.length;
    const avgBenchmarkMonthly = getBenchmarkMonthlyReturn(avgInflation, objectiveAnnual);
    const targetAnnual = (Math.pow(1 + avgBenchmarkMonthly / 100, 12) - 1) * 100;
    const clientRollingYears = globalData.clientRollingObjectives[clientName] || 8;
    const isInception = (clientName === 'VIF' || clientRollingYears === 'inception');
    const rollingMonths = isInception ? null : clientRollingYears * 12;
    const quarters = globalData.forecastQuarters || [];
    
    if (quarters.length === 0) {
        contentDiv.innerHTML = '<p style="color: var(--text-secondary);">Generate a forecast first to see required returns.</p>';
        return;
    }
    
    contentDiv.innerHTML = '';
    
    const section = document.createElement('div');
    section.style.marginBottom = '30px';
    
    const header = document.createElement('h4');
    if (isInception) {
        header.textContent = `${clientName} (Since Inception) - Target: ${objectiveAnnual.toFixed(2)}% objective + ${avgInflation.toFixed(2)}% avg qtly inflation = ${targetAnnual.toFixed(2)}% p.a.`;
    } else {
        header.textContent = `${clientName} (${clientRollingYears}-Year Rolling) - Target: ${objectiveAnnual.toFixed(2)}% objective + ${avgInflation.toFixed(2)}% avg qtly inflation = ${targetAnnual.toFixed(2)}% p.a.`;
    }
    section.appendChild(header);
    
    const table = document.createElement('table');
    table.className = 'forecast-table';
    table.style.fontSize = '0.9em';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Quarter End</th>
            <th>Months Forward</th>
            <th>Required Monthly Return %</th>
            <th>Required Quarterly Return %</th>
            <th>Required Cumulative Return %</th>
            <th>Required Annual Return %</th>
        </tr>
    `;
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    
    // Forecasts are measured from the latest actual return month, not the saved FUM date.
    const lastActualDate = getForecastAnchorDate();
    
    // Get forecast assumptions
    const assumptions = globalData.forecastAssumptions?.[clientName];
    if (!assumptions) {
        contentDiv.innerHTML = '<p style="color: var(--text-secondary);">Generate a forecast first.</p>';
        return;
    }
    
    for (let q = 0; q < quarters.length; q++) {
        const quarter = quarters[q];
        const monthsFromNow = quarter.monthsFromNow;
        
        // Get the forecasted benchmark rolling return for this quarter
        const forecastResults = globalData.forecastResults;
        if (!forecastResults || !forecastResults[clientName]) {
            continue;
        }
        const forecastData = forecastResults[clientName][q];
        if (!forecastData || forecastData.benchmark === null) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${quarter.label} (${formatQuarterDate(quarter.date)})</td>
                <td>${monthsFromNow}</td>
                <td colspan="4" style="text-align: center; color: var(--text-secondary);">Insufficient history for rolling calculation</td>
            `;
            tbody.appendChild(row);
            continue;
        }
        
        const required = computeClientRequiredReturn(clientName, q);
        if (!required) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${quarter.label} (${formatQuarterDate(quarter.date)})</td>
                <td>${monthsFromNow}</td>
                <td colspan="4" style="text-align: center; color: var(--text-secondary);">Unable to compute required return</td>
            `;
            tbody.appendChild(row);
            continue;
        }

        const requiredMonthly = required.requiredMonthly;
        const requiredQuarterly = required.requiredQuarterly;
        const requiredCumulative = required.requiredCumulative;
        const requiredAnnual = required.requiredAnnual;
        
        const row = document.createElement('tr');
        // Show cumulative up to 12 months, then annual
        const cumulativeDisplay = monthsFromNow <= 12 ? formatReturn(requiredCumulative) : '—';
        const annualDisplay = monthsFromNow >= 12 ? formatReturn(requiredAnnual) : '—';
        
        row.innerHTML = `
            <td>${quarter.label} (${formatQuarterDate(quarter.date)})</td>
            <td>${monthsFromNow}</td>
            <td>${formatReturn(requiredMonthly)}</td>
            <td>${formatReturn(requiredQuarterly)}</td>
            <td>${cumulativeDisplay}</td>
            <td>${annualDisplay}</td>
        `;
        tbody.appendChild(row);
    }
    
    table.appendChild(tbody);
    section.appendChild(table);
    contentDiv.appendChild(section);
}

// ---------- Tab switching ----------
function switchDiagnosticTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');
    
    tabs.forEach(tab => {
        if (tab.id === `diagnosticTab-${tabName}`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    buttons.forEach((button, index) => {
        const isActive = (tabName === 'returns' && index === 0) || 
                        (tabName === 'required' && index === 1) || 
                        (tabName === 'forecast' && index === 2);
        if (isActive) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// ---------- Export placeholder ----------
function exportReport() {
    alert('Export functionality placeholder');
}

// ---------- Initialization ----------
document.addEventListener('DOMContentLoaded', () => {
    loadEmbeddedData();
});

function loadEmbeddedData() {
    const statusDiv = document.getElementById('loadStatus');
    const debugDiv = document.getElementById('debugInfo');
    
    function updateStatus(message) {
        if (statusDiv) statusDiv.textContent = message;
        if (debugDiv) debugDiv.innerHTML += message + '<br>';
    }
    
    try {
        updateStatus('Checking for client data...');
        
        if (typeof CLIENT_DATA === 'undefined') {
            throw new Error('CLIENT_DATA not found. Files may be cached.');
        }
        updateStatus('✓ CLIENT_DATA found');
        
        if (typeof calculator === 'undefined') {
            throw new Error('calculator not found. Files may be cached.');
        }
        updateStatus('✓ calculator found');
        
        updateStatus('Loading client data...');
        globalData.clients = CLIENT_DATA.clients;
        globalData.dates = CLIENT_DATA.dates || [];
        updateStatus(`✓ Loaded ${Object.keys(globalData.clients).length} clients`);

        updateStatus('Calculating metrics...');
        for (let clientName in globalData.clients) {
            const client = globalData.clients[clientName];
            client.metrics = calculator.calculatePerformanceMetrics(client.actual, client.benchmark);
        }
        updateStatus('✓ Metrics calculated');

        updateStatus('Populating UI components...');
        seedDefaultFUMDatasets();
        populateHistoricalClientSelector();
        populateFUMInputs();
        populateClientForecastInputs();
        populateSavedDates();
        populatePerformanceDateSelector();
        loadFUMData();
        updateForecastObjectiveDisplays();
        updateMainTable();
        
        // Load saved forecast inputs if available
        loadForecastInputs();
        populateSavedForecastDatasets();

        updateStatus('✓ Dashboard loaded successfully!');
        
        setTimeout(() => {
            document.getElementById('loadingMessage').style.display = 'none';
            document.getElementById('dashboardContent').style.display = 'block';
        }, 500);
        
    } catch (err) {
        console.error('Error loading data:', err);
        const loadingMsg = document.getElementById('loadingMessage');
        loadingMsg.innerHTML = `
            <div style="color: #dc3545; padding: 20px; background: #fff; border-radius: 8px; border: 2px solid #dc3545; max-width: 800px; margin: 0 auto;">
                <h3>❌ Error loading client data</h3>
                <p><strong>${err.message}</strong></p>
                <div id="debugInfo" style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 4px; text-align: left; font-family: monospace; font-size: 12px;"></div>
                <p><strong>The browser is serving CACHED (old) files.</strong></p>
                <p>Please do a <strong>HARD REFRESH</strong> to force reload:</p>
                <ul style="text-align: left; margin: 10px auto; display: inline-block; font-size: 14px;">
                    <li><strong>Windows:</strong> Press <code>Ctrl + F5</code> or <code>Ctrl + Shift + R</code></li>
                    <li><strong>Mac:</strong> Press <code>Cmd + Shift + R</code></li>
                    <li><strong>Alternative:</strong> Press F12, right-click refresh button, select "Empty Cache and Hard Reload"</li>
                </ul>
                <p style="margin-top: 20px;">
                    <button onclick="location.reload(true)" style="padding: 10px 20px; font-size: 16px; cursor: pointer; background: #0066cc; color: white; border: none; border-radius: 4px; margin-right: 10px;">Try Regular Reload</button>
                    <button onclick="window.location.href = window.location.href.split('?')[0] + '?cb=' + Date.now()" style="padding: 10px 20px; font-size: 16px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 4px;">Force Cache Bust</button>
                </p>
            </div>
        `;
        if (debugDiv) {
            loadingMsg.querySelector('#debugInfo').innerHTML = debugDiv.innerHTML;
        }
    }
}