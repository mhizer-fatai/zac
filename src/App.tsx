import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DirectoryProvider } from './lib/directory'
import { ToastProvider } from './lib/toast'
import { WalletProvider } from './lib/walletContext'
import { Home } from './pages/Home'
import { NotFoundPage } from './pages/NotFound'
import { PayPage } from './pages/Pay'
import { PrivacyPage } from './pages/Privacy'
import { ProfilePage } from './pages/Profile'
import { ReceivePage } from './pages/Receive'
import { SealedPayPage } from './pages/SealedPay'
import { SendPage } from './pages/Send'
import { SettingsPage } from './pages/Settings'
import { SplitPage } from './pages/Split'

export default function App() {
  return (
    <HashRouter>
      <WalletProvider>
        <DirectoryProvider>
          <ToastProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="send" element={<SendPage />} />
                <Route path="receive" element={<ReceivePage />} />
                <Route path="split" element={<SplitPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="pay/:payload" element={<PayPage />} />
                <Route path="r/:token" element={<SealedPayPage />} />
                <Route path=":username" element={<ProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </ToastProvider>
        </DirectoryProvider>
      </WalletProvider>
    </HashRouter>
  )
}
