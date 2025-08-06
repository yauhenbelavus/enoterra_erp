Write-Host "Pushing changes to GitHub..." -ForegroundColor Green

# Выполняем git push
& git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "🚀 GitHub Actions will automatically deploy to VPS" -ForegroundColor Yellow
} else {
    Write-Host "❌ Failed to push to GitHub" -ForegroundColor Red
}

Read-Host "Press Enter to continue" 