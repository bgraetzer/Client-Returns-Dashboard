import pdfplumber
import re
import json

pdf_path = r"Client Asset Allocation Report 31 December 2025.pdf"

# Mapping from PDF names to dashboard client codes
client_mapping = {
    'FCIM': None,  # Need to ask user about this
    'VWA': 'VWA',
    'VICTORIAN WORKCOVER': 'VWA',
    'TAC': 'TAC',
    'TRANSPORT ACCIDENT': 'TAC',
    'VMIA': 'VMIA',
    'VMI': 'VMIA',
    'VICTORIAN MANAGED INSURANCE': 'VMIA',
    'SSF': 'ESSSF',
    'STATE SUPERANNUATION': 'ESSSF',
    'ESSS_DB': 'ESSDB',
    'EMERGENCY SERVICES': 'ESSDB',
    'VIF': 'VIF',
    'VICTORIAN INVESTMENT FUND': 'VIF'
}

try:
    with pdfplumber.open(pdf_path) as pdf:
        all_text = ""
        for page in pdf.pages:
            all_text += page.extract_text() + "\n"
        
        lines = all_text.split('\n')
        fum_data = {}
        current_section = None
        
        for i, line in enumerate(lines):
            # Detect client sections by various patterns
            line_upper = line.upper()
            
            # Specific section headers
            if 'FCIM CLIENTS' in line_upper and 'CONTINUED' not in line_upper:
                current_section = 'FCIM'
                print(f"Found section: FCIM at line {i}")
            elif 'VICTORIAN WORKCOVER' in line_upper or ('VWA' in line_upper and 'AUTHORITY' in line_upper):
                current_section = 'VWA'
                print(f"Found section: VWA at line {i}")
            elif 'TRANSPORT ACCIDENT COMMISSION' in line_upper:
                current_section = 'TAC'
                print(f"Found section: TAC at line {i}")
            elif 'VICTORIAN MANAGED INSURANCE' in line_upper or ('VMIA' in line_upper and not 'TAC' in line_upper):
                current_section = 'VMIA'
                print(f"Found section: VMIA at line {i}")
            elif 'STATE SUPERANNUATION FUND' in line_upper and 'SSF' in line_upper:
                current_section = 'ESSSF'
                print(f"Found section: ESSSF at line {i}")
            elif 'EMERGENCY SERVICES SUPERANNUATION' in line_upper and 'ESSS' in line_upper:
                current_section = 'ESSDB'
                print(f"Found section: ESSDB at line {i}")
            elif 'VICTORIAN INVESTMENT FUND' in line_upper and 'SHORT TERM' not in line_upper:
                current_section = 'VIF'
                print(f"Found section: VIF at line {i}")
            
            # Look for Grand Total lines
            if 'GRAND TOTAL' in line_upper.replace(':', ''):
                print(f"\nLine {i}: {line}")
                # Extract the FUM value (first number in millions)
                # Pattern: find numbers like 83,165.19 or 30,784.76
                match = re.search(r'(\d{1,3}(?:,\d{3})*\.\d{2})', line)
                if match and current_section:
                    fum_value = float(match.group(1).replace(',', ''))
                    print(f"  FUM: ${fum_value}M for {current_section}")
                    
                    # Map to dashboard client code
                    dashboard_client = client_mapping.get(current_section, current_section)
                    if dashboard_client and dashboard_client not in fum_data:
                        fum_data[dashboard_client] = fum_value
        
        print("\n=== EXTRACTED FUM DATA (in millions) ===")
        for client in ['ESSDB', 'ESSSF', 'TAC', 'VMIA', 'VWA', 'VIF']:
            value = fum_data.get(client, 'NOT FOUND')
            print(f"{client}: ${value}M" if value != 'NOT FOUND' else f"{client}: {value}")
        
        if 'FCIM' in fum_data or None in fum_data:
            print(f"\nFCIM (need mapping): ${fum_data.get('FCIM', fum_data.get(None, 'N/A'))}M")
        
        # Output as JSON for easy import
        print("\n=== JSON FORMAT ===")
        print(json.dumps(fum_data, indent=2))

except Exception as e:
    print(f"Error reading PDF: {e}")
    import traceback
    traceback.print_exc()
