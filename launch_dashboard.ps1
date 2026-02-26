# Launch Client Returns Dashboard
# This script starts a local web server and opens the dashboard

Write-Host "Starting Client Returns Dashboard..." -ForegroundColor Cyan

# Start the local web server on port 8080
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m http.server 8080"

# Wait for server to start
Start-Sleep -Seconds 2

# Open the dashboard in default browser
Start-Process "http://localhost:8080/dashboard.html"

Write-Host "Dashboard launched at http://localhost:8080/dashboard.html" -ForegroundColor Green
Write-Host "To stop the server, close the Python HTTP server window." -ForegroundColor Yellow
