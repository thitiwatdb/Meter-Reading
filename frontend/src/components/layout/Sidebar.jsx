import { Layout, Menu } from 'antd';

const { Sider } = Layout;

const Sidebar = ({
  items,
  selectedKeys,
  onNavigate,
  collapsed = false,
  variant = 'desktop',
}) => {
  const handleClick = ({ key }) => {
    if (onNavigate) {
      onNavigate(key);
    }
  };

  if (variant === 'mobile') {
    return (
      <Menu
        mode="inline"
        items={items}
        selectedKeys={selectedKeys}
        onClick={handleClick}
        style={{ borderRight: 0 }}
      />
    );
  }

  return (
    <Sider
      collapsed={collapsed}
      collapsible
      trigger={null}
      width={240}
      breakpoint="lg"
      style={{
        background: '#fff',
        borderRight: '1px solid #f0f0f0',
        boxShadow: collapsed ? 'none' : '2px 0 8px rgba(0,0,0,0.05)',
        position: 'sticky',
        top: 64,
        height: 'calc(100vh - 64px)',
        overflowY: 'auto',
      }}
    >
      <Menu
        mode="inline"
        items={items}
        selectedKeys={selectedKeys}
        onClick={handleClick}
        style={{ height: '100%', borderRight: 0 }}
      />
    </Sider>
  );
};

export default Sidebar;
