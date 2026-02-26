import pandas as pd
import json
import math

# Read the Excel file
file_path = "Client Returns.xlsx"
df = pd.read_excel(file_path, header=None)

# Get client names from first row (skip first 2 columns: Dates and Type)
client_names = df.iloc[0, 2:].tolist()

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

for i, client in enumerate(client_names):
    col_index = i + 2  # Skip Dates and Type columns
    
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
with open('client_data.json', 'w') as f:
    json.dump(data, f, indent=2)

# Also create a JavaScript file with embedded data
js_content = f"// Auto-generated client data\nconst CLIENT_DATA = {json.dumps(data, indent=2)};\n"
with open('client_data.js', 'w') as f:
    f.write(js_content)

print(f"Successfully converted data for {len(client_names)} clients")
print(f"Clients: {', '.join(client_names)}")
print(f"Data points per client: {len(actual_returns)} actual, {len(benchmark_returns)} benchmark")
print("Data saved to client_data.json and client_data.js")
