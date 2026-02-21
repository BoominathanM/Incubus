import React from 'react'
import { Breadcrumb } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { HomeOutlined } from '@ant-design/icons'

const Breadcrumbs = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const getBreadcrumbItems = () => {
    const path = location.pathname
    const items = [
      {
        title: (
          <span
            style={{
              color: '#15B9A4',
              cursor: 'pointer',
            }}
          >
            <HomeOutlined style={{ marginRight: 4 }} />
            <span>Home</span>
          </span>
        ),
        onClick: () => {
          if (path.includes('/admin')) navigate('/admin/dashboard')
          else if (path.includes('/executive')) navigate('/executive/dashboard')
          else if (path.includes('/billing')) navigate('/billing/dashboard')
          else if (path.includes('/warehouse')) navigate('/warehouse/dashboard')
        },
      },
    ]

    // Admin routes
    if (path.includes('/admin')) {
      if (path.includes('/dashboard')) {
        items.push({ title: 'Dashboard' })
      } else if (path.includes('/orders')) {
        items.push({ title: 'Order Management' })
        if (path.match(/\/orders\/[^/]+$/)) {
          items.push({ title: 'Order Details' })
        }
      } else if (path.includes('/retailers')) {
        items.push({ title: 'Retailer Board' })
      } else if (path.includes('/agent-management')) {
        items.push({ title: 'Agent Management' })
      } else if (path.includes('/whatsapp-integration')) {
        items.push({ title: 'WhatsApp Integration' })
      } else if (path.includes('/notifications')) {
        items.push({ title: 'Notifications' })
      }
    }

    // Executive routes
    if (path.includes('/executive')) {
      if (path.includes('/dashboard')) {
        items.push({ title: 'Dashboard' })
      } else if (path.includes('/customers')) {
        items.push({ title: 'Customer Board' })
      }
    }

    // Billing routes
    if (path.includes('/billing')) {
      if (path.includes('/dashboard')) {
        items.push({ title: 'Dashboard' })
      } else if (path.includes('/orders')) {
        items.push({ title: 'Dashboard', onClick: () => navigate('/billing/dashboard') })
        if (path.match(/\/orders\/[^/]+$/)) {
          items.push({ title: 'Order Details' })
        } else {
          items.push({ title: 'Order Management' })
        }
      }
    }

    // Warehouse routes
    if (path.includes('/warehouse')) {
      if (path.includes('/dashboard')) {
        items.push({ title: 'Dashboard' })
      } else if (path.includes('/orders')) {
        items.push({ title: 'Dashboard', onClick: () => navigate('/warehouse/dashboard') })
        if (path.match(/\/orders\/[^/]+$/)) {
          items.push({ title: 'Order Details' })
        } else {
          items.push({ title: 'Order Management' })
        }
      }
    }

    return items
  }

  return (
    <Breadcrumb
      items={getBreadcrumbItems()}
      style={{ marginBottom: 16 }}
    />
  )
}

export default Breadcrumbs
