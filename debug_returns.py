import pandas as pd
import math

# Read the Excel file
file_path = "Client Returns.xlsx"
df = pd.read_excel(file_path, header=None)

# Get client names
client_names = df.iloc[0, 2:].tolist()

# Separate Benchmark and Actual rows
benchmark_df = df[df.iloc[:, 1] == 'Benchmark'].reset_index(drop=True)
actual_df = df[df.iloc[:, 1] == 'Actual'].reset_index(drop=True)

# Look at first client
client = client_names[0]
col_index = 2  # First client column

print(f"Analyzing {client}")
print(f"\nFirst 20 actual return values:")
actual_values = actual_df.iloc[:20, col_index].tolist()
for i, val in enumerate(actual_values):
    print(f"  Row {i+1}: {val}")

print(f"\nLast 20 actual return values:")
actual_values_last = actual_df.iloc[-20:, col_index].tolist()
for i, val in enumerate(actual_values_last):
    print(f"  Row {len(actual_df)-20+i+1}: {val}")

# Calculate 8-year rolling return manually
print(f"\n\nManual 8-year rolling return calculation:")
window_months = 96
recent_returns = actual_df.iloc[-window_months:, col_index].tolist()

# Remove None/NaN values
valid_returns = [r for r in recent_returns if not pd.isna(r) and r is not None]
print(f"Valid returns in window: {len(valid_returns)}")
print(f"Sample returns: {valid_returns[:5]}")
print(f"Sample returns: {valid_returns[-5:]}")

# Calculate compound return
compounded = 1
for r in valid_returns:
    compounded *= (1 + r / 100)

print(f"\nCompounded value: {compounded}")

# Annualize
years = len(valid_returns) / 12
annualized = (math.pow(compounded, 1 / years) - 1) * 100

print(f"Years: {years}")
print(f"Annualized return: {annualized:.2f}%")

# Try alternative: maybe data is in decimal format already?
print(f"\n\nAlternative calculation (if data is decimal):")
compounded2 = 1
for r in valid_returns:
    compounded2 *= (1 + r)  # No division by 100

annualized2 = (math.pow(compounded2, 1 / years) - 1) * 100
print(f"Annualized return: {annualized2:.2f}%")
