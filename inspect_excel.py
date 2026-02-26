import pandas as pd
import json

# Read the Excel file
file_path = "Client Returns.xlsx"
df = pd.read_excel(file_path, header=None)

# Get client names from first row (skip first 2 columns: Dates and Type)
client_names = df.iloc[0, 2:].tolist()
print("Clients found:", client_names)
print("Number of clients:", len(client_names))

# Get all data rows (skip header row)
data_rows = df.iloc[1:].values.tolist()

# Check for Benchmark and Actual rows alternating
print("\nFirst 10 Type values:")
print(df.iloc[1:11, 1].tolist())

# Count Benchmark and Actual rows
benchmark_count = (df.iloc[1:, 1] == 'Benchmark').sum()
actual_count = (df.iloc[1:, 1] == 'Actual').sum()
print(f"\nBenchmark rows: {benchmark_count}")
print(f"Actual rows: {actual_count}")
