import pandas as pd
import json
import math

# Read the Excel file
file_path = "Client Returns.xlsx"
df = pd.read_excel(file_path, header=None)

# Locate the first dashboard data block: Dates / Type / client columns.
header_row_index = None
for row_index in range(len(df)):
    first_cell = df.iloc[row_index, 0]
    second_cell = df.iloc[row_index, 1] if df.shape[1] > 1 else None
    if str(first_cell).strip() == 'Dates' and str(second_cell).strip() == 'Type':
        header_row_index = row_index
        break

if header_row_index is None:
    raise ValueError("Could not find a 'Dates'/'Type' header row in Client Returns.xlsx")

client_columns = []
for col_index in range(2, df.shape[1]):
    header_value = df.iloc[header_row_index, col_index]
    if pd.isna(header_value) or str(header_value).strip() == 'Dates':
        break
    client_columns.append((col_index, str(header_value).strip()))

client_names = [client_name for _, client_name in client_columns]

# Separate Benchmark and Actual rows
benchmark_df = df[df.iloc[:, 1] == 'Benchmark'].reset_index(drop=True)
actual_df = df[df.iloc[:, 1] == 'Actual'].reset_index(drop=True)

# Build data structure
data = {
    'clients': {}
}

def clean_value(val):
    """Convert NaN to None for valid JSON"""
    if pd.isna(val) or (isinstance(val, float) and math.isnan(val)):
        return None
    return val

for col_index, client in client_columns:
    
    # Get actual and benchmark returns for this client, convert NaN to None
    actual_returns = [clean_value(x) for x in actual_df.iloc[:, col_index].tolist()]
    benchmark_returns = [clean_value(x) for x in benchmark_df.iloc[:, col_index].tolist()]
    
    data['clients'][client] = {
        'actual': actual_returns,
        'benchmark': benchmark_returns
    }

# Extract dates from the actual_df (first column contains dates)
dates = [str(d) if not pd.isna(d) else None for d in actual_df.iloc[:, 0].tolist()]
data['dates'] = dates

# Save to JSON file
with open('client_data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

# Also create a JavaScript file with embedded data
js_content = (
    "// Auto-generated client data\n"
    "(function() {\n"
    "    if (typeof document === 'undefined') return;\n"
    "    const debugDiv = document.getElementById('debugInfo');\n"
    "    if (debugDiv) debugDiv.innerHTML += '✓ client_data.js loaded<br>';\n"
    "})();\n\n"
    f"const CLIENT_DATA = {json.dumps(data, indent=2)};\n"
)
with open('client_data.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"Successfully converted data for {len(client_names)} clients")
print(f"Clients: {', '.join(client_names)}")
print(f"Data points per client: {len(actual_returns)} actual, {len(benchmark_returns)} benchmark")
print("Data saved to client_data.json and client_data.js")
