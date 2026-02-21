import React from 'react'
import { Typography } from 'antd'
import Breadcrumbs from '../../components/Breadcrumbs'
import OrderManagementTable from '../../components/OrderManagementTable'

const { Title } = Typography

const WarehouseOrders = () => (
  <div>
    <Breadcrumbs />
    <Title level={2}>Order Management</Title>
    <OrderManagementTable detailPathPrefix="/warehouse" />
  </div>
)

export default WarehouseOrders
