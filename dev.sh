#!/bin/bash
# Tek komutla frontend (5173) + backend (8787) birlikte kalkar.
# ponytail: neden bu script var — BE-31 (bkz. talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon):
# booking.html'deki "Choose a time" slotları backend'e (wrangler dev) bagli; sadece frontend'i
# baslatip backend'i unutmak "slot takvimi yok" seklinde goruniyordu ama backend hic ayakta degildi.
set -e
pkill -f "wrangler dev" 2>/dev/null || true
pkill -f "workerd serve" 2>/dev/null || true

cd "$(dirname "$0")/form-backend"
npx wrangler dev --port 8787 &
BACKEND_PID=$!

cd - >/dev/null
python3 -m http.server 5173 &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8787 (pid $BACKEND_PID)"
echo "Frontend: http://localhost:5173/booking.html (pid $FRONTEND_PID)"
echo ""
echo "Durdurmak icin: kill $BACKEND_PID $FRONTEND_PID   (veya Ctrl+C)"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
