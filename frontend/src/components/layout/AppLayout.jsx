import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Layout,
  Grid,
  Drawer,
  Alert,
  Typography,
  Empty,
  Badge,
} from 'antd';
import {
  HomeOutlined,
  UserAddOutlined,
  BellOutlined,
  UserOutlined,
  CalendarOutlined,
  BookOutlined,
  DollarOutlined,
  ToolOutlined,
  SearchOutlined,
  DashboardOutlined,
  TeamOutlined,
  ApartmentOutlined,
  SolutionOutlined,
  IdcardOutlined,
  ThunderboltOutlined,
  WalletOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import api from '../../axios';

const { Content } = Layout;
const { Text } = Typography;

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [activeTenancy, setActiveTenancy] = useState(0);
  const [authLoading, setAuthLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const feedbackTimer = useRef(null);
  const [pendingBookingCount, setPendingBookingCount] = useState(0);
  const [readyCheckInCount, setReadyCheckInCount] = useState(0);
  const [maintenanceOpenCount, setMaintenanceOpenCount] = useState(0);
  const [billingPendingCount, setBillingPendingCount] = useState(0);
  const [tenantBookingAlertCount, setTenantBookingAlertCount] = useState(0);
  const [tenantBillingAlertCount, setTenantBillingAlertCount] = useState(0);
  const [tenantMaintenanceAlertCount, setTenantMaintenanceAlertCount] = useState(0);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((prev) => !prev), []);
  const toggleCollapse = useCallback(
    () => setCollapsed((prev) => !prev),
    []
  );

  useEffect(() => {
    if (!isMobile) {
      closeDrawer();
    }
  }, [isMobile, closeDrawer]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) {
        clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

  const fetchActiveTenancy = useCallback(async () => {
    try {
      const res = await api.get('/tenancies/mine/active-count');
      setActiveTenancy(Number(res.data?.count || 0));
    } catch {
      setActiveTenancy(0);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    const storedRole = localStorage.getItem('role');

    if (token && storedUsername && storedRole) {
      setIsLoggedIn(true);
      setUserDisplayName(storedUsername);
      setRole(storedRole);
      if (storedRole === 'TENANT') {
        fetchActiveTenancy();
      }
    }
  }, [fetchActiveTenancy]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleMaintenanceBadge = (event) => {
      const detail = event.detail || {};
      const open = Number(detail.open || 0);
      const scope = detail.scope || 'tenant';
      if (scope === 'staff') {
        setMaintenanceOpenCount(open);
      } else {
        setTenantMaintenanceAlertCount(open);
      }
    };
    const handleStaffBilling = (event) => {
      const count = Number(event.detail?.count || 0);
      if ((event.detail?.scope || 'staff') === 'staff') {
        setBillingPendingCount(count);
      }
    };
    const handleTenantBilling = (event) => {
      const count = Number(event.detail?.count || 0);
      setTenantBillingAlertCount(count);
    };
    const handleTenantBookings = (event) => {
      const count = Number(event.detail?.count || 0);
      setTenantBookingAlertCount(count);
    };
    window.addEventListener('maintenance:changed', handleMaintenanceBadge);
    window.addEventListener('billing:pending', handleStaffBilling);
    window.addEventListener('tenant-billing:pending', handleTenantBilling);
    window.addEventListener('tenant-bookings:pending', handleTenantBookings);
    return () => {
      window.removeEventListener('maintenance:changed', handleMaintenanceBadge);
      window.removeEventListener('billing:pending', handleStaffBilling);
      window.removeEventListener('tenant-billing:pending', handleTenantBilling);
      window.removeEventListener('tenant-bookings:pending', handleTenantBookings);
    };
  }, []);

  const handleLogin = useCallback(
    async ({ username, password }) => {
      setAuthLoading(true);
      setFeedback({ type: '', text: '' });
      if (feedbackTimer.current) {
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current = null;
      }
      try {
        const res = await api.post('/auth/login', { username, password });
        const { token, user } = res.data;

        localStorage.setItem('token', token);
        localStorage.setItem('username', user.username);
        if (user.id) {
          localStorage.setItem('userId', user.id);
        }
        localStorage.setItem('role', user.role);

        setIsLoggedIn(true);
        setUserDisplayName(user.username);
        setRole(user.role);

        if (user.role === 'TENANT') {
          await fetchActiveTenancy();
        } else {
          setActiveTenancy(0);
        }

        setFeedback({ type: 'success', text: `Welcome ${user.username}` });
        feedbackTimer.current = setTimeout(() => {
          setFeedback({ type: '', text: '' });
          feedbackTimer.current = null;
        }, 1500);
        navigate('/');
        return true;
      } catch (error) {
        const errorText =
          error.response?.data?.message ||
          'Unable to login. Please check your credentials.';
        setFeedback({ type: 'error', text: errorText });
        return false;
      } finally {
        setAuthLoading(false);
      }
    },
    [fetchActiveTenancy, navigate]
  );

  const fetchStaffBadges = useCallback(async () => {
    if (!isLoggedIn) return;
    const normalized = String(role || '').toUpperCase();
    if (!['ADMIN', 'MANAGER'].includes(normalized)) return;
    try {
      const res = await api.get('/maintenance');
      const open = (res.data || []).filter(
        (item) => !['COMPLETED', 'CANCELLED'].includes(String(item.status || '').toUpperCase())
      ).length;
      setMaintenanceOpenCount(open);
    } catch {
      setMaintenanceOpenCount(0);
    }
    try {
      const res = await api.get('/billing', { params: { status: 'PENDING' } });
      setBillingPendingCount((res.data || []).length);
    } catch {
      setBillingPendingCount(0);
    }
  }, [isLoggedIn, role]);

const fetchTenantBadges = useCallback(async () => {
  if (!isLoggedIn) return;
  if (String(role || '').toUpperCase() !== 'TENANT') return;
    try {
      const res = await api.get('/bookings/mine');
      const list = res.data || [];
      const outstandingPrepay = list.filter((booking) => {
        const status = String(booking.status || '').toUpperCase();
        return ['PENDING', 'APPROVED'].includes(status) && Number(booking.prepayment_outstanding_amount || 0) > 0.009;
      }).length;
      setTenantBookingAlertCount(outstandingPrepay);
    } catch {
      setTenantBookingAlertCount(0);
    }
    try {
      const res = await api.get('/billing/mine/overview');
      const openBills = res.data?.open_bills || [];
      setTenantBillingAlertCount(openBills.length);
    } catch {
      setTenantBillingAlertCount(0);
    }
    try {
      const res = await api.get('/maintenance');
      const open = (res.data || []).filter(
        (item) => !['COMPLETED', 'CANCELLED'].includes(String(item.status || '').toUpperCase())
      ).length;
      setTenantMaintenanceAlertCount(open);
    } catch {
      setTenantMaintenanceAlertCount(0);
    }
}, [isLoggedIn, role]);

useEffect(() => {
  fetchStaffBadges();
  fetchTenantBadges();
}, [fetchStaffBadges, fetchTenantBadges]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    localStorage.removeItem('role');

    setIsLoggedIn(false);
    setRole('');
    setUserDisplayName('');
    setActiveTenancy(0);
    setPendingBookingCount(0);
    setReadyCheckInCount(0);
    setFeedback({ type: 'info', text: 'You have been logged out.' });
    feedbackTimer.current = setTimeout(() => {
          setFeedback({ type: '', text: '' });
          feedbackTimer.current = null;
        }, 1500);
    navigate('/');
  }, [navigate]);

  const fetchPendingBookingCount = useCallback(async () => {
    const currentRole = String(role || '').toUpperCase();
    if (!isLoggedIn || !['ADMIN', 'MANAGER'].includes(currentRole)) {
      setPendingBookingCount(0);
      return;
    }
    try {
      const res = await api.get('/bookings/pending/count');
      setPendingBookingCount(Number(res.data?.count || 0));
    } catch (error) {
      console.error('Failed to fetch pending bookings count', error);
    }
  }, [isLoggedIn, role]);

  const fetchReadyCheckInCount = useCallback(async () => {
    const currentRole = String(role || '').toUpperCase();
    if (!isLoggedIn || !['ADMIN', 'MANAGER'].includes(currentRole)) {
      setReadyCheckInCount(0);
      return;
    }
    try {
      const res = await api.get('/bookings/ready-checkin/count');
      setReadyCheckInCount(Number(res.data?.count || 0));
    } catch (error) {
      console.error('Failed to fetch ready-for-check-in count', error);
    }
  }, [isLoggedIn, role]);

  useEffect(() => {
    fetchPendingBookingCount();
    fetchReadyCheckInCount();
  }, [fetchPendingBookingCount, fetchReadyCheckInCount]);

  useEffect(() => {
    const currentRole = String(role || '').toUpperCase();
    if (!isLoggedIn || !['ADMIN', 'MANAGER'].includes(currentRole)) {
      return;
    }
    const interval = setInterval(() => {
      fetchPendingBookingCount();
      fetchReadyCheckInCount();
    }, 45000);
    return () => clearInterval(interval);
  }, [isLoggedIn, role, fetchPendingBookingCount, fetchReadyCheckInCount]);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail && typeof event.detail.count === 'number') {
        setPendingBookingCount(Number(event.detail.count) || 0);
      } else {
        fetchPendingBookingCount();
      }
    };
    window.addEventListener('pending-bookings:changed', handler);
    return () => window.removeEventListener('pending-bookings:changed', handler);
  }, [fetchPendingBookingCount]);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail && typeof event.detail.count === 'number') {
        setReadyCheckInCount(Number(event.detail.count) || 0);
      } else {
        fetchReadyCheckInCount();
      }
    };
    window.addEventListener('ready-checkin:changed', handler);
    return () => window.removeEventListener('ready-checkin:changed', handler);
  }, [fetchReadyCheckInCount]);

  const menuItems = useMemo(() => {
    const items = [
      {
        key: '/',
        icon: <HomeOutlined />,
        label: 'Home',
      },
    ];

    if (!isLoggedIn) {
      items.push({
        key: '/register',
        icon: <UserAddOutlined />,
        label: 'Register',
      });
    }

    if (isLoggedIn) {
      items.push({
        key: '/notifications',
        icon: <BellOutlined />,
        label: 'Notifications',
      });
      items.push({
        key: '/profile',
        icon: <UserOutlined />,
        label: 'My Profile',
      });
    }

    const withBadge = (text, count) =>
      count > 0 ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>{text}</span>
          <Badge count={count} overflowCount={99} style={{ backgroundColor: '#ff4d4f' }} />
        </span>
      ) : (
        text
      );

    if (isLoggedIn && role === 'TENANT') {
      items.push(
        {
          key: '/online-booking',
          icon: <CalendarOutlined />,
          label: 'Online Booking',
        },
        {
          key: '/my-bookings',
          icon: <BookOutlined />,
          label: withBadge('My Bookings', tenantBookingAlertCount),
        },
        {
          key: '/my-billing',
          icon: <DollarOutlined />,
          label: withBadge('My Billing', tenantBillingAlertCount),
        }
      );

      if (activeTenancy > 0) {
        items.push({
          key: '/maintenance',
          icon: <ToolOutlined />,
          label: withBadge('Maintenance', tenantMaintenanceAlertCount),
        });
      }
    }

    const normalizedRole = String(role || '').toUpperCase();
    const isStaff = isLoggedIn && ['ADMIN', 'MANAGER'].includes(normalizedRole);

    if (isStaff) {
      const bookingRequestsLabel = withBadge('Bookings', pendingBookingCount);
      const tenancyCheckInLabel = withBadge('Tenancies', readyCheckInCount);
      const maintenanceLabel = withBadge('Maintenance', maintenanceOpenCount);
      const billingLabel = withBadge('Billing', billingPendingCount);

      items.push(
        {
          key: '/browse-rooms',
          icon: <SearchOutlined />,
          label: 'Booking',
        },
        {
          key: '/dashboard',
          icon: <DashboardOutlined />,
          label: 'Dashboard',
        },
        {
          key: '/usermanagement',
          icon: <TeamOutlined />,
          label: 'Users',
        },
        {
          key: '/roommanagement',
          icon: <ApartmentOutlined />,
          label: 'Rooms',
        },
        {
          key: '/bookingmanagement',
          icon: <SolutionOutlined />,
          label: bookingRequestsLabel,
        },
        {
          key: '/tenancymanagement',
          icon: <IdcardOutlined />,
          label: tenancyCheckInLabel,
        },
        {
          key: '/meters',
          icon: <ThunderboltOutlined />,
          label: 'Meters',
        },
        {
          key: '/maintenance',
          icon: <ToolOutlined />,
          label: maintenanceLabel,
        },
        {
          key: '/billing-payments',
          icon: <WalletOutlined />,
          label: billingLabel,
        },
        {
          key: '/activity',
          icon: <HistoryOutlined />,
          label: 'Activity',
        },
        {
          key: '/online-booking',
          icon: <CalendarOutlined />,
          label: 'Online Booking',
        }
      );
    }

    if (isLoggedIn && normalizedRole === 'ADMIN') {
      items.push({
        key: '/settings',
        icon: <SettingOutlined />,
        label: 'Settings',
      });
    }

    return items;
  }, [
    isLoggedIn,
    role,
    activeTenancy,
    pendingBookingCount,
    readyCheckInCount,
    maintenanceOpenCount,
    billingPendingCount,
    tenantBookingAlertCount,
    tenantBillingAlertCount,
    tenantMaintenanceAlertCount,
  ]);

  const selectedKeys = useMemo(() => {
    const path = location.pathname || '/';
    return [path === '' ? '/' : path];
  }, [location.pathname]);

  const handleNavigate = useCallback(
    (key) => {
      if (key && location.pathname !== key) {
        navigate(key);
      }
    },
    [navigate, location.pathname]
  );

  const contentPadding = isMobile ? 16 : 24;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Navbar
        isLoggedIn={isLoggedIn}
        userDisplayName={userDisplayName}
        onLogin={handleLogin}
        onLogout={handleLogout}
        loading={authLoading}
        isMobile={isMobile}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onToggleDrawer={toggleDrawer}
      />
      <Layout>
        {!isMobile && (
          <Sidebar
            items={menuItems}
            selectedKeys={selectedKeys}
            collapsed={collapsed}
            onNavigate={handleNavigate}
          />
        )}
        <Layout
          style={{
            background: '#f5f5f5',
            minHeight: isMobile ? 'auto' : 'calc(100vh - 64px)',
          }}
        >
          <Content
            style={{
              margin: contentPadding,
              padding: contentPadding,
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)',
            }}
          >
            {feedback.text && (
              <Alert
                closable
                showIcon
                type={feedback.type || 'info'}
                message={feedback.text}
                style={{ marginBottom: 16 }}
                onClose={() => {
                  setFeedback({ type: '', text: '' });
                  if (feedbackTimer.current) {
                    clearTimeout(feedbackTimer.current);
                    feedbackTimer.current = null;
                  }
                }}
              />
            )}
            <Outlet />
          </Content>
        </Layout>
      </Layout>
      <Drawer
        placement="left"
        width={280}
        open={drawerOpen}
        onClose={closeDrawer}
        styles={{
        header: { padding: 0 },
        body: { padding: 0 },
  }}
      >
        {menuItems.length ? (
          <Sidebar
            items={menuItems}
            selectedKeys={selectedKeys}
            variant="mobile"
            onNavigate={(key) => {
              handleNavigate(key);
              closeDrawer();
            }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">No options available</Text>}
            style={{ marginTop: 64 }}
          />
        )}
      </Drawer>
    </Layout>
  );
};

export default AppLayout;
