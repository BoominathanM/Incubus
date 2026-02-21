import React, { createContext, useContext, useState, useEffect } from 'react'
import { ConfigProvider, theme } from 'antd'

const ThemeContext = createContext()

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : false
  })

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    document.body.className = isDark ? 'dark-theme' : 'light-theme'
  }, [isDark])

  const toggleTheme = () => {
    setIsDark(!isDark)
  }

  const antdTheme = {
    token: {
      colorPrimary: '#15B9A4',
      colorSuccess: '#15B9A4',
      colorInfo: '#6754A3',
      colorText: isDark ? '#ffffff' : '#000000',
      colorBgBase: isDark ? '#141414' : '#ffffff',
      colorBgContainer: isDark ? '#1f1f1f' : '#ffffff',
      colorBorder: isDark ? '#434343' : '#d9d9d9',
    },
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <ConfigProvider theme={antdTheme}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}
