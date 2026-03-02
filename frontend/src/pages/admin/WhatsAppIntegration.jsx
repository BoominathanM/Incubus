import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Tabs,
  Form,
  Input,
  Button,
  Space,
  Tag,
  Table,
  Switch,
  Typography,
  message,
  Modal,
  Select,
  Divider,
  Spin,
  Alert,
  Dropdown,
} from 'antd'
import {
  ArrowLeftOutlined,
  LockOutlined,
  MessageOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  DisconnectOutlined,
  SyncOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  MoreOutlined,
  InboxOutlined,
  PhoneOutlined,
  ShopOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import {
  useGetAskevaConfigQuery,
  useGetAskevaCredentialsQuery,
  useSaveAskevaConfigMutation,
  useTestAskevaConnectionMutation,
  useDisconnectAskevaMutation,
  useSyncAskevaTemplatesMutation,
  useGetAskevaTemplatesQuery,
  useGetEventTemplateMappingsQuery,
  useSaveEventTemplateMappingMutation,
  useDeleteEventTemplateMappingMutation,
  useGetWebhookMessagesQuery,
  useMarkWebhookMessagesReadMutation,
} from '../../store/api/askevaApi'

const { Title, Text } = Typography
const { Option } = Select

const DEFAULT_BACKEND_URL = 'https://backend.askeva.io'

const HRMS_EVENT_OPTIONS = [
  { value: 'Billing Invoice Generate', label: 'Billing Invoice' },
  { value: 'Dispatch Order', label: 'Dispatch Order' },
  { value: 'Delivery Completed', label: 'Delivery Completed' },
]

const TEMPLATE_FIELD_OPTIONS = [
  { value: 'Candidate Name (Candidate)', label: 'Candidate Name (Candidate)' },
  { value: 'Job Title (Job)', label: 'Job Title (Job)' },
  { value: 'Department (Department)', label: 'Department (Department)' },
  { value: 'Salary (Compensation)', label: 'Salary (Compensation)' },
]

const WhatsAppIntegration = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('configuration')
  const [form] = Form.useForm()
  const [eventForm] = Form.useForm()
  const [eventModalVisible, setEventModalVisible] = useState(false)
  const [disconnectModalVisible, setDisconnectModalVisible] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [variableMappings, setVariableMappings] = useState([])
  const [editingMappingId, setEditingMappingId] = useState(null)
  const [editConfigMode, setEditConfigMode] = useState(false)
  const [templatePage, setTemplatePage] = useState(1)
  const [templatePageSize, setTemplatePageSize] = useState(10)
  const [inboxPage, setInboxPage] = useState(1)
  const [inboxPageSize, setInboxPageSize] = useState(20)
  const [inboxFilter, setInboxFilter] = useState('all') // 'all' | 'matched' | 'unmatched' | 'unread'
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false)

  const { data: configRes, isLoading: configLoading } = useGetAskevaConfigQuery()
  const { data: credentialsRes } = useGetAskevaCredentialsQuery(undefined, { skip: !editConfigMode })
  const [saveConfig, { isLoading: saveConfigLoading }] = useSaveAskevaConfigMutation()
  const [testConnection, { isLoading: testLoading }] = useTestAskevaConnectionMutation()
  const [disconnect, { isLoading: disconnectLoading }] = useDisconnectAskevaMutation()
  const [syncTemplates, { isLoading: syncLoading }] = useSyncAskevaTemplatesMutation()
  const templatesQueryParams =
    activeTab === 'templates'
      ? { page: templatePage, limit: templatePageSize }
      : { limit: 10000 }
  const { data: templatesRes, isLoading: templatesLoading } = useGetAskevaTemplatesQuery(
    templatesQueryParams,
    { skip: activeTab !== 'templates' && activeTab !== 'eventMapping' }
  )
  const { data: mappingsRes, isLoading: mappingsLoading } = useGetEventTemplateMappingsQuery(undefined, {
    skip: activeTab !== 'eventMapping',
  })
  const [saveEventMapping, { isLoading: saveMappingLoading }] = useSaveEventTemplateMappingMutation()
  const [deleteEventMapping] = useDeleteEventTemplateMappingMutation()

  const inboxQueryParams = activeTab === 'webhookInbox' ? {
    page: inboxPage,
    limit: inboxPageSize,
    ...(inboxFilter === 'matched' ? { retailerMatched: 'true' } : {}),
    ...(inboxFilter === 'unmatched' ? { retailerMatched: 'false' } : {}),
    ...(inboxFilter === 'unread' ? { isRead: 'false' } : {}),
  } : null
  const { data: inboxRes, isLoading: inboxLoading, refetch: refetchInbox } = useGetWebhookMessagesQuery(
    inboxQueryParams,
    { skip: activeTab !== 'webhookInbox', pollingInterval: 30000 }
  )
  const [markRead] = useMarkWebhookMessagesReadMutation()

  const inboxMessages = inboxRes?.data?.messages ?? []
  const inboxTotal = inboxRes?.data?.pagination?.total ?? 0
  const inboxUnread = inboxRes?.data?.unreadCount ?? 0

  const config = configRes?.data?.config ?? null
  const isConfigured = !!config
  const isConnected = config?.isConnected ?? false
  const connectionError = config?.connectionError || null
  const fieldsDisabled = isConfigured && !editConfigMode
  const templates = templatesRes?.data?.templates ?? []
  const templatesPagination = templatesRes?.data?.pagination ?? {}
  const templatesTotal = templatesPagination.total ?? templates.length
  const eventMappings = (mappingsRes?.data?.mappings ?? []).map((m) => ({
    ...m,
    key: m._id,
    eventType: m.hrmsEventType,
    template: m.templateName || (m.templateId?.templateName && `${m.templateId.templateName} (${m.templateId.language || ''})`) || '—',
    variablesMapped: (m.variables || []).length,
    status: m.isEnabled,
  }))

  useEffect(() => {
    if (isConfigured && config) {
      form.setFieldsValue({
        backendUrl: config.backendUrl || DEFAULT_BACKEND_URL,
        apiKey: '••••••••',
      })
    } else if (!isConfigured) {
      form.setFieldsValue({
        backendUrl: DEFAULT_BACKEND_URL,
        apiKey: '',
      })
    }
  }, [isConfigured, config, form])

  useEffect(() => {
    const cred = credentialsRes?.data
    if (editConfigMode && cred) {
      form.setFieldsValue({
        apiKey: cred.apiKey ?? '',
        backendUrl: cred.backendUrl || DEFAULT_BACKEND_URL,
      })
    }
  }, [editConfigMode, credentialsRes?.data?.apiKey, credentialsRes?.data?.backendUrl, form])

  const lastSyncedAt = config?.lastSyncedAt
    ? new Date(config.lastSyncedAt).toLocaleString()
    : null

  const templateColumns = [
    {
      title: 'Template Name',
      dataIndex: 'templateName',
      key: 'templateName',
    },
    {
      title: 'Components',
      dataIndex: 'components',
      key: 'components',
      render: (comp) => (
        <Text style={{ color: '#15B9A4' }}>
          {Array.isArray(comp)
            ? comp.map((c) => (typeof c === 'object' ? c?.type || c?.name : c)).filter(Boolean).join(' ') || '—'
            : (comp || '—')}
        </Text>
      ),
    },
    {
      title: 'Language',
      dataIndex: 'language',
      key: 'language',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (c) => <Tag color="#6754A3">{c || '—'}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color="#52c41a">{s || '—'}</Tag>,
    },
    {
      title: 'Mapped Events',
      key: 'mappedEvents',
      render: (_, record) => {
        const events = record.mappedEventTypes || []
        const text = events.length ? events.join(', ') : 'No events mapped'
        return (
          <Text style={{ color: events.length ? '#15B9A4' : '#999' }}>{text}</Text>
        )
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      render: (_, record) => {
        const menuItems = [
          {
            key: 'mapEvents',
            icon: <ThunderboltOutlined />,
            label: 'Map Events',
            onClick: () => {
              setSelectedTemplate(record)
              setEditingMappingId(null)
              eventForm.resetFields()
              setVariableMappings(buildVariableMappingsFromTemplate(record))
              setEventModalVisible(true)
            },
          },
        ]
        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      },
    },
    {
      title: 'Last Synced',
      dataIndex: 'lastSyncedAt',
      key: 'lastSyncedAt',
      render: (d) => (d ? new Date(d).toLocaleString() : '—'),
    },
  ]

  const eventMappingColumns = [
    {
      title: 'Event Type',
      dataIndex: 'eventType',
      key: 'eventType',
    },
    {
      title: 'Template',
      dataIndex: 'template',
      key: 'template',
    },
    {
      title: 'Variables Mapped',
      dataIndex: 'variablesMapped',
      key: 'variablesMapped',
      render: (count) => <Tag color="#15B9A4">{count} variables</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status ? '#52c41a' : '#ff4d4f'}>
          {status ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      render: (_, record) => {
        const menuItems = [
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Edit',
            onClick: () => {
              setEditingMappingId(record._id)
              const raw = mappingsRes?.data?.mappings?.find((m) => m._id === record._id)
              const templateId = raw?.templateId?._id || raw?.templateId
              const fullTemplate = templates.find((t) => t._id === templateId)
              eventForm.setFieldsValue({
                hrmsEventType: record.eventType,
                templateId,
                status: record.status,
              })
              setSelectedTemplate(fullTemplate || null)
              setVariableMappings(
                fullTemplate
                  ? buildVariableMappingsFromTemplate(fullTemplate, raw?.variables || [])
                  : (raw?.variables || []).map((v) => ({
                    templateVariable: v.templateVariable,
                    hrmsField: v.hrmsField,
                    defaultValue: v.defaultValue || '',
                    mapped: true,
                  }))
              )
              setEventModalVisible(true)
            },
          },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'Delete',
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: 'Delete Event Mapping',
                content: 'Are you sure you want to delete this event mapping?',
                onOk: async () => {
                  try {
                    await deleteEventMapping(record._id).unwrap()
                    message.success('Event mapping deleted')
                  } catch (e) {
                    message.error(e?.data?.error?.message || 'Failed to delete')
                  }
                },
              })
            },
          },
        ]
        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      },
    },
  ]

  const handleSyncTemplates = async () => {
    try {
      const res = await syncTemplates().unwrap()
      setTemplatePage(1)
      message.success(res?.data?.message || 'Templates synced successfully')
    } catch (e) {
      message.error(e?.data?.error?.message || e?.error?.message || 'Failed to sync templates')
    }
  }

  const handleSaveConfiguration = async () => {
    try {
      const values = await form.validateFields()
      const apiKey = values.apiKey?.trim()
      if (!apiKey || apiKey === '••••••••') {
        message.error('Please enter a valid API Key / Access Token')
        return
      }
      await saveConfig({
        backendUrl: values.backendUrl || DEFAULT_BACKEND_URL,
        apiKey,
      }).unwrap()
      setEditConfigMode(false)
      form.setFieldsValue({ apiKey: '••••••••' })
      message.success('Configuration saved successfully')
    } catch (e) {
      message.error(e?.data?.error?.message || e?.error?.message || 'Failed to save configuration')
    }
  }

  const handleTestConnection = async () => {
    try {
      const values = form.getFieldsValue()
      await testConnection({
        backendUrl: values.backendUrl || DEFAULT_BACKEND_URL,
        apiKey: values.apiKey && values.apiKey !== '••••••••' ? values.apiKey : undefined,
      }).unwrap()
      message.success('Connection successful')
    } catch (e) {
      message.error(e?.data?.error?.message || e?.error?.message || 'Connection failed')
    }
  }

  const handleDisconnect = () => setDisconnectModalVisible(true)

  const confirmDisconnect = async () => {
    try {
      await disconnect().unwrap()
      setEditConfigMode(false)
      form.setFieldsValue({ backendUrl: DEFAULT_BACKEND_URL, apiKey: '' })
      message.success('Integration disconnected. You can enter new credentials now.')
      setDisconnectModalVisible(false)
    } catch (e) {
      message.error(e?.data?.error?.message || 'Failed to disconnect')
    }
  }

  const handleSaveEventMapping = async () => {
    try {
      const values = await eventForm.validateFields()
      const variables = variableMappings
        .filter((v) => v.templateVariable && v.hrmsField)
        .map((v) => ({
          templateVariable: v.templateVariable,
          hrmsField: v.hrmsField,
          defaultValue: v.defaultValue || '',
        }))
      if (!variables.length) {
        message.error('Map at least one template variable to a field')
        return
      }
      await saveEventMapping({
        id: editingMappingId || undefined,
        hrmsEventType: values.hrmsEventType,
        templateId: values.templateId,
        templateName: selectedTemplate?.templateName,
        isEnabled: values.status !== false,
        variables,
      }).unwrap()
      message.success(editingMappingId ? 'Event mapping updated' : 'Event mapping created')
      setEventModalVisible(false)
      eventForm.resetFields()
      setVariableMappings([])
      setSelectedTemplate(null)
      setEditingMappingId(null)
    } catch (e) {
      message.error(e?.data?.error?.message || e?.error?.message || 'Failed to save mapping')
    }
  }

  /** Build variable rows strictly from template's variablePlaceholders ({{1}}, {{2}}, ...). */
  const buildVariableMappingsFromTemplate = (template, savedVariables = []) => {
    if (!template) return []
    const placeholders = template.variablePlaceholders
    if (!Array.isArray(placeholders) || placeholders.length === 0) return []
    const savedByVar = (savedVariables || []).reduce((acc, v) => {
      acc[v.templateVariable] = v
      return acc
    }, {})
    return placeholders.map((pv) => {
      const saved = savedByVar[pv]
      return {
        templateVariable: pv,
        hrmsField: saved?.hrmsField ?? '',
        defaultValue: saved?.defaultValue ?? '',
        mapped: !!saved?.hrmsField,
      }
    })
  }

  const handleTemplateSelect = (templateId) => {
    const template = templates.find((t) => t._id === templateId)
    setSelectedTemplate(template || null)
    setVariableMappings(template ? buildVariableMappingsFromTemplate(template) : [])
  }

  const handleAddVariableMapping = () => {
    setVariableMappings([
      ...variableMappings,
      { templateVariable: `{{${variableMappings.length + 1}}}`, hrmsField: '', defaultValue: '', mapped: false },
    ])
  }

  const handleRemoveVariableMapping = (index) => {
    setVariableMappings(variableMappings.filter((_, i) => i !== index))
  }

  const handleMapVariable = (index) => {
    const updated = [...variableMappings]
    updated[index] = { ...updated[index], mapped: true }
    setVariableMappings(updated)
  }

  const handleViewMessage = async (record) => {
    setSelectedMessage(record)
    setMessageDrawerOpen(true)
    if (!record.isRead) {
      markRead([record._id]).catch(() => {})
    }
  }

  const inboxColumns = [
    {
      title: 'Received',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (d) => (
        <Text style={{ fontSize: 12 }}>{d ? new Date(d).toLocaleString() : '—'}</Text>
      ),
    },
    {
      title: 'Sender',
      key: 'sender',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Space>
            <PhoneOutlined style={{ color: '#15B9A4' }} />
            <Text strong>+{r.from}</Text>
          </Space>
          {r.fromName && <Text type="secondary" style={{ fontSize: 12 }}>{r.fromName}</Text>}
        </Space>
      ),
    },
    {
      title: 'Retailer',
      key: 'retailer',
      render: (_, r) => {
        if (r.retailerMatched && r.retailer) {
          return (
            <Space direction="vertical" size={0}>
              <Space>
                <ShopOutlined style={{ color: '#52c41a' }} />
                <Text style={{ color: '#52c41a' }}>{r.retailer.businessName}</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {r.retailer.retailerId} · {r.retailer.status}
              </Text>
            </Space>
          )
        }
        return <Tag color="warning">Unmatched — not an active retailer</Tag>
      },
    },
    {
      title: 'Message',
      dataIndex: 'messageBody',
      key: 'messageBody',
      render: (body, r) => (
        <Space direction="vertical" size={0}>
          <Tag color="#6754A3" style={{ marginBottom: 4 }}>{r.messageType}</Tag>
          <Text ellipsis style={{ maxWidth: 260 }}>{body || '(no text)'}</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'isRead',
      width: 90,
      render: (_, r) => (
        <Tag color={r.isRead ? 'default' : '#15B9A4'}>{r.isRead ? 'Read' : 'New'}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewMessage(record)}>
          View
        </Button>
      ),
    },
  ]

  const tabItems = [
    {
      key: 'configuration',
      label: (
        <span>
          <LockOutlined />
          Configuration
        </span>
      ),
      children: (
        <div>
          <Card
            title={
              <Space>
                <MessageOutlined style={{ color: '#15B9A4' }} />
                <Title level={4} style={{ margin: 0, color: '#15B9A4' }}>
                  WhatsApp Configuration
                </Title>
              </Space>
            }
            loading={configLoading}
          >
            <Form form={form} layout="vertical" initialValues={{ backendUrl: DEFAULT_BACKEND_URL }}>
              <Form.Item
                name="backendUrl"
                label="Backend URL *"
                rules={[{ required: true, message: 'Please enter Backend URL' }]}
              >
                <Input
                  placeholder="https://backend.askeva.io"
                  disabled={fieldsDisabled}
                />
              </Form.Item>
              <Form.Item
                name="apiKey"
                label="API Key / Access Token *"
                rules={[{ required: true, message: 'Please enter API Key' }]}
              >
                <Input.Password
                  placeholder={
                    fieldsDisabled
                      ? 'Saved (click Edit configuration to change)'
                      : 'Enter API Key / Access Token (e.g. token from send-message URL)'
                  }
                  prefix={<EyeOutlined />}
                  disabled={fieldsDisabled}
                />
              </Form.Item>
              {!isConfigured || editConfigMode ? (
                <Form.Item>
                  <Space wrap>
                    <Button
                      type="primary"
                      loading={saveConfigLoading}
                      onClick={handleSaveConfiguration}
                    >
                      {editConfigMode ? 'Save changes' : 'Save Configuration'}
                    </Button>
                    {editConfigMode && (
                      <Button onClick={() => { setEditConfigMode(false); form.setFieldsValue({ apiKey: '••••••••' }); }}>
                        Cancel
                      </Button>
                    )}
                  </Space>
                </Form.Item>
              ) : (
                <>
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      loading={testLoading}
                      onClick={handleTestConnection}
                    >
                      Test Connection
                    </Button>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => setEditConfigMode(true)}
                    >
                      Edit configuration
                    </Button>
                    <Button
                      danger
                      icon={<DisconnectOutlined />}
                      loading={disconnectLoading}
                      onClick={handleDisconnect}
                    >
                      Disconnect
                    </Button>
                  </Space>
                  <Divider />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    <LockOutlined /> All sensitive data is encrypted. Disconnect removes saved config so you can enter new credentials.
                  </Text>
                </>
              )}
            </Form>
          </Card>
        </div>
      ),
    },
    {
      key: 'templates',
      label: (
        <span>
          <MessageOutlined />
          Templates
        </span>
      ),
      children: (
        <div>
          <Card
            title={
              <Space>
                <MessageOutlined style={{ color: '#15B9A4' }} />
                <Title level={4} style={{ margin: 0, color: '#15B9A4' }}>
                  WhatsApp Templates
                </Title>
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<SyncOutlined />}
                loading={syncLoading}
                disabled={!isConfigured}
                onClick={handleSyncTemplates}
              >
                Sync Templates
              </Button>
            }
            loading={templatesLoading}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Manage and sync message templates from your Askeva/WhatsApp account.
            </Text>
            {lastSyncedAt && (
              <div style={{ marginBottom: 16, padding: '12px', background: '#f6ffed', borderRadius: '4px' }}>
                <Text style={{ color: '#15B9A4' }}>Last synced: {lastSyncedAt}</Text>
                <br />
                <Text style={{ color: '#52c41a' }}>
                  {templatesTotal} template(s) synced
                </Text>
              </div>
            )}
            <Table
              columns={templateColumns}
              dataSource={templates.map((t) => ({ ...t, key: t._id }))}
              pagination={{
                current: templatePage,
                pageSize: templatePageSize,
                total: templatesTotal,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `Total ${total} templates`,
                onChange: (page, pageSize) => {
                  setTemplatePage(page)
                  setTemplatePageSize(pageSize || 10)
                },
              }}
              locale={{ emptyText: isConfigured ? 'No templates yet. Click Sync Templates.' : 'Configure WhatsApp first.' }}
            />
          </Card>
        </div>
      ),
    },
    {
      key: 'webhookInbox',
      label: (
        <span>
          <InboxOutlined />
          Webhook Inbox
          {inboxUnread > 0 && (
            <Tag color="#15B9A4" style={{ marginLeft: 6, fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
              {inboxUnread}
            </Tag>
          )}
        </span>
      ),
      children: (
        <div>
          <Card
            title={
              <Space>
                <InboxOutlined style={{ color: '#15B9A4' }} />
                <Title level={4} style={{ margin: 0, color: '#15B9A4' }}>
                  Incoming Webhook Messages
                </Title>
              </Space>
            }
            extra={
              <Space>
                <Select
                  value={inboxFilter}
                  onChange={(v) => { setInboxFilter(v); setInboxPage(1) }}
                  style={{ width: 160 }}
                  options={[
                    { value: 'all', label: 'All Messages' },
                    { value: 'matched', label: 'Active Retailers' },
                    { value: 'unmatched', label: 'Unmatched' },
                    { value: 'unread', label: 'Unread' },
                  ]}
                />
                <Button icon={<ReloadOutlined />} onClick={refetchInbox}>Refresh</Button>
                {inboxUnread > 0 && (
                  <Button onClick={() => markRead([])}>Mark all read</Button>
                )}
              </Space>
            }
            loading={inboxLoading}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Messages received via the WhatsApp webhook. Only <strong>active</strong> retailers are auto-matched by their WhatsApp number.
            </Text>
            {inboxUnread > 0 && (
              <div style={{ marginBottom: 16, padding: '10px 16px', background: '#e6f7ff', borderRadius: 4 }}>
                <Text style={{ color: '#1890ff' }}>
                  <InboxOutlined /> {inboxUnread} unread message{inboxUnread !== 1 ? 's' : ''}
                </Text>
              </div>
            )}
            <Table
              columns={inboxColumns}
              dataSource={inboxMessages.map((m) => ({ ...m, key: m._id }))}
              pagination={{
                current: inboxPage,
                pageSize: inboxPageSize,
                total: inboxTotal,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (t) => `Total ${t} messages`,
                onChange: (p, ps) => { setInboxPage(p); setInboxPageSize(ps || 20) },
              }}
              rowClassName={(r) => r.isRead ? '' : 'webhook-inbox-unread'}
              locale={{ emptyText: 'No incoming messages yet. Messages will appear here once your webhook URL receives data.' }}
            />
          </Card>
        </div>
      ),
    },
    {
      key: 'eventMapping',
      label: (
        <span>
          <LinkOutlined />
          Event Mapping
        </span>
      ),
      children: (
        <div>
          <Card
            title={
              <Space>
                <LinkOutlined style={{ color: '#15B9A4' }} />
                <Title level={4} style={{ margin: 0, color: '#15B9A4' }}>
                  Event Template Configuration
                </Title>
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!isConfigured || !templates.length}
                onClick={() => {
                  setEditingMappingId(null)
                  setSelectedTemplate(null)
                  setVariableMappings([])
                  eventForm.resetFields()
                  setEventModalVisible(true)
                }}
              >
                Create New Mapping
              </Button>
            }
            loading={mappingsLoading}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Configure templates and variable mappings for each event.
            </Text>
            <Table
              columns={eventMappingColumns}
              dataSource={eventMappings}
              pagination={{
                total: eventMappings.length,
                pageSize: 10,
                showTotal: (total) => `Total ${total} mappings`,
              }}
              locale={{ emptyText: 'No event mappings yet. Create one to link events to templates.' }}
            />
          </Card>
        </div>
      ),
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      {connectionError && (
        <Alert
          style={{ marginBottom: 24 }}
          type="error"
          showIcon
          message="Connection verification failed"
          description={connectionError}
        />
      )}
      {isConfigured && !connectionError && (
        <Alert
          style={{ marginBottom: 24 }}
          type={isConnected ? 'success' : 'warning'}
          showIcon
          message={
            isConnected
              ? 'Integration connected'
              : 'Integration disconnected'
          }
          description={
            isConnected
              ? 'WhatsApp is connected and ready. Use the Templates tab to sync templates.'
              : 'Configuration is saved but connection has not been verified. Click Test Connection or Edit configuration to update the API key.'
          }
        />
      )}
      {!isConfigured && (
        <Alert
          style={{ marginBottom: 24 }}
          type="info"
          showIcon
          message="Integration disconnected"
          description="Enter your Backend URL and API Key below, then click Save Configuration. Use the token from your Askeva send-message URL as the API Key."
        />
      )}
      <Card style={{ marginBottom: 24 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/admin/dashboard')}
            >
              Back
            </Button>
          </Space>
        </Space>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space>
            <MessageOutlined style={{ fontSize: '24px', color: '#15B9A4' }} />
            <Title level={2} style={{ margin: 0, color: '#15B9A4' }}>
              WhatsApp Integration
            </Title>
          </Space>
          <Space>
            {isConfigured && (
              <Tag
                icon={<CheckCircleOutlined />}
                color={isConnected ? 'success' : 'default'}
              >
                {isConnected ? 'Connected' : 'Not verified'}
              </Tag>
            )}
            <Tag icon={<InfoCircleOutlined />} color={isConfigured ? 'success' : 'default'}>
              {isConfigured ? 'Configured' : 'Not configured'}
            </Tag>
          </Space>
        </Space>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          Configure WhatsApp messaging and webhook handling.
        </Text>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      {/* Event Mapping Modal */}
      <Modal
        title={editingMappingId ? 'Edit Event Template Mapping' : 'Create Event Template Mapping'}
        open={eventModalVisible}
        onOk={handleSaveEventMapping}
        onCancel={() => {
          setEventModalVisible(false)
          eventForm.resetFields()
          setVariableMappings([])
          setSelectedTemplate(null)
          setEditingMappingId(null)
        }}
        width={800}
        okText="Save"
        confirmLoading={saveMappingLoading}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={eventForm} layout="vertical">
          <Form.Item
            name="hrmsEventType"
            label="Event Type"
            rules={[{ required: true, message: 'Please select event type' }]}
          >
            <Select placeholder="Select event type">
              {HRMS_EVENT_OPTIONS.map((o) => (
                <Option key={o.value} value={o.value}>{o.label}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="templateId"
            label="Template"
            rules={[{ required: true, message: 'Please select template' }]}
          >
            <Select
              placeholder="Select template"
              onChange={handleTemplateSelect}
              showSearch
              optionFilterProp="label"
              options={templates.map((t) => ({
                value: t._id,
                label: `${t.templateName} (${t.language || ''})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Status" valuePropName="checked">
            <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
          </Form.Item>
          <Divider />
          <Title level={5}>Variable Mapping</Title>
          {selectedTemplate?.variablePlaceholders?.length > 0 && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Variable fields below are based on the selected template (synced from WhatsApp).
            </Text>
          )}
          {selectedTemplate ? (
            <div>
              {variableMappings.length > 0 ? (
                <>
                  <div style={{ padding: '12px', background: '#f6ffed', borderRadius: '4px', marginBottom: 16 }}>
                    <Space>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      <Text>This template has {variableMappings.length} variable(s). Map each to a field below.</Text>
                    </Space>
                    <div style={{ marginTop: 8 }}>
                      {variableMappings.map((vm, idx) => (
                        <Tag key={idx} color={vm.hrmsField ? '#52c41a' : 'default'} style={{ marginRight: 8 }}>
                          {vm.templateVariable} {vm.hrmsField ? '✓' : ''}
                        </Tag>
                      ))}
                    </div>
                  </div>
                  {variableMappings.map((vm, index) => (
                    <Card key={index} size="small" style={{ marginBottom: 16 }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Form.Item label="Template Variable">
                          <Input value={vm.templateVariable} readOnly />
                        </Form.Item>
                        <Form.Item label="Template Field" required>
                          <Select
                            placeholder="Select field"
                            value={vm.hrmsField || undefined}
                            onChange={(val) => {
                              const next = [...variableMappings]
                              next[index] = { ...next[index], hrmsField: val, mapped: !!val }
                              setVariableMappings(next)
                            }}
                            options={TEMPLATE_FIELD_OPTIONS}
                          />
                        </Form.Item>
                        <Form.Item label="Default Value (optional)">
                          <Input
                            placeholder="Use if field value is missing"
                            value={vm.defaultValue}
                            onChange={(e) => {
                              const next = [...variableMappings]
                              next[index] = { ...next[index], defaultValue: e.target.value }
                              setVariableMappings(next)
                            }}
                          />
                        </Form.Item>
                        {!selectedTemplate?.variablePlaceholders?.length && (
                          <Button danger size="small" onClick={() => handleRemoveVariableMapping(index)}>
                            Remove
                          </Button>
                        )}
                      </Space>
                    </Card>
                  ))}
                </>
              ) : (
                <div style={{ padding: '24px', background: '#e6f7ff', borderRadius: '4px', textAlign: 'center', marginBottom: 16 }}>
                  <Text type="secondary">This template has no variables.</Text>
                </div>
              )}
              {(!selectedTemplate?.variablePlaceholders?.length || variableMappings.length === 0) && (
                <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddVariableMapping} style={{ width: '100%' }}>
                  Add Variable Mapping
                </Button>
              )}
            </div>
          ) : (
            <div style={{ padding: '24px', background: '#e6f7ff', borderRadius: '4px', textAlign: 'center' }}>
              <Text type="secondary">Select a template to see and map variables.</Text>
            </div>
          )}
        </Form>
      </Modal>

      {/* Disconnect Modal */}
      <Modal
        title="Disconnect Integration"
        open={disconnectModalVisible}
        onOk={confirmDisconnect}
        onCancel={() => setDisconnectModalVisible(false)}
        okButtonProps={{ danger: true }}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Text>Are you sure you want to disconnect this integration? All configuration will be lost.</Text>
      </Modal>

      {/* Webhook Message Detail Modal */}
      <Modal
        title={
          <Space>
            <MessageOutlined style={{ color: '#15B9A4' }} />
            <span>Message Detail</span>
          </Space>
        }
        open={messageDrawerOpen}
        onCancel={() => { setMessageDrawerOpen(false); setSelectedMessage(null) }}
        footer={null}
        width={640}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      >
        {selectedMessage && (
          <div>
            {/* Retailer Info */}
            <Card
              size="small"
              style={{ marginBottom: 16, background: selectedMessage.retailerMatched ? '#f6ffed' : '#fffbe6' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <ShopOutlined style={{ color: selectedMessage.retailerMatched ? '#52c41a' : '#faad14' }} />
                  <Text strong>Retailer</Text>
                  {selectedMessage.retailerMatched
                    ? <Tag color="success">Active Retailer</Tag>
                    : <Tag color="warning">Unmatched — not an active retailer</Tag>
                  }
                </Space>
                {selectedMessage.retailerMatched && selectedMessage.retailer ? (
                  <div style={{ paddingLeft: 22 }}>
                    <div><Text type="secondary">Business: </Text><Text strong>{selectedMessage.retailer.businessName}</Text></div>
                    {selectedMessage.retailer.storeName && (
                      <div><Text type="secondary">Store: </Text><Text>{selectedMessage.retailer.storeName}</Text></div>
                    )}
                    <div><Text type="secondary">Contact: </Text><Text>{selectedMessage.retailer.contactPerson}</Text></div>
                    <div><Text type="secondary">Retailer ID: </Text><Text>{selectedMessage.retailer.retailerId}</Text></div>
                    <div>
                      <Text type="secondary">Status: </Text>
                      <Tag color="success">{selectedMessage.retailer.status}</Tag>
                    </div>
                    {selectedMessage.retailer.city && (
                      <div><Text type="secondary">Location: </Text><Text>{selectedMessage.retailer.city}, {selectedMessage.retailer.state}</Text></div>
                    )}
                  </div>
                ) : (
                  <Text type="secondary" style={{ paddingLeft: 22 }}>
                    No active retailer found with WhatsApp number +{selectedMessage.from}
                  </Text>
                )}
              </Space>
            </Card>

            {/* Message Info */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">From: </Text>
                  <Text strong>+{selectedMessage.from}</Text>
                  {selectedMessage.fromName && <Text type="secondary"> ({selectedMessage.fromName})</Text>}
                </div>
                <div>
                  <Text type="secondary">Type: </Text>
                  <Tag color="#6754A3">{selectedMessage.messageType}</Tag>
                </div>
                <div>
                  <Text type="secondary">Received: </Text>
                  <Text>{selectedMessage.createdAt ? new Date(selectedMessage.createdAt).toLocaleString() : '—'}</Text>
                </div>
                {selectedMessage.timestamp && (
                  <div>
                    <Text type="secondary">WhatsApp timestamp: </Text>
                    <Text>{new Date(selectedMessage.timestamp).toLocaleString()}</Text>
                  </div>
                )}
              </Space>
            </Card>

            {/* Message Body */}
            {selectedMessage.messageBody && (
              <Card size="small" title="Message" style={{ marginBottom: 16 }}>
                <Text>{selectedMessage.messageBody}</Text>
              </Card>
            )}

            {/* Raw Payload */}
            <Card
              size="small"
              title="Raw Webhook Payload"
              extra={<Text type="secondary" style={{ fontSize: 11 }}>For debugging</Text>}
            >
              <pre style={{ fontSize: 11, maxHeight: 220, overflow: 'auto', margin: 0, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                {JSON.stringify(selectedMessage.rawPayload, null, 2)}
              </pre>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default WhatsAppIntegration
