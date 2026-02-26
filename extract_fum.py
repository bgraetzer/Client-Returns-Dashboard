import pdfplumber
import re
import json

pdf_path = r"Client Asset Allocation Report 31 December 2025.pdf"

try:
    with pdfplumber.open(pdf_path) as pdf:
        all_text = ""
        for page in pdf.pages:
            all_text += page.extract_text() + "\n"
        
        # Print all text for debugging
        print("=== PDF CONTENT ===")
        print(all_text)
        print("\n=== END PDF CONTENT ===\n")
        
        # Look for Grand Total rows
        lines = all_text.split('\n')
        fum_data = {}
        current_client = None
        
        for i, line in enumerate(lines):
            # Try to identify client sections
            if any(keyword in line.upper() for keyword in ['ESSDB', 'ESSSF', 'TAC', 'VMIA', 'VWA', 'VIF']):
                # Extract client name
                for client in ['ESSDB', 'ESSSF', 'TAC', 'VMIA', 'VWA', 'VIF']:
                    if client in line.upper():
                        current_client = client
                        print(f"Found client section: {current_client}")
                        break
            
            # Look for Grand Total
            if 'GRAND TOTAL' in line.upper() or 'TOTAL' in line.upper():
                print(f"Line {i}: {line}")
                # Try to extract numeric values (looking for millions)
                numbers = re.findall(r'[\d,]+\.?\d*', line)
                if numbers and current_client:
                    # The FUM is likely the largest number or first significant number
                    values = [float(num.replace(',', '')) for num in numbers]
                    print(f"  Found numbers: {values}")
                    if values:
                        fum_value = max(values)  # Assuming FUM is the largest value
                        fum_data[current_client] = fum_value
                        print(f"  Assigned {fum_value} to {current_client}")
        
        print("\n=== EXTRACTED FUM DATA ===")
        print(json.dumps(fum_data, indent=2))
        
except Exception as e:
    print(f"Error reading PDF: {e}")
    import traceback
    traceback.print_exc()
