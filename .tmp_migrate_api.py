from pathlib import Path
files = [
    'client/src/components/AdminDashboard.jsx',
    'client/src/components/CartCheckout.jsx',
    'client/src/components/ChatAndAI.jsx',
    'client/src/components/CustomerDashboard.jsx',
    'client/src/components/DetailsModal.jsx',
    'client/src/components/Marketplace.jsx',
    'client/src/components/PaymentSuccess.jsx',
    'client/src/components/RiderDashboard.jsx',
    'client/src/components/SellerDashboard.jsx'
]
for f in files:
    path = Path(f)
    text = path.read_text(encoding='utf-8')
    text = text.replace("import axios from 'axios';", "import api from '../utils/api';")
    text = text.replace('axios.', 'api.')
    path.write_text(text, encoding='utf-8')
    print(f'patched {f}')
