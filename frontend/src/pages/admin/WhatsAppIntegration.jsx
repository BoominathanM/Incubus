import React, { useState } from 'react'
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
  GlobalOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

const WhatsAppIntegration = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('configuration')
  const [form] = Form.useForm()
  const [eventForm] = Form.useForm()
  const [eventModalVisible, setEventModalVisible] = useState(false)
  const [disconnectModalVisible, setDisconnectModalVisible] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [variableMappings, setVariableMappings] = useState([])
  const [isEditMode, setIsEditMode] = useState(false)

  // Mock templates data
  const templates = [
    {
      key: '1',
      templateName: 'notify_me',
      components: 'BODY',
      language: 'EN',
      category: 'MARKETING',
      active: true,
      status: 'APPROVED',
      mappedEvents: 'Billing Invoice Generate',
      lastSynced: '2/5/2026, 11:15',
    },
    {
      key: '2',
      templateName: 'india_test',
      components: 'BODY',
      language: 'EN',
      category: 'MARKETING',
      active: true,
      status: 'APPROVED',
      mappedEvents: 'No events mapped',
      lastSynced: '2/5/2026, 11:15',
    },
    {
      key: '3',
      templateName: 'cta_static_testing',
      components: 'HEADER BODY FOOTER BUTTONS',
      language: 'SQ',
      category: 'MARKETING',
      active: true,
      status: 'APPROVED',
      mappedEvents: 'No events mapped',
      lastSynced: '2/5/2026, 11:15',
    },
    {
      key: '4',
      templateName: 'cta_dynamic_testing',
      components: 'HEADER BODY FOOTER BUTTONS',
      language: 'EN',
      category: 'MARKETING',
      active: true,
      status: 'APPROVED',
      mappedEvents: 'No events mapped',
      lastSynced: '2/5/2026, 11:15',
    },
    {
      key: '5',
      templateName: 'cta_dynamic_staic',
      components: 'HEADER BODY FOOTER BUTTONS',
      language: 'EN',
      category: 'MARKETING',
      active: true,
      status: 'APPROVED',
      mappedEvents: 'No events mapped',
      lastSynced: '2/5/2026, 11:15',
    },
    {
      key: '6',
      templateName: 'dynamic_website',
      components: 'BODY BUTTONS',
      language: 'EN',
      category: 'MARKETING',
      active: true,
      status: 'APPROVED',
      mappedEvents: 'No events mapped',
      lastSynced: '2/5/2026, 11:15',
    },
  ]

  // Mock event mappings
  const eventMappings = [
    {
      key: '1',
      eventType: 'Billing Invoice Generate',
      template: 'notify_me en',
      variablesMapped: 2,
      status: true, // true = Enabled, false = Disabled
    },
  ]

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
      render: (text) => <Text style={{ color: '#15B9A4' }}>{text}</Text>,
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
      render: (category) => <Tag color="#6754A3">{category}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color="#52c41a">{status}</Tag>,
    },
    {
      title: 'Mapped Events',
      dataIndex: 'mappedEvents',
      key: 'mappedEvents',
      render: (text) => (
        <Text style={{ color: text === 'No events mapped' ? '#999' : '#15B9A4' }}>
          {text}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setSelectedTemplate(record)
              setIsEditMode(false)
              eventForm.resetFields()
              setEventModalVisible(true)
            }}
          >
            Map Events
          </Button>
          <div>
            <Text style={{ marginRight: 8 }}>Active:</Text>
            <Switch
              checked={record.active}
              onChange={(checked) => {
                message.success(`Template ${checked ? 'activated' : 'deactivated'}`)
              }}
            />
          </div>
        </Space>
      ),
    },
    {
      title: 'Last Synced',
      dataIndex: 'lastSynced',
      key: 'lastSynced',
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
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => {
              setIsEditMode(true)
              eventForm.setFieldsValue({
                eventType: record.eventType,
                template: 'notify_me',
                status: true,
              })
              setSelectedTemplate({ templateName: 'notify_me', language: 'en' })
              setVariableMappings([
                { variable: '{{1}}', hrmsField: 'Candidate Name (Candidate)', defaultValue: '', mapped: true },
                { variable: '{{2}}', hrmsField: 'Job Title (Job)', defaultValue: '', mapped: true },
              ])
              setEventModalVisible(true)
            }}
          >
            Edit
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: 'Delete Event Mapping',
                content: 'Are you sure you want to delete this event mapping?',
                onOk: () => message.success('Event mapping deleted'),
              })
            }}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ]

  const handleSyncTemplates = () => {
    message.success('Templates synced successfully')
  }

  const handleSaveConfiguration = () => {
    form.validateFields().then(() => {
      setIsConfigured(true)
      message.success('Configuration saved successfully')
    })
  }

  const handleDisconnect = () => {
    setDisconnectModalVisible(true)
  }

  const confirmDisconnect = () => {
    setIsConfigured(false)
    form.resetFields()
    message.success('Integration disconnected')
    setDisconnectModalVisible(false)
  }

  const handleSaveEventMapping = () => {
    eventForm.validateFields().then(() => {
      message.success(`Event mapping ${isEditMode ? 'updated' : 'created'} successfully`)
      setEventModalVisible(false)
      eventForm.resetFields()
      setVariableMappings([])
      setSelectedTemplate(null)
      setIsEditMode(false)
    })
  }

  const handleTemplateSelect = (templateName) => {
    const template = templates.find(t => t.templateName === templateName)
    setSelectedTemplate(template)
    // Mock variables based on template
    if (templateName === 'notify_me') {
      setVariableMappings([
        { variable: '{{1}}', hrmsField: 'Candidate Name (Candidate)', defaultValue: '', mapped: isEditMode },
        { variable: '{{2}}', hrmsField: 'Job Title (Job)', defaultValue: '', mapped: isEditMode },
      ])
    } else if (templateName === 'india_test') {
      setVariableMappings([
        { variable: '{{1}}', hrmsField: '', defaultValue: '', mapped: false },
      ])
    } else {
      setVariableMappings([])
    }
  }

  const handleAddVariableMapping = () => {
    setVariableMappings([...variableMappings, { variable: '', hrmsField: '', defaultValue: '', mapped: false }])
  }

  const handleRemoveVariableMapping = (index) => {
    setVariableMappings(variableMappings.filter((_, i) => i !== index))
  }

  const handleMapVariable = (index) => {
    const updated = [...variableMappings]
    updated[index].mapped = true
    setVariableMappings(updated)
  }

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
          >
            <Form form={form} layout="vertical">
              <Form.Item
                name="apiKey"
                label="API Key / Access Token *"
                rules={[{ required: true, message: 'Please enter API Key' }]}
              >
                <Input.Password
                  placeholder="Enter API Key / Access Token"
                  prefix={<EyeOutlined />}
                  disabled={isConfigured}
                />
              </Form.Item>
              {!isConfigured ? (
                <Form.Item>
                  <Button
                    type="primary"
                    onClick={handleSaveConfiguration}
                    style={{ width: '100%' }}
                  >
                    Save Configuration
                  </Button>
                </Form.Item>
              ) : (
                <>
                  <Divider />
                  <Space>
                    <Button
                      danger
                      icon={<DisconnectOutlined />}
                      onClick={handleDisconnect}
                    >
                      Disconnect
                    </Button>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      <LockOutlined /> All sensitive data is encrypted
                    </Text>
                  </Space>
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
                onClick={handleSyncTemplates}
              >
                Sync Templates
              </Button>
            }
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Manage and sync message templates.
            </Text>
            <div style={{ marginBottom: 16, padding: '12px', background: '#f6ffed', borderRadius: '4px' }}>
              <Text style={{ color: '#15B9A4' }}>
                Last synced: 2/5/2026, 11:15:02 AM
              </Text>
              <br />
              <Text style={{ color: '#52c41a' }}>Successfully synced templates</Text>
            </div>
            <Table
              columns={templateColumns}
              dataSource={templates}
              pagination={false}
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
                onClick={() => {
                  eventForm.resetFields()
                  setEventModalVisible(true)
                }}
              >
                Create New Mapping
              </Button>
            }
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
            />
          </Card>
        </div>
      ),
    },
  ]

  return (
    <div>
      <Breadcrumbs />
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
            <Tag icon={<CheckCircleOutlined />} color="success">
              Connected
            </Tag>
            <Tag icon={<InfoCircleOutlined />} color="success">
              Configured
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
        title={isEditMode ? 'Edit Event Template Mapping' : 'Create Event Template Mapping'}
        open={eventModalVisible}
        onOk={handleSaveEventMapping}
        onCancel={() => {
          setEventModalVisible(false)
          eventForm.resetFields()
          setVariableMappings([])
          setSelectedTemplate(null)
          setIsEditMode(false)
        }}
        width={800}
        okText="Save"
      >
        <Form form={eventForm} layout="vertical">
          <Form.Item
            name="eventType"
            label=" Event Type"
            rules={[{ required: true, message: 'Please select event type' }]}
          >
            <Select placeholder="Select event type">
              <Option value="Candidate Applied">Billing Invoice</Option>
              <Option value="Interview Scheduled">Dispatch Order</Option>
              <Option value="Onboarding Started">Delivery Completed</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="template"
            label=" Template"
            rules={[{ required: true, message: 'Please select template' }]}
          >
            <Select 
              placeholder="Select template"
              onChange={handleTemplateSelect}
            >
              {templates.map((t) => (
                <Option key={t.key} value={t.templateName}>
                  {t.templateName} ({t.language})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="status"
            label="Status"
          >
            <Switch
              checkedChildren="Enabled"
              unCheckedChildren="Disabled"
              defaultChecked={true}
            />
          </Form.Item>
          <Divider />
          <Title level={5}>Variable Mapping</Title>
          {selectedTemplate ? (
            <div>
              {variableMappings.length > 0 ? (
                <>
                  <div style={{ 
                    padding: '12px', 
                    background: '#f6ffed', 
                    borderRadius: '4px', 
                    marginBottom: 16 
                  }}>
                    <Space>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      <Text>
                        Template has {variableMappings.length} variables - All must be mapped.
                      </Text>
                    </Space>
                    <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                      Required: All template variables must be mapped to template fields or have template values.
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {variableMappings.map((vm, idx) => (
                        <Tag key={idx} color="#52c41a" style={{ marginRight: 8 }}>
                          {vm.variable} ✓
                        </Tag>
                      ))}
                    </div>
                  </div>
                  {variableMappings.map((vm, index) => (
                    <Card key={index} size="small" style={{ marginBottom: 16 }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Form.Item label="Template Variable">
                          <Input value={vm.variable} readOnly />
                        </Form.Item>
                        <Form.Item
                          label=" Template Field "
                          rules={[{ required: true }]}
                        >
                          <Select placeholder="Select template field">
                            <Option value="Candidate Name (Candidate)">Candidate Name (Candidate)</Option>
                            <Option value="Job Title (Job)">Job Title (Job)</Option>
                            <Option value="Department (Department)">Department (Department)</Option>
                            <Option value="Salary (Compensation)">Salary (Compensation)</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item label="Template Value">
                          <Input 
                            placeholder="Optional"
                            value={vm.defaultValue}
                          />
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            Use if template field value is missing.
                          </Text>
                        </Form.Item>
                        <Space>
                          {vm.mapped ? (
                            <Button type="primary" icon={<CheckCircleOutlined />}>
                              ✔ Mapped
                            </Button>
                          ) : (
                            <Button 
                              type="primary" 
                              onClick={() => handleMapVariable(index)}
                            >
                              Map Variable
                            </Button>
                          )}
                          <Button 
                            danger 
                            onClick={() => handleRemoveVariableMapping(index)}
                          >
                            Remove
                          </Button>
                        </Space>
                      </Space>
                    </Card>
                  ))}
                </>
              ) : (
                <div style={{ 
                  padding: '24px', 
                  background: '#e6f7ff', 
                  borderRadius: '4px',
                  textAlign: 'center',
                  marginBottom: 16
                }}>
                  <Text type="secondary">
                    Select a template
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Please select a template first to see its variables
                  </Text>
                </div>
              )}
              <Button 
                type="dashed" 
                icon={<PlusOutlined />}
                onClick={handleAddVariableMapping}
                style={{ width: '100%' }}
              >
                Add Additional Variable Mapping
              </Button>
            </div>
          ) : (
            <div style={{ 
              padding: '24px', 
              background: '#e6f7ff', 
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <Text type="secondary">
                Select a template
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Please select a template first to see its variables
              </Text>
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
      >
        <Text>Are you sure you want to disconnect this integration? All configuration will be lost.</Text>
      </Modal>
    </div>
  )
}

export default WhatsAppIntegration
