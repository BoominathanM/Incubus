import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { ConfigProvider } from 'antd'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { store } from './store'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <ConfigProvider>
          <App />
        </ConfigProvider>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
)
