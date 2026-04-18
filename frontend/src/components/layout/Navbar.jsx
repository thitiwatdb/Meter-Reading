import { useState } from 'react';
import {
  Layout,
  Button,
  Typography,
  Space,
  Form,
  Input,
  Divider,
  Drawer,
} from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
  LoginOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';

const { Header } = Layout;
const { Text, Title } = Typography;

const Navbar = ({
  isLoggedIn,
  userDisplayName,
  onLogin,
  onLogout,
  loading,
  isMobile,
  collapsed,
  onToggleCollapse,
  onToggleDrawer,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [mobileLoginOpen, setMobileLoginOpen] = useState(false);

  const handleLogin = async (values) => {
    try {
      setSubmitting(true);
      const success = await onLogin(values);
      if (success) {
        form.resetFields();
        if (isMobile) {
          setMobileLoginOpen(false);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderLoginForm = (variant = 'desktop') => {
    const isDrawer = variant === 'drawer';
    return (
      <Form
        form={form}
        layout={isDrawer ? 'vertical' : 'inline'}
        onFinish={handleLogin}
        autoComplete="off"
        style={{
          display: 'flex',
          flexDirection: isDrawer ? 'column' : 'row',
          alignItems: isDrawer ? 'stretch' : 'center',
          justifyContent: isDrawer ? 'flex-start' : 'flex-end',
          flexWrap: isDrawer ? 'nowrap' : 'wrap',
          gap: isDrawer ? 16 : 16,
          width: isDrawer ? '100%' : 'auto',
          alignSelf: isDrawer ? 'stretch' : 'center',
        }}
      >
        <Form.Item
          name="username"
          rules={[{ required: true, message: 'Please enter username' }]}
          style={{
            marginBottom: 0,
            flex: isDrawer ? '1 1 100%' : undefined,
          }}
        >
          <Input
            placeholder="Username"
            allowClear
            size="large"
            style={{ width: isDrawer ? '100%' : 200 }}
          />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[{ required: true, message: 'Please enter password' }]}
          style={{
            marginBottom: 0,
            flex: isDrawer ? '1 1 100%' : undefined,
          }}
        >
          <Input.Password
            placeholder="Password"
            size="large"
            style={{ width: isDrawer ? '100%' : 200 }}
          />
        </Form.Item>
        <Form.Item
          style={{
            marginBottom: 0,
            width: isDrawer ? '100%' : 'auto',
          }}
        >
          <Button
            type="primary"
            htmlType="submit"
            icon={<LoginOutlined />}
            size="large"
            loading={loading || submitting}
            block={isDrawer}
          >
            Login
          </Button>
        </Form.Item>
      </Form>
    );
  };

  return (
    <Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        padding: isMobile ? '0 12px' : '0 24px',
        background: '#001529',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 12 : 16,
        }}
      >
        <Space size={isMobile ? 12 : 16} align="center">
          <Button
            type="text"
            aria-label="Toggle navigation"
            icon={
              isMobile
                ? <MenuOutlined style={{ fontSize: 18 }} />
                : collapsed
                  ? <MenuUnfoldOutlined style={{ fontSize: 18, color: '#fff' }} />
                  : <MenuFoldOutlined style={{ fontSize: 18, color: '#fff' }} />
            }
            onClick={isMobile ? onToggleDrawer : onToggleCollapse}
            style={{
              color: '#fff',
              width: isMobile ? 36 : 40,
              height: isMobile ? 36 : 40,
            }}
          />
          <Title
            level={isMobile ? 4 : 3}
            style={{ color: '#fff', margin: 0, lineHeight: 1 }}
          >
            DormSys
          </Title>
        </Space>
        {isLoggedIn ? (
          <Space
            size={isMobile ? 12 : 16}
            align="center"
            style={{
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              width: 'auto',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14 }}>
              Hello,&nbsp;
              <Text strong style={{ color: '#fff' }}>
                {userDisplayName}
              </Text>
            </Text>
            <Divider type="vertical" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <Button
              type="primary"
              danger
              icon={<LogoutOutlined />}
              onClick={onLogout}
            >
              Logout
            </Button>
          </Space>
        ) : (
          <>
            {isMobile ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: 'auto', gap: 12 }}>
                <Button
                  type="primary"
                  shape="circle"
                  icon={<UserOutlined />}
                  size="large"
                  aria-label="Open login form"
                  onClick={() => setMobileLoginOpen(true)}
                />
                <Drawer
                  placement="right"
                  width="82%"
                  title="Sign in"
                  open={mobileLoginOpen}
                  onClose={() => setMobileLoginOpen(false)}
                  destroyOnClose={false}
                  styles={{
                    body: {
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    },
                  }}
                >
                  {renderLoginForm('drawer')}
                </Drawer>
              </div>
            ) : (
              renderLoginForm('desktop')
            )}
          </>
        )}
      </div>
    </Header>
  );
};

export default Navbar;
