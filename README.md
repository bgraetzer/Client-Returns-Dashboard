# Client Returns Dashboard

A comprehensive, browser-based financial dashboard for analyzing client portfolio performance.

## Features

### 📊 Performance Metrics
- **Multiple Time Periods**: 1M, 3M, FYTD, 6M, 1Y, 3Y, 5Y, 8Y, 10Y, and Since Inception
- **Three Data Views**: Actual Returns, Benchmark Returns, and Relative Performance
- **Annualized Returns**: Automatic calculation of annualized returns for periods >= 1 year

### 📈 Rolling Returns Analysis
- Configurable rolling windows (8 or 10 years)
- Visual chart showing historical rolling performance
- Compare actual vs. benchmark over rolling periods
- Interactive selection per client

### 💰 Weighted Returns
- **Automatic FUM extraction from PDF reports**
- Manual FUM (Funds Under Management) input for each client
- Automatic calculation of weighted portfolio returns
- Aggregated view across all clients
- Save and load FUM data with dates

### 📄 PDF Integration
- Upload Asset Allocation Report PDFs to auto-extract FUM values
- Automatic date detection from filenames
- Works with local files (no SharePoint connection required)
- Supports standard VFMC report format

### 🔮 Forecasting
Two forecasting modes:
1. **Manual Returns**: Specify monthly return expectations per client
2. **Benchmark-Based**: Enter benchmark return and required outperformance
   - Automatically calculates required monthly actual return

### 📋 Comparison Table
- Side-by-side comparison of all clients
- Quick view of relative performance across all time periods
- Color-coded for easy identification of outperformance/underperformance

## Getting Started

### Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Your Excel file: `Client Returns.xlsx`

### Excel File Format
Your Excel file should be structured as follows:
- **Row 1**: Client names
- **Columns**: Alternating Actual and Benchmark returns for each client
  - Column B: Client 1 Actual
  - Column C: Client 1 Benchmark
  - Column D: Client 2 Actual
  - Column E: Client 2 Benchmark
  - (and so on...)
- **Data Rows**: Monthly returns in percentage format (e.g., 1.5 for 1.5%)

### How to Use

1. **Open the Dashboard**
   - **Recommended**: Right-click `launch_dashboard.ps1` and select "Run with PowerShell"
   - Or manually: Open PowerShell in this folder and run `python -m http.server 8080`, then open http://localhost:8080/dashboard.html in your browser
   - Note: Port 8080 is used to avoid conflicts with other services

2. **Load Your Data**
   - Click the "📁 Load Client Returns.xlsx" button
   - Select your Excel file
   - Data will be automatically processed and displayed

3. **Select a Client**
   - Use the client dropdown to select which client to analyze
   - Choose 8-year or 10-year rolling objective

4. **View Performance**
   - Performance metrics display automatically
   - Scroll through the rolling returns chart
   - Check the comparison table for all clients

5. **Load FUM Data** (Three Simple Options)
   
   **Option A: Load from PDF File**
   - Click "📄 Select PDF File"
   - Browse to and select the Asset Allocation Report PDF (e.g., "Client Asset Allocation Report 31 December 2025.pdf")
   - FUM values are automatically extracted from the Grand Total rows
   - Date is auto-detected from the filename
   - Review the extracted values
   
   **Option B: Load Previously Saved Data**
   - Select a saved date from the dropdown
   - All FUM values, objectives, and settings are instantly restored
   
   **Option C: Enter Manually**
   - Click "🆕 Start Fresh" to clear all fields
   - Today's date is automatically set
   - Type FUM values directly into each client field
   - Set rolling windows and objectives as needed
   
6. **Save Client Data**

6. **Save Client Data**
   - Review the FUM values (from PDF, saved data, or manual entry)
   - Adjust Rolling Return Window and Objectives as needed
   - Click "💾 Save All Client Data"
   - Data is saved to browser storage with the selected date
   - View aggregated portfolio performance in the table

7. **Generate Forecasts**
   - Select forecast mode (Manual or Benchmark-based)
   - Enter forecast parameters
   - Set forecast period in months
   - Click "Generate Forecast"
   - View projected rolling returns

### Data Backup & Recovery

**IMPORTANT**: To prevent data loss, regularly backup your saved FUM data:

1. **Export Backup**
   - Click "📦 Export Backup" button
   - A JSON file will be downloaded with all your saved dates and client data
   - Store this file safely (e.g., in OneDrive or a backup folder)

2. **Import Backup**
   - Click "📥 Import Backup" button
   - Select your previously exported JSON backup file
   - Choose to merge with existing data or replace all data
   - Your saved FUM datasets will be restored

3. **View Saved Data**
   - Click "📋 View Saved Data" to see all your saved dates
   - Useful for verifying what data is currently stored
   - Can export to console for manual backup if needed

### PDF FUM Extraction

The dashboard can automatically extract FUM values from VFMC Asset Allocation Report PDFs:

#### How It Works

1. **Select the PDF File**
   - Click "📄 Select PDF File"
   - Browse to the Asset Allocation Report (e.g., "Client Asset Allocation Report 31 December 2025.pdf")
   - The file can be stored anywhere (local folder, OneDrive, Downloads, etc.)

2. **Automatic Extraction**
   - Extracts FUM values from the "Grand Total" row for each client:
     - ESSDB (Emergency Services Superannuation Scheme)
     - ESSSF (Ex State Superannuation Fund)
     - TAC (Transport Accident Commission)
     - VMIA (Victorian Managed Insurance Authority)
     - VWA (Victorian Workcover Authority)
     - VIF (Victorian Investment Fund)
   - Detects the date from the filename (format: "DD Month YYYY")
   - Populates all FUM input fields automatically

3. **Review and Save**
   - Check the extracted values for accuracy
   - Adjust Rolling Return Windows and Objectives as needed
   - Click "💾 Save All Client Data" to store for future use

#### Supported PDF Format
- Standard VFMC Asset Allocation Report format
- Filename must contain date in format: "DD Month YYYY" (e.g., "31 December 2025")
- Works with PDFs from any location (no SharePoint connection required)

**Note**: Browser localStorage can be cleared when:
- Clearing browsing data
- Using private/incognito mode
- Switching browsers
- Browser updates or crashes

Always keep an external backup of important data!

## Technical Details

### Technologies Used
- **HTML5/CSS3**: Modern, responsive interface
- **JavaScript (ES6+)**: Core functionality
- **Chart.js**: Beautiful, interactive charts
- **SheetJS**: Excel file reading

### Calculation Methods
- **Annualized Returns**: Geometric mean (compound growth rate)
- **Rolling Returns**: Sliding window calculations
- **Weighted Returns**: FUM-weighted averages
- **FYTD**: Financial Year to Date (July 1 to current)

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## File Structure
```
Client Returns Dashboard/
├── dashboard.html         # Main HTML interface
├── styles.css             # Styling and responsive design
├── calculations.js        # Financial calculation engine
├── dashboard.js           # Main dashboard logic

├── launch_dashboard.ps1   # PowerShell script to launch dashboard

├── README.md              # This file
└── Client Returns.xlsx    # Your data file
```

## Features Breakdown

### Performance Calculation
- Handles missing data gracefully
- Accurate compound return calculations
- Proper annualization for multi-year periods

### User Interface
- Clean, modern design with gradient backgrounds
- Color-coded performance indicators:
  - 🟢 Green: Positive returns/outperformance
  - 🔴 Red: Negative returns/underperformance
  - ⚪ Gray: Neutral or N/A
- Responsive design works on all screen sizes
- Smooth animations and transitions

### Data Validation
- Automatic detection of invalid data
- Graceful handling of missing values
- Clear error messages

## Tips for Best Results

1. **Data Quality**: Ensure your Excel file has consistent data formatting
2. **FUM Entry**: Enter FUM values in millions (e.g., 100 for $100M)
3. **Forecast Period**: Use realistic forecast periods (120-240 months typical)
4. **Rolling Objectives**: Choose 8 or 10 years based on your investment mandate

## Future Enhancements

Potential additions could include:
- PDF/Excel export functionality
- Historical comparison charts
- Risk metrics (Sharpe ratio, volatility, etc.)
- Multiple benchmark comparisons
- Sector/asset allocation views
- Mobile app version

## Support

For questions or issues:
1. Check that your Excel file matches the required format
2. Ensure you're using a modern browser
3. Try refreshing the page if data doesn't load
4. Check browser console (F12) for error messages

## Version History

- **v1.0** (February 2026)
  - Initial release
  - All core features implemented
  - Full forecasting capability
  - Weighted returns functionality

---

**Created**: February 2026  
**Last Updated**: February 6, 2026

Enjoy your new Client Returns Dashboard! 📊📈
